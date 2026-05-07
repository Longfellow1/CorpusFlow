type TargetResult = {
  ok: boolean;
  status?: number;
  elapsedMs: number;
  error?: string;
};

const DEFAULT_URLS = [
  "https://corpusflow-demo.pages.dev",
  "https://corpusflow-app.onrender.com/api/health",
  "https://corpusflow-algorithm.onrender.com/health",
];

const urls = (process.env.KEEPALIVE_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const targets = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : urls.length > 0
    ? urls
    : DEFAULT_URLS;

const startHour = Number(process.env.KEEPALIVE_START_HOUR || 9);
const endHour = Number(process.env.KEEPALIVE_END_HOUR || 21);
const intervalMinutes = Number(process.env.KEEPALIVE_INTERVAL_MINUTES || 15);
const requestTimeoutMs = Number(process.env.KEEPALIVE_TIMEOUT_MS || 60_000);

function isWithinWindow(date = new Date()) {
  const hour = date.getHours();
  return hour >= startHour && hour < endHour;
}

function timestamp() {
  return new Date().toISOString();
}

async function ping(url: string): Promise<TargetResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runOnce() {
  if (!isWithinWindow()) {
    console.log(`[${timestamp()}] outside keepalive window ${startHour}:00-${endHour}:00, skipping`);
    return;
  }

  console.log(`[${timestamp()}] keepalive ping ${targets.length} target(s)`);
  for (const target of targets) {
    const result = await ping(target);
    const status = result.status ? ` status=${result.status}` : "";
    const error = result.error ? ` error=${result.error}` : "";
    console.log(
      `[${timestamp()}] ${result.ok ? "ok" : "fail"} ${target}${status} time=${result.elapsedMs}ms${error}`,
    );
  }
}

async function main() {
  console.log(`[${timestamp()}] keepalive started`);
  console.log(`[${timestamp()}] window=${startHour}:00-${endHour}:00 interval=${intervalMinutes}m`);
  console.log(targets.map((target) => `- ${target}`).join("\n"));

  await runOnce();
  setInterval(() => {
    void runOnce();
  }, intervalMinutes * 60_000);
}

void main();
