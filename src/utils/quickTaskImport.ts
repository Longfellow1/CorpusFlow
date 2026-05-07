export type QuickTaskKind = "qa" | "instruct" | "multi";

export type QuickTaskRow = {
  query?: string;
  input?: string;
  output?: string;
  instruction?: string;
  system?: string;
  history?: string;
  raw: Record<string, string>;
};

export type QuickTaskParsedFile = {
  kind: QuickTaskKind;
  headers: string[];
  columns: {
    query?: string;
    input?: string;
    output?: string;
    instruction?: string;
    system?: string;
    history?: string;
  };
  rows: QuickTaskRow[];
  warnings: string[];
};

const INSTRUCTION_ALIASES = ["instruction", "query", "question", "userquery", "用户问题", "问题", "prompt"];
const QUERY_ALIASES = INSTRUCTION_ALIASES;
const INPUT_ALIASES = ["input", "context", "content", "材料"];
const OUTPUT_ALIASES = ["output", "out", "answer", "response", "assistant", "label", "outpu"];
const SYSTEM_ALIASES = ["system", "role", "persona", "角色设定"];
const HISTORY_ALIASES = ["history", "conversation", "messages"];
const HEADER_ALIAS_GROUPS = [
  INSTRUCTION_ALIASES,
  INPUT_ALIASES,
  OUTPUT_ALIASES,
  SYSTEM_ALIASES,
  HISTORY_ALIASES,
];

function cleanHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function toStringCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return String(value).trim();
}

function findHeader(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => ({ raw: header, key: cleanHeader(header) }));
  const matched = normalized.find((header) => aliases.includes(header.key));
  return matched?.raw;
}

function scoreHeaders(headers: string[]) {
  const normalized = headers.map(cleanHeader);
  return HEADER_ALIAS_GROUPS.reduce((score, aliases) => (
    aliases.some((alias) => normalized.includes(alias)) ? score + 1 : score
  ), 0);
}

function getMappedCell(raw: Record<string, string>, aliases: string[]) {
  const header = findHeader(Object.keys(raw), aliases);
  return header ? raw[header] || "" : "";
}

export function detectQuickTaskKindFromHeaders(headers: string[]): QuickTaskKind {
  const normalized = headers.map(cleanHeader);
  const hasInput = INPUT_ALIASES.some((alias) => normalized.includes(alias));
  const hasOutput = OUTPUT_ALIASES.some((alias) => normalized.includes(alias));
  const hasInstruction = INSTRUCTION_ALIASES.some((alias) => normalized.includes(alias));
  if (hasInput && hasOutput) {
    return "instruct";
  }
  if (hasInstruction) {
    return "instruct";
  }
  if (hasOutput) {
    return "instruct";
  }
  return "qa";
}

export function normalizeQuickTaskRows(rows: Record<string, unknown>[], kind: QuickTaskKind): QuickTaskRow[] {
  return rows
    .map((row) => {
      const raw = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, toStringCell(value)]),
      ) as Record<string, string>;

      if (kind === "instruct") {
        return {
          input: getMappedCell(raw, INPUT_ALIASES),
          output: getMappedCell(raw, OUTPUT_ALIASES),
          instruction: getMappedCell(raw, INSTRUCTION_ALIASES),
          system: getMappedCell(raw, SYSTEM_ALIASES),
          history: getMappedCell(raw, HISTORY_ALIASES),
          raw,
        } satisfies QuickTaskRow;
      }

      return {
        query: getMappedCell(raw, QUERY_ALIASES) || getMappedCell(raw, INPUT_ALIASES),
        raw,
      } satisfies QuickTaskRow;
    })
    .filter((row) => {
      if (kind === "instruct") {
        return Boolean(row.input?.trim()) || Boolean(row.output?.trim()) || Boolean(row.instruction?.trim());
      }
      return Boolean(row.query?.trim());
    });
}

function parseJsonRows(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  }
  if (parsed && typeof parsed === "object") {
    const candidate = (parsed as { data?: unknown }).data;
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
    }
  }
  throw new Error("JSON 文件必须是数组或包含 data 数组");
}

function parseDelimitedRows(text: string, delimiter: "," | "\t"): Record<string, unknown>[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row = [...row, current];
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      rows.push([...row, current]);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current || row.length > 0) {
    rows.push([...row, current]);
  }

  const [headers = [], ...dataRows] = rows.filter((cells) => cells.some((cell) => cell.trim()));
  return dataRows.map((cells) => (
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? ""]))
  ));
}

function worksheetToRows(worksheet: import("exceljs").Worksheet): { score: number; rows: Record<string, unknown>[] } {
  const maxHeaderRow = Math.min(worksheet.rowCount, 10);
  let best = {
    rowNumber: 1,
    headers: Array.from({ length: worksheet.columnCount }, (_, index) => worksheet.getRow(1).getCell(index + 1).text.trim()),
    score: 0,
  };

  for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = Array.from({ length: worksheet.columnCount }, (_, index) => row.getCell(index + 1).text.trim());
    const score = scoreHeaders(headers);
    if (score > best.score) {
      best = { rowNumber, headers, score };
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (let rowNumber = best.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Object.fromEntries(
      best.headers.map((header, index) => [header, row.getCell(index + 1).text.trim()]),
    );
    if (Object.values(values).some(Boolean)) {
      rows.push(values);
    }
  }

  return { score: best.score, rows };
}

async function parseXlsxRows(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  await workbook.xlsx.load(buffer);
  const candidates = workbook.worksheets.map(worksheetToRows);
  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.rows.length - left.rows.length;
  });
  return candidates[0]?.rows ?? [];
}

export function resolveQuickImportSystemTemplate(rows: QuickTaskRow[], currentTemplate: string): string {
  const firstSystem = rows.find((row) => row.system?.trim())?.system?.trim();
  return firstSystem || currentTemplate;
}

function inferKindAndColumns(rows: Record<string, unknown>[]) {
  const headers = rows.length > 0 ? Object.keys(rows[0] || {}) : [];
  const kind = detectQuickTaskKindFromHeaders(headers);
  const columns = {
    query: findHeader(headers, QUERY_ALIASES),
    input: findHeader(headers, INPUT_ALIASES),
    output: findHeader(headers, OUTPUT_ALIASES),
    instruction: findHeader(headers, INSTRUCTION_ALIASES),
    system: findHeader(headers, SYSTEM_ALIASES),
    history: findHeader(headers, HISTORY_ALIASES),
  };
  return { kind, columns };
}

export async function parseQuickTaskFile(file: File): Promise<QuickTaskParsedFile> {
  const name = file.name.toLowerCase();
  let rows: Record<string, unknown>[] = [];

  if (name.endsWith(".json")) {
    rows = parseJsonRows(await file.text());
  } else if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    const text = await file.text();
    rows = parseDelimitedRows(text, name.endsWith(".tsv") ? "\t" : ",");
  } else if (name.endsWith(".xlsx")) {
    const buffer = await file.arrayBuffer();
    rows = await parseXlsxRows(buffer);
  } else {
    throw new Error("只支持 xlsx、csv、tsv、json 文件");
  }

  const { kind, columns } = inferKindAndColumns(rows);
  const normalized = normalizeQuickTaskRows(rows, kind);
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push("文件里没有可用数据");
  }
  if (kind === "qa" && !columns.query) {
    warnings.push("未找到 query 列，已按首列文本尝试解析");
  }
  if (kind === "instruct" && (!columns.input || !columns.output)) {
    warnings.push("未完整识别 input/output 列，已尝试自动映射");
  }

  return {
    kind,
    headers: rows.length > 0 ? Object.keys(rows[0] || {}) : [],
    columns,
    rows: normalized,
    warnings,
  };
}

export function buildQuickTaskSeedText(row: QuickTaskRow, kind: QuickTaskKind): string {
  switch (kind) {
    case "instruct":
      return buildQuickTaskInstructionText(row);
    case "multi":
      return row.query || row.input || "";
    default: // qa
      return row.query || row.input || row.output || row.instruction || "";
  }
}

export function buildQuickTaskInstructionText(row: QuickTaskRow): string {
  return row.instruction?.trim() || row.query?.trim() || row.input?.trim() || "";
}

export function buildQuickTaskInputText(row: QuickTaskRow): string {
  const instruction = buildQuickTaskInstructionText(row);
  const input = row.input?.trim() || "";
  return input && input !== instruction ? input : "";
}

export function buildQuickTaskSystemText(row: QuickTaskRow, fallbackSystem: string): string {
  return row.system?.trim() || fallbackSystem.trim();
}
