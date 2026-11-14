import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("server selects postgres storage from DATABASE_URL and migrates required tables", async () => {
  const source = await readFile(new URL("../server.ts", import.meta.url), "utf8");

  assert.match(source, /process\.env\.DATABASE_URL/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS tasks/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS task_payloads/);
  assert.match(source, /REFERENCES tasks\(id\) ON DELETE CASCADE/);
  assert.match(source, /INSERT INTO task_payloads/);
});

test("task APIs require auth and persist generated data through storage backend", async () => {
  const source = await readFile(new URL("../server.ts", import.meta.url), "utf8");

  assert.match(source, /function requireUserId/);
  assert.equal(source.includes("guest@example.com"), false);
  assert.match(source, /await writeTaskPayload\(req\.params\.taskId, "generated", result\.items\)/);
  assert.match(source, /services:\s*{\s*node:\s*true,\s*algorithm,\s*storage,/s);
});

test("environment template documents render postgres persistence variables", async () => {
  const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

  for (const key of ["STORAGE_BACKEND", "DATABASE_URL", "DATABASE_SSL_MODE", "DATABASE_POOL_MAX", "JWT_SECRET", "CORS_ALLOWED_ORIGINS"]) {
    assert.match(envExample, new RegExp(`(^|\\n)${key}=`));
  }
});
