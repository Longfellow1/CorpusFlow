import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const JWT_SECRET = process.env.JWT_SECRET || "corpusflow-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "7d";
let ALGORITHM_BASE = process.env.ALGORITHM_BASE_URL || "http://127.0.0.1:8001";
const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

async function resolveAlgorithmBase(): Promise<string> {
  if (process.env.ALGORITHM_BASE_URL) return process.env.ALGORITHM_BASE_URL;
  const portFile = path.join(DATA_DIR, "algorithm.port");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, "utf-8").trim();
      if (port && !isNaN(Number(port))) return `http://127.0.0.1:${port}`;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return "http://127.0.0.1:8001";
}
const PORT = Number(process.env.PORT || 3000);

type Task = {
  id: string;
  userId: string;
  name: string;
  time: string;
  status: "running" | "completed" | "idle";
  active?: boolean;
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
  }
}

function isAllowedOrigin(origin: string): boolean {
  if (EXTRA_ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)?corpusflow-demo\.pages\.dev$/i.test(origin)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(origin)) return true;
  return false;
}

function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function escapeCsvField(val: unknown): string {
  const s = String(val ?? "");
  // 防公式注入：以 = + - @ 开头的加前缀单引号
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  // RFC 4180：含逗号、双引号、换行的字段用双引号包裹，内部双引号翻倍
  return `"${safe.replace(/"/g, '""')}"`;
}

const fileLocks = new Map<string, Promise<void>>();

async function writeJsonFileLocked(file: string, value: unknown): Promise<void> {
  const prev = fileLocks.get(file) ?? Promise.resolve();
  let resolve!: () => void;
  const current = new Promise<void>((r) => { resolve = r; });
  fileLocks.set(file, current);
  await prev;
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } finally {
    resolve();
    if (fileLocks.get(file) === current) fileLocks.delete(file);
  }
}

function getUserIdFromAuth(req: express.Request): string {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return "guest@example.com";
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return "guest@example.com";
  }
}

function listTasks(userId: string) {
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  return tasks.filter((task) => task.userId === userId);
}

function saveTasks(tasks: Task[]) {
  writeJsonFile(TASKS_FILE, tasks);
}

function getSeedFile(taskId: string) {
  return path.join(DATA_DIR, `seeds_${taskId}.json`);
}

function getGeneratedFile(taskId: string) {
  return path.join(DATA_DIR, `gen_${taskId}.json`);
}

function getWorkspaceFile(taskId: string) {
  return path.join(DATA_DIR, `workspace_${taskId}.json`);
}

function assertTaskOwner(taskId: string, userId: string, res: express.Response): boolean {
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.userId !== userId) {
    res.status(403).json({ error: "禁止访问" });
    return false;
  }
  return true;
}

async function callAlgorithm<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${ALGORITHM_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algorithm service error ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

async function postAlgorithmControl<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${ALGORITHM_BASE}${endpoint}`, { method: "POST" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algorithm service error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

async function startServer() {
  ensureDataDir();
  ALGORITHM_BASE = await resolveAlgorithmBase();
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    return next();
  });

  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", async (_req, res) => {
    let algorithm = { ok: false, baseUrl: ALGORITHM_BASE };
    try {
      const response = await fetch(`${ALGORITHM_BASE}/health`);
      algorithm = { ok: response.ok, baseUrl: ALGORITHM_BASE };
    } catch {
      algorithm = { ok: false, baseUrl: ALGORITHM_BASE };
    }

    res.json({
      ok: true,
      services: {
        node: true,
        algorithm,
      },
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "有效的 email 是必填项" });
    }
    const token = jwt.sign({ sub: email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({
      token,
      user: { id: email, email, displayName: email },
    });
  });

  app.get("/api/tasks", (req, res) => {
    const userId = getUserIdFromAuth(req);
    return res.json(listTasks(userId));
  });

  app.post("/api/tasks", (req, res) => {
    const userId = getUserIdFromAuth(req);
    const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
    const now = new Date();
    const task: Task = {
      id: `task-${Date.now()}`,
      userId,
      name: String(req.body?.name || `新任务-${now.toLocaleTimeString()}`),
      time: now.toISOString().split("T")[0],
      status: "idle",
      businessType: req.body?.businessType || "evaluation",
      workMode: req.body?.workMode || "advanced",
    };
    const updated = [
      task,
      ...allTasks.map((item) =>
        item.userId === userId ? { ...item, active: false } : item,
      ),
    ];
    saveTasks(updated);
    return res.json(task);
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const userId = getUserIdFromAuth(req);
    const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
    const task = allTasks.find((item) => item.id === req.params.id && item.userId === userId);
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    const name = String(req.body?.name || "").trim();
    if (name.length < 1 || name.length > 80) {
      return res.status(400).json({ error: "任务名称长度需为 1-80 个字符" });
    }
    const updatedTask = { ...task, name };
    saveTasks(allTasks.map((item) => (item.id === task.id ? updatedTask : item)));
    return res.json(updatedTask);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const userId = getUserIdFromAuth(req);
    const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
    const nextTasks = allTasks.filter(
      (task) => !(task.userId === userId && task.id === req.params.id),
    );
    saveTasks(nextTasks);
    const seedFile = getSeedFile(req.params.id);
    const genFile = getGeneratedFile(req.params.id);
    const workspaceFile = getWorkspaceFile(req.params.id);
    if (fs.existsSync(seedFile)) fs.unlinkSync(seedFile);
    if (fs.existsSync(genFile)) fs.unlinkSync(genFile);
    if (fs.existsSync(workspaceFile)) fs.unlinkSync(workspaceFile);
    return res.json({ success: true });
  });

  app.get("/api/tasks/:taskId/seeds", (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    return res.json(readJsonFile(getSeedFile(req.params.taskId), []));
  });

  app.post("/api/tasks/:taskId/seeds", async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;

    // Validate seeds input
    const seeds = req.body;
    if (!Array.isArray(seeds)) {
      return res.status(400).json({ error: "seeds 必须是数组" });
    }
    if (seeds.length > 500) {
      return res.status(400).json({ error: "seeds 数量不能超过 500 条" });
    }

    await writeJsonFileLocked(getSeedFile(req.params.taskId), req.body);
    return res.json(req.body);
  });

  app.get("/api/tasks/:taskId/generated", (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    return res.json(readJsonFile(getGeneratedFile(req.params.taskId), []));
  });

  app.post("/api/tasks/:taskId/generated", async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    await writeJsonFileLocked(getGeneratedFile(req.params.taskId), req.body);
    return res.json(req.body);
  });

  app.get("/api/tasks/:taskId/workspace", (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    return res.json(readJsonFile(getWorkspaceFile(req.params.taskId), null));
  });

  app.post("/api/tasks/:taskId/workspace", async (req, res) => {
    const userId = getUserIdFromAuth(req);
    if (!assertTaskOwner(req.params.taskId, userId, res)) return;
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "workspace 必须是对象" });
    }
    await writeJsonFileLocked(getWorkspaceFile(req.params.taskId), req.body);
    return res.json(req.body);
  });

  app.post("/api/algorithm/analyze", async (req, res) => {
    try {
      const result = await callAlgorithm("/analyze", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务分析失败" });
    }
  });

  app.post("/api/algorithm/paraphrases", async (req, res) => {
    try {
      const result = await callAlgorithm("/paraphrases", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务仿写失败" });
    }
  });

  app.post("/api/algorithm/expand", async (req, res) => {
    try {
      const result = await callAlgorithm("/expand", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务实体扩写失败" });
    }
  });

  app.post("/api/algorithm/qa", async (req, res) => {
    try {
      const result = await callAlgorithm("/qa", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务问答生成失败" });
    }
  });

  app.post("/api/algorithm/instruct", async (req, res) => {
    try {
      const result = await callAlgorithm("/instruct", req.body);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务指令生成失败" });
    }
  });

  app.post("/api/algorithm/quick-generate", async (req, res) => {
    const controller = new AbortController();
    let completed = false;
    req.on("aborted", () => {
      if (!completed) controller.abort();
    });
    res.on("close", () => {
      if (!completed) controller.abort();
    });
    try {
      const result = await callAlgorithm("/quick-generate", req.body, controller.signal);
      completed = true;
      return res.json(result);
    } catch (error) {
      completed = true;
      if (error instanceof Error && error.name === "AbortError") {
        return res.status(499).json({ error: "快速生成已暂停" });
      }
      console.error(error);
      // Surface 422 validation errors directly to the client
      const msg = error instanceof Error ? error.message : "";
      const match422 = msg.match(/Algorithm service error 422: (.*)/s);
      if (match422) {
        try {
          const detail = JSON.parse(match422[1]);
          return res.status(422).json(detail);
        } catch {
          return res.status(422).json({ error: match422[1] });
        }
      }
      return res.status(502).json({ error: "算法服务快速生成失败" });
    }
  });

  app.post("/api/algorithm/quick-generate/:jobId/pause", async (req, res) => {
    try {
      const result = await postAlgorithmControl(`/quick-generate/${encodeURIComponent(req.params.jobId)}/cancel`);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务暂停失败" });
    }
  });

  app.get("/api/algorithm/progress/:jobId", async (req, res) => {
    try {
      const response = await fetch(
        `${ALGORITHM_BASE}/progress/${req.params.jobId}`
      );
      if (!response.ok) {
        return res
          .status(response.status)
          .json({ error: "任务不存在或已清理" });
      }
      const result = await response.json();
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "无法连接算法服务" });
    }
  });

  app.post("/api/tasks/:taskId/generate", async (req, res) => {
    try {
      const result = await callAlgorithm<any>("/generate", req.body);
      writeJsonFile(getGeneratedFile(req.params.taskId), result.items);
      return res.json(result);
    } catch (error) {
      console.error(error);
      return res.status(502).json({ error: "算法服务批量生成失败" });
    }
  });

  app.post("/api/tasks/:taskId/export", (req, res) => {
    const { format = "json", items = [] } = req.body || {};

    const toMultiRecord = (item: any) => {
      const conversations = item.conversations || [
        { from: "human", value: item.history?.[0]?.content ?? "" },
        { from: "gpt", value: item.history?.[1]?.content ?? "" },
        { from: "human", value: item.currentQuery ?? item.q ?? "" },
        { from: "gpt", value: item.response ?? item.a ?? "" },
      ];
      return {
        history: item.history ?? [
          { role: "user", content: conversations[0]?.value ?? "" },
          { role: "assistant", content: conversations[1]?.value ?? "" },
        ],
        currentQuery: item.currentQuery ?? conversations[2]?.value ?? item.q ?? "",
        response: item.response ?? conversations[3]?.value ?? item.a ?? "",
        conversations,
      };
    };

    const toLlamaFactoryHistory = (item: any) => {
      if (Array.isArray(item.history) && item.history.length >= 2) {
        const pairs = [];
        for (let index = 0; index + 1 < item.history.length; index += 2) {
          pairs.push([item.history[index]?.content ?? "", item.history[index + 1]?.content ?? ""]);
        }
        return pairs.filter(([query, answer]) => query || answer);
      }
      if (Array.isArray(item.conversations) && item.conversations.length >= 2) {
        const pairs = [];
        for (let index = 0; index + 1 < item.conversations.length - 1; index += 2) {
          pairs.push([item.conversations[index]?.value ?? "", item.conversations[index + 1]?.value ?? ""]);
        }
        return pairs.filter(([query, answer]) => query || answer);
      }
      return [];
    };

    const toInstructRecord = (item: any) => {
      const history = toLlamaFactoryHistory(item);
      return {
        ...(item.system ? { system: item.system } : {}),
        instruction: item.instruction ?? "",
        input: item.input ?? "",
        output: item.output ?? item.a ?? "",
        ...(history.length > 0 ? { history } : {}),
      };
    };

    let content: string;
    const list = Array.isArray(items) ? items as any[] : [];
    const allSingle = list.length > 0 && list.every((item: any) => item.type !== "multi" && item.type !== "instruct" && item.type !== "code");
    const allMulti = list.length > 0 && list.every((item: any) => item.type === "multi");
    const allInstruct = list.length > 0 && list.every((item: any) => item.type === "instruct" || item.type === "code");
    if (format === "jsonl") {
      content = list.map((item: any) => {
        let record: Record<string, unknown>;
        if (item.type === "multi") {
          record = toMultiRecord(item);
        } else if (item.type === "instruct" || item.type === "code") {
          record = toInstructRecord(item);
        } else {
          // qa / single
          record = {
            instruction: "",
            input: item.q ?? "",
            output: item.a ?? "",
          };
        }
        return JSON.stringify(record);
      }).join("\n");
    } else if (format === "csv") {
      if (allSingle) {
        content = "Type,Question,Answer\n" +
          list.map((item: any) => [item.type || "single", item.q ?? "", item.a ?? ""].map(escapeCsvField).join(",")).join("\n");
      } else if (allMulti) {
        content = "Type,History,CurrentQuery,Response\n" +
          list.map((item: any) => {
            const record = toMultiRecord(item);
            return [
              item.type,
              record.history.map((turn: any) => `${turn.role}: ${turn.content}`).join("\n"),
              record.currentQuery,
              record.response,
            ].map(escapeCsvField).join(",");
          }).join("\n");
      } else if (allInstruct) {
        content = "Type,System,Instruction,Input,Output,History\n" +
          list.map((item: any) => {
            const record = toInstructRecord(item);
            const history = Array.isArray((record as any).history)
              ? (record as any).history.map((turn: any) => `${turn[0]} => ${turn[1]}`).join("\n")
              : "";
            return [item.type, record.system ?? "", record.instruction, record.input, record.output, history].map(escapeCsvField).join(",");
          }).join("\n");
      } else {
        content = "Type,System,Instruction,Input,Output,History\n" +
        list.map((item: any) => {
          if (item.type === "multi") {
            const record = toMultiRecord(item);
            return [
              item.type,
              "",
              record.currentQuery,
              "",
              record.response,
              record.history.map((turn: any) => `${turn.role}: ${turn.content}`).join("\n"),
            ].map(escapeCsvField).join(",");
          }
          if (item.type === "instruct" || item.type === "code") {
            const record = toInstructRecord(item);
            const history = Array.isArray((record as any).history)
              ? (record as any).history.map((turn: any) => `${turn[0]} => ${turn[1]}`).join("\n")
              : "";
            return [item.type, record.system ?? "", record.instruction, record.input, record.output, history].map(escapeCsvField).join(",");
          }
          return [item.type, "", item.q ?? "", "", item.a ?? "", ""].map(escapeCsvField).join(",");
        }).join("\n");
      }
    } else {
      // JSON export - strip metadata fields (id, seedIndex, type)
      const cleanedItems = list.map((item: any) => {
        if (item.type === "multi") {
          return toMultiRecord(item);
        }
        if (item.type === "instruct" || item.type === "code") {
          return toInstructRecord(item);
        }
        // qa / single
        return {
          instruction: "",
          input: item.q ?? "",
          output: item.a ?? "",
        };
      });
      content = JSON.stringify(cleanedItems, null, 2);
    }

    res.json({
      format,
      recordCount: Array.isArray(items) ? items.length : 0,
      content,
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data/**", "**/dist/**"],
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Node backend running on http://localhost:${PORT}`);
    console.log(`Algorithm service expected at ${ALGORITHM_BASE}`);
  });
}

startServer();
