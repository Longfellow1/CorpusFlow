import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import type { Pool } from "pg";
import {
  attachAssetPackage,
  attachPreview,
  createDemoEvaluationSnapshot,
  createEvaluationSnapshotFromRows,
  serializeEvalAssetFile,
  setClusterStatus,
  updateClusterStrategy,
  type ClusterDecisionStatus,
  type EvaluationSnapshot,
  type ProblemCluster,
} from "./src/utils/evaluationMode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

const DATA_DIR = path.join(process.cwd(), "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JWT_SECRET = process.env.JWT_SECRET || "corpusflow-dev-secret-change-in-prod";
const JWT_EXPIRES_IN = "7d";
let ALGORITHM_BASE = process.env.ALGORITHM_BASE_URL || "http://127.0.0.1:8001";
type StorageBackend = "file" | "postgres";
const STORAGE_BACKEND: StorageBackend = process.env.STORAGE_BACKEND === "postgres"
  ? "postgres"
  : process.env.STORAGE_BACKEND === "file"
    ? "file"
    : process.env.DATABASE_URL
      ? "postgres"
      : "file";
const PASSWORD_HASH_ITERATIONS = 210_000;
const EVALUATION_ALGORITHM_LLM_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.EVALUATION_LLM_ENABLED || "").toLowerCase(),
);
const EXTRA_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function getAlgorithmPortFileBase(): string | null {
  const portFile = path.join(DATA_DIR, "algorithm.port");
  if (!fs.existsSync(portFile)) return null;
  const port = fs.readFileSync(portFile, "utf-8").trim();
  if (!port || isNaN(Number(port))) return null;
  return `http://127.0.0.1:${port}`;
}

function uniqueAlgorithmBases(values: Array<string | null | undefined>): string[] {
  const bases: string[] = [];
  for (const value of values) {
    if (!value || bases.includes(value)) continue;
    bases.push(value);
  }
  return bases;
}

async function getAlgorithmHealth(baseUrl: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 700);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json() as Record<string, unknown>;
    if (payload?.ok !== true || typeof payload.provider !== "string") return null;
    return payload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveAlgorithmBase(): Promise<string> {
  if (process.env.ALGORITHM_BASE_URL) return process.env.ALGORITHM_BASE_URL;
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const candidates = uniqueAlgorithmBases([
      getAlgorithmPortFileBase(),
      ALGORITHM_BASE,
      "http://127.0.0.1:8001",
      "http://127.0.0.1:8000",
    ]);
    for (const candidate of candidates) {
      const health = await getAlgorithmHealth(candidate);
      if (health) return candidate;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return getAlgorithmPortFileBase() || "http://127.0.0.1:8001";
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
  workMode?: "quick" | "advanced" | "evaluation";
};

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt?: string;
};

type TaskPayloadKind = "seeds" | "generated" | "workspace";

type EvaluationAlgorithmAssetResponse = {
  snapshot?: EvaluationSnapshot;
  package?: EvaluationSnapshot["package"];
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
}

let pgPool: Pool | null = null;

function getPasswordHash(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, iterationsRaw, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !salt || !expectedHash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 100_000) return false;
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function getPgPool() {
  if (pgPool) return pgPool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when STORAGE_BACKEND=postgres");
  }
  const pg = await import("pg");
  const PoolCtor = pg.Pool ?? (pg.default as typeof pg).Pool;
  const sslMode = process.env.DATABASE_SSL_MODE || "auto";
  const useSsl = sslMode === "require" || (sslMode === "auto" && process.env.NODE_ENV === "production");
  pgPool = new PoolCtor({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pgPool;
}

async function initPostgresStorage() {
  const pool = await getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      display_name text NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name text NOT NULL,
      time text NOT NULL,
      status text NOT NULL CHECK (status IN ('running', 'completed', 'idle')),
      active boolean NOT NULL DEFAULT false,
      business_type text CHECK (business_type IN ('evaluation', 'training')),
      work_mode text CHECK (work_mode IN ('quick', 'advanced', 'evaluation')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS tasks_user_id_created_at_idx ON tasks(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_payloads (
      task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('seeds', 'generated', 'workspace')),
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (task_id, kind)
    );
  `);
}

async function initStorage() {
  if (STORAGE_BACKEND === "postgres") {
    await initPostgresStorage();
    return;
  }
  ensureDataDir();
}

async function getStorageHealth() {
  if (STORAGE_BACKEND === "postgres") {
    try {
      const pool = await getPgPool();
      await pool.query("SELECT 1");
      return { ok: true, backend: "postgres" };
    } catch (error) {
      return {
        ok: false,
        backend: "postgres",
        error: error instanceof Error ? error.message : "postgres unavailable",
      };
    }
  }
  try {
    ensureDataDir();
    fs.accessSync(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
    return { ok: true, backend: "file" };
  } catch (error) {
    return {
      ok: false,
      backend: "file",
      error: error instanceof Error ? error.message : "file storage unavailable",
    };
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

function toTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    time: String(row.time),
    status: row.status as Task["status"],
    active: Boolean(row.active),
    businessType: row.business_type as Task["businessType"],
    workMode: row.work_mode as Task["workMode"],
  };
}

function normalizeBusinessType(value: unknown): Task["businessType"] {
  return value === "training" ? "training" : "evaluation";
}

function normalizeWorkMode(value: unknown): Task["workMode"] {
  return value === "quick" || value === "evaluation" ? value : "advanced";
}

async function authenticateOrCreateUser(email: string, password: string): Promise<UserRecord> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    const existing = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      created_at: Date;
    }>(
      "SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = $1",
      [email],
    );
    const current = existing.rows[0];
    if (current) {
      if (current.password_hash === "unclaimed") {
        const passwordHash = getPasswordHash(password);
        await pool.query(
          "UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1",
          [current.id, passwordHash],
        );
        return {
          id: current.id,
          email: current.email,
          displayName: current.display_name,
          passwordHash,
          createdAt: current.created_at.toISOString(),
        };
      }
      if (!verifyPassword(password, current.password_hash)) {
        throw new Error("invalid credentials");
      }
      return {
        id: current.id,
        email: current.email,
        displayName: current.display_name,
        passwordHash: current.password_hash,
        createdAt: current.created_at.toISOString(),
      };
    }

    const user: UserRecord = {
      id: email,
      email,
      displayName: email,
      passwordHash: getPasswordHash(password),
    };
    await pool.query(
      `INSERT INTO users (id, email, display_name, password_hash)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.email, user.displayName, user.passwordHash],
    );
    return user;
  }

  ensureDataDir();
  const users = readJsonFile<UserRecord[]>(USERS_FILE, []);
  const current = users.find((user) => user.email === email);
  if (current) {
    if (!verifyPassword(password, current.passwordHash)) {
      throw new Error("invalid credentials");
    }
    return current;
  }
  const user: UserRecord = {
    id: email,
    email,
    displayName: email,
    passwordHash: getPasswordHash(password),
    createdAt: new Date().toISOString(),
  };
  await writeJsonFileLocked(USERS_FILE, [user, ...users]);
  return user;
}

async function ensureUserExists(userId: string): Promise<void> {
  if (STORAGE_BACKEND !== "postgres") return;
  const pool = await getPgPool();
  await pool.query(
    `INSERT INTO users (id, email, display_name, password_hash)
     VALUES ($1, $1, $1, 'unclaimed')
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  );
}

function getUserIdFromAuth(req: express.Request): string | null {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

function requireUserId(req: express.Request, res: express.Response): string | null {
  const userId = getUserIdFromAuth(req);
  if (!userId) {
    res.status(401).json({ error: "请先登录" });
    return null;
  }
  return userId;
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

function assertRowsPayload(rows: unknown): rows is Record<string, unknown>[] {
  return Array.isArray(rows)
    && rows.length <= 1000
    && rows.every((row) => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

function validateEvaluationStrategyPatch(strategy: Partial<ProblemCluster["recommendedStrategy"]>): string | null {
  if (strategy.assetType !== undefined && !["training_candidates", "eval_cases", "negative_cases"].includes(String(strategy.assetType))) {
    return "assetType 必须是 training_candidates、eval_cases 或 negative_cases";
  }
  if (strategy.schema !== undefined && !["alpaca", "sharegpt_history", "eval_case_jsonl"].includes(String(strategy.schema))) {
    return "schema 必须是 alpaca、sharegpt_history 或 eval_case_jsonl";
  }
  if (strategy.count !== undefined) {
    if (typeof strategy.count !== "number" || !Number.isFinite(strategy.count) || strategy.count < 0 || strategy.count > 200) {
      return "count 必须是 0 到 200 之间的数字";
    }
  }
  if (strategy.solution !== undefined && (typeof strategy.solution !== "string" || strategy.solution.length > 2000)) {
    return "solution 必须是 2000 字以内的字符串";
  }
  if (strategy.strategyTemplate !== undefined && (typeof strategy.strategyTemplate !== "string" || strategy.strategyTemplate.length > 2000)) {
    return "strategyTemplate 必须是 2000 字以内的字符串";
  }
  return null;
}

async function listTasks(userId: string): Promise<Task[]> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    const result = await pool.query(
      `SELECT id, user_id, name, time, status, active, business_type, work_mode
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [userId],
    );
    return result.rows.map((row) => toTask(row));
  }
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  return tasks.filter((task) => task.userId === userId);
}

async function createTask(task: Task): Promise<Task> {
  const nextTask = { ...task, active: true };
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    await ensureUserExists(nextTask.userId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE tasks SET active = false, updated_at = now() WHERE user_id = $1", [task.userId]);
      await client.query(
        `INSERT INTO tasks (id, user_id, name, time, status, active, business_type, work_mode)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
        [
          nextTask.id,
          nextTask.userId,
          nextTask.name,
          nextTask.time,
          nextTask.status,
          nextTask.businessType,
          nextTask.workMode,
        ],
      );
      await client.query("COMMIT");
      return nextTask;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const updated = [
    nextTask,
    ...allTasks.map((item) =>
      item.userId === nextTask.userId ? { ...item, active: false } : item,
    ),
  ];
  await writeJsonFileLocked(TASKS_FILE, updated);
  return nextTask;
}

async function updateTaskName(taskId: string, userId: string, name: string): Promise<Task | null> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    const result = await pool.query(
      `UPDATE tasks
       SET name = $3, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, name, time, status, active, business_type, work_mode`,
      [taskId, userId, name],
    );
    return result.rows[0] ? toTask(result.rows[0]) : null;
  }
  const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const task = allTasks.find((item) => item.id === taskId && item.userId === userId);
  if (!task) return null;
  const updatedTask = { ...task, name };
  await writeJsonFileLocked(TASKS_FILE, allTasks.map((item) => (item.id === task.id ? updatedTask : item)));
  return updatedTask;
}

async function deleteTask(taskId: string, userId: string): Promise<void> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    await pool.query("DELETE FROM tasks WHERE id = $1 AND user_id = $2", [taskId, userId]);
    return;
  }
  const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const nextTasks = allTasks.filter(
    (task) => !(task.userId === userId && task.id === taskId),
  );
  await writeJsonFileLocked(TASKS_FILE, nextTasks);
  const seedFile = getSeedFile(taskId);
  const genFile = getGeneratedFile(taskId);
  const workspaceFile = getWorkspaceFile(taskId);
  if (fs.existsSync(seedFile)) fs.unlinkSync(seedFile);
  if (fs.existsSync(genFile)) fs.unlinkSync(genFile);
  if (fs.existsSync(workspaceFile)) fs.unlinkSync(workspaceFile);
}

async function updateTaskStatus(taskId: string, userId: string, status: Task["status"]) {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    await pool.query(
      "UPDATE tasks SET status = $3, updated_at = now() WHERE id = $1 AND user_id = $2",
      [taskId, userId, status],
    );
    return;
  }
  const allTasks = readJsonFile<Task[]>(TASKS_FILE, []);
  const updated = allTasks.map((task) => (
    task.id === taskId && task.userId === userId ? { ...task, status } : task
  ));
  await writeJsonFileLocked(TASKS_FILE, updated);
}

async function readTaskPayload<T>(taskId: string, kind: TaskPayloadKind, fallback: T): Promise<T> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    const result = await pool.query<{ payload: T }>(
      "SELECT payload FROM task_payloads WHERE task_id = $1 AND kind = $2",
      [taskId, kind],
    );
    return result.rows[0]?.payload ?? fallback;
  }
  const file = kind === "seeds"
    ? getSeedFile(taskId)
    : kind === "generated"
      ? getGeneratedFile(taskId)
      : getWorkspaceFile(taskId);
  return readJsonFile<T>(file, fallback);
}

async function writeTaskPayload(taskId: string, kind: TaskPayloadKind, payload: unknown): Promise<void> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    await pool.query(
      `INSERT INTO task_payloads (task_id, kind, payload, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (task_id, kind)
       DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
      [taskId, kind, JSON.stringify(payload)],
    );
    return;
  }
  const file = kind === "seeds"
    ? getSeedFile(taskId)
    : kind === "generated"
      ? getGeneratedFile(taskId)
      : getWorkspaceFile(taskId);
  await writeJsonFileLocked(file, payload);
}

async function readEvaluationSnapshot(taskId: string) {
  return readTaskPayload<EvaluationSnapshot | null>(taskId, "workspace", null);
}

async function writeEvaluationSnapshot(taskId: string, snapshot: EvaluationSnapshot) {
  await writeTaskPayload(taskId, "workspace", snapshot);
}

async function taskBelongsToUser(taskId: string, userId: string): Promise<boolean> {
  if (STORAGE_BACKEND === "postgres") {
    const pool = await getPgPool();
    const result = await pool.query(
      "SELECT 1 FROM tasks WHERE id = $1 AND user_id = $2 LIMIT 1",
      [taskId, userId],
    );
    return Boolean(result.rows[0]);
  }
  const tasks = readJsonFile<Task[]>(TASKS_FILE, []);
  return tasks.some((task) => task.id === taskId && task.userId === userId);
}

async function assertTaskOwner(taskId: string, userId: string, res: express.Response): Promise<boolean> {
  if (!(await taskBelongsToUser(taskId, userId))) {
    res.status(403).json({ error: "禁止访问" });
    return false;
  }
  return true;
}

async function refreshAlgorithmBaseIfNeeded(): Promise<string> {
  if (process.env.ALGORITHM_BASE_URL) return ALGORITHM_BASE;
  const health = await getAlgorithmHealth(ALGORITHM_BASE);
  if (health) return ALGORITHM_BASE;
  ALGORITHM_BASE = await resolveAlgorithmBase();
  return ALGORITHM_BASE;
}

async function callAlgorithmAt<T>(baseUrl: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
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

async function callAlgorithm<T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const baseUrl = ALGORITHM_BASE;
  try {
    return await callAlgorithmAt<T>(baseUrl, endpoint, payload, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    const nextBaseUrl = await refreshAlgorithmBaseIfNeeded();
    if (nextBaseUrl !== baseUrl) {
      return callAlgorithmAt<T>(nextBaseUrl, endpoint, payload, signal);
    }
    throw error;
  }
}

function isEvaluationSnapshot(value: unknown): value is EvaluationSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<EvaluationSnapshot>;
  return typeof snapshot.taskId === "string"
    && typeof snapshot.sourceFile === "string"
    && typeof snapshot.oneSentenceConclusion === "string"
    && Boolean(snapshot.stats)
    && Array.isArray(snapshot.cases)
    && Array.isArray(snapshot.clusters);
}

async function createEvaluationSnapshotWithAlgorithm(args: {
  taskId: string;
  sourceFile: string;
  rows: Record<string, unknown>[];
}): Promise<EvaluationSnapshot> {
  try {
    const snapshot = await callAlgorithm<EvaluationSnapshot>("/evaluation/analyze", {
      taskId: args.taskId,
      sourceFile: args.sourceFile,
      rows: args.rows,
      llmEnabled: EVALUATION_ALGORITHM_LLM_ENABLED,
    });
    if (isEvaluationSnapshot(snapshot)) return snapshot;
    throw new Error("Algorithm evaluation analyze returned invalid snapshot");
  } catch (error) {
    console.warn("Evaluation algorithm analyze failed; falling back to local rules", error);
    return createEvaluationSnapshotFromRows({
      taskId: args.taskId,
      sourceFile: args.sourceFile,
      rows: args.rows,
      extractionMode: "rule",
    });
  }
}

async function attachEvaluationAssetsWithAlgorithm(snapshot: EvaluationSnapshot, preview: boolean): Promise<EvaluationSnapshot> {
  try {
    const result = await callAlgorithm<EvaluationAlgorithmAssetResponse>("/evaluation/assets", {
      snapshot,
      preview,
      llmEnabled: EVALUATION_ALGORITHM_LLM_ENABLED,
    });
    if (isEvaluationSnapshot(result.snapshot)) return result.snapshot;
    throw new Error("Algorithm evaluation assets returned invalid snapshot");
  } catch (error) {
    console.warn("Evaluation algorithm assets failed; falling back to local rules", error);
    return preview ? attachPreview(snapshot) : attachAssetPackage(snapshot);
  }
}

async function postAlgorithmControlAt<T>(baseUrl: string, endpoint: string): Promise<T> {
  const response = await fetch(`${baseUrl}${endpoint}`, { method: "POST" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Algorithm service error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

async function postAlgorithmControl<T>(endpoint: string): Promise<T> {
  const baseUrl = ALGORITHM_BASE;
  try {
    return await postAlgorithmControlAt<T>(baseUrl, endpoint);
  } catch (error) {
    const nextBaseUrl = await refreshAlgorithmBaseIfNeeded();
    if (nextBaseUrl !== baseUrl) {
      return postAlgorithmControlAt<T>(nextBaseUrl, endpoint);
    }
    throw error;
  }
}

async function startServer() {
  await initStorage();
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
    const storage = await getStorageHealth();
    try {
      const baseUrl = await refreshAlgorithmBaseIfNeeded();
      const health = await getAlgorithmHealth(baseUrl);
      algorithm = { ok: Boolean(health), baseUrl };
    } catch {
      algorithm = { ok: false, baseUrl: ALGORITHM_BASE };
    }

    res.json({
      ok: true,
      services: {
        node: true,
        algorithm,
        storage,
      },
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "有效的 email 是必填项" });
    }
    if (password.length < 3 || password.length > 256) {
      return res.status(400).json({ error: "密码长度需为 3-256 个字符" });
    }
    try {
      const user = await authenticateOrCreateUser(email, password);
      const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      return res.json({
        token,
        user: { id: user.id, email: user.email, displayName: user.displayName },
      });
    } catch {
      return res.status(401).json({ error: "账号或密码错误" });
    }
  });

  app.get("/api/tasks", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    return res.json(await listTasks(userId));
  });

  app.post("/api/tasks", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const now = new Date();
    const task: Task = {
      id: `task-${Date.now()}`,
      userId,
      name: String(req.body?.name || `新任务-${now.toLocaleTimeString()}`),
      time: now.toISOString().split("T")[0],
      status: "idle",
      businessType: normalizeBusinessType(req.body?.businessType),
      workMode: normalizeWorkMode(req.body?.workMode),
    };
    return res.json(await createTask(task));
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const name = String(req.body?.name || "").trim();
    if (name.length < 1 || name.length > 80) {
      return res.status(400).json({ error: "任务名称长度需为 1-80 个字符" });
    }
    const updatedTask = await updateTaskName(req.params.id, userId, name);
    if (!updatedTask) {
      return res.status(404).json({ error: "任务不存在" });
    }
    return res.json(updatedTask);
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    await deleteTask(req.params.id, userId);
    return res.json({ success: true });
  });

  app.get("/api/tasks/:taskId/seeds", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    return res.json(await readTaskPayload(req.params.taskId, "seeds", []));
  });

  app.post("/api/tasks/:taskId/seeds", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;

    // Validate seeds input
    const seeds = req.body;
    if (!Array.isArray(seeds)) {
      return res.status(400).json({ error: "seeds 必须是数组" });
    }
    if (seeds.length > 500) {
      return res.status(400).json({ error: "seeds 数量不能超过 500 条" });
    }

    await writeTaskPayload(req.params.taskId, "seeds", req.body);
    return res.json(req.body);
  });

  app.get("/api/tasks/:taskId/generated", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    return res.json(await readTaskPayload(req.params.taskId, "generated", []));
  });

  app.post("/api/tasks/:taskId/generated", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    await writeTaskPayload(req.params.taskId, "generated", req.body);
    return res.json(req.body);
  });

  app.get("/api/tasks/:taskId/workspace", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    return res.json(await readTaskPayload(req.params.taskId, "workspace", null));
  });

  app.post("/api/tasks/:taskId/workspace", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "workspace 必须是对象" });
    }
    await writeTaskPayload(req.params.taskId, "workspace", req.body);
    return res.json(req.body);
  });

  app.post("/api/evaluation/tasks", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const now = new Date();
    const task: Task = {
      id: `eval-${Date.now()}`,
      userId,
      name: String(req.body?.name || `评测任务-${now.toLocaleTimeString()}`),
      time: now.toISOString().split("T")[0],
      status: "idle",
      businessType: "evaluation",
      workMode: "evaluation",
    };
    return res.json(await createTask(task));
  });

  app.get("/api/evaluation/tasks/:taskId", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    return res.json(await readEvaluationSnapshot(req.params.taskId));
  });

  app.post("/api/evaluation/tasks/:taskId/sample", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const snapshot = createDemoEvaluationSnapshot(req.params.taskId);
    await writeEvaluationSnapshot(req.params.taskId, snapshot);
    await updateTaskStatus(req.params.taskId, userId, "completed");
    return res.json(snapshot);
  });

  app.post("/api/evaluation/tasks/:taskId/parse", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const rows = req.body?.rows;
    if (!assertRowsPayload(rows)) {
      return res.status(400).json({ error: "rows 必须是 1000 条以内的对象数组" });
    }
    const sourceFile = String(req.body?.sourceFile || "uploaded_eval_evidence");
    const snapshot = await createEvaluationSnapshotWithAlgorithm({
      taskId: req.params.taskId,
      sourceFile,
      rows,
    });
    await writeEvaluationSnapshot(req.params.taskId, snapshot);
    await updateTaskStatus(req.params.taskId, userId, "completed");
    return res.json(snapshot);
  });

  app.patch("/api/evaluation/tasks/:taskId/clusters/:clusterId", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const snapshot = await readEvaluationSnapshot(req.params.taskId);
    if (!snapshot) {
      return res.status(404).json({ error: "评测任务尚未解析" });
    }

    let nextSnapshot = snapshot;
    const status = req.body?.status as ClusterDecisionStatus | undefined;
    if (status !== undefined) {
      if (!["accepted", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ error: "status 必须是 accepted、rejected 或 pending" });
      }
      nextSnapshot = setClusterStatus(nextSnapshot, req.params.clusterId, status);
    }

    const strategy = req.body?.strategy as Partial<ProblemCluster["recommendedStrategy"]> | undefined;
    if (strategy !== undefined) {
      if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
        return res.status(400).json({ error: "strategy 必须是对象" });
      }
      const strategyError = validateEvaluationStrategyPatch(strategy);
      if (strategyError) {
        return res.status(400).json({ error: strategyError });
      }
      nextSnapshot = updateClusterStrategy(nextSnapshot, req.params.clusterId, strategy);
    }

    await writeEvaluationSnapshot(req.params.taskId, nextSnapshot);
    return res.json(nextSnapshot);
  });

  app.post("/api/evaluation/tasks/:taskId/preview", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const snapshot = await readEvaluationSnapshot(req.params.taskId);
    if (!snapshot) {
      return res.status(404).json({ error: "评测任务尚未解析" });
    }
    const nextSnapshot = await attachEvaluationAssetsWithAlgorithm(snapshot, true);
    await writeEvaluationSnapshot(req.params.taskId, nextSnapshot);
    return res.json(nextSnapshot);
  });

  app.post("/api/evaluation/tasks/:taskId/package", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const snapshot = await readEvaluationSnapshot(req.params.taskId);
    if (!snapshot) {
      return res.status(404).json({ error: "评测任务尚未解析" });
    }
    const nextSnapshot = await attachEvaluationAssetsWithAlgorithm(snapshot, false);
    await writeEvaluationSnapshot(req.params.taskId, nextSnapshot);
    await updateTaskStatus(req.params.taskId, userId, "completed");
    return res.json(nextSnapshot);
  });

  app.get("/api/evaluation/tasks/:taskId/download/:fileName", async (req, res) => {
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    const snapshot = await readEvaluationSnapshot(req.params.taskId);
    const assetPackage = snapshot?.package;
    if (!snapshot || !assetPackage) {
      return res.status(404).json({ error: "请先生成资产包" });
    }
    try {
      const content = serializeEvalAssetFile(assetPackage, req.params.fileName);
      return res.json({
        fileName: req.params.fileName,
        content,
        recordCount: assetPackage.files[req.params.fileName] ?? 1,
      });
    } catch (error) {
      return res.status(404).json({ error: error instanceof Error ? error.message : "资产文件不存在" });
    }
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
      const baseUrl = await refreshAlgorithmBaseIfNeeded();
      const response = await fetch(
        `${baseUrl}/progress/${req.params.jobId}`
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
    const userId = requireUserId(req, res);
    if (!userId) return;
    if (!(await assertTaskOwner(req.params.taskId, userId, res))) return;
    try {
      const result = await callAlgorithm<any>("/generate", req.body);
      await writeTaskPayload(req.params.taskId, "generated", result.items);
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
