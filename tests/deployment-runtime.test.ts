import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("docker runtime starts the production server instead of vite dev middleware", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };

  assert.equal(dockerfile.includes('CMD ["npm", "run", "dev"]'), false);
  assert.match(dockerfile, /NODE_ENV=production/);
  assert.match(dockerfile, /npm run build:server/);
  assert.equal(packageJson.scripts?.start, "node dist-server/server.js");
  assert.equal(packageJson.scripts?.["build:server"], "tsc -p tsconfig.server.json");
});

test("server does not import vite at production module load time", async () => {
  const source = await readFile(new URL("../server.ts", import.meta.url), "utf8");

  assert.equal(source.includes('import { createServer as createViteServer } from "vite";'), false);
  assert.match(source, /await import\("vite"\)/);
});

test("docker build context excludes local secrets and generated artifacts", async () => {
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");

  for (const entry of [".env", ".env.local", "data", "tmp", "dist-server"]) {
    assert.match(dockerignore, new RegExp(`(^|\\n)${entry.replace(".", "\\.")}(\\n|$)`));
  }
});
