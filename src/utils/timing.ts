export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export async function withMinimumDuration<T>(work: () => Promise<T>, minimumMs: number) {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    const remainingMs = minimumMs - (Date.now() - startedAt);
    if (remainingMs > 0) {
      await sleep(remainingMs);
    }
  }
}
