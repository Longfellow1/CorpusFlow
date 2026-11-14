import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createEvaluationSnapshotFromRows,
  type EvalEvidenceCase,
  type FailureSignal,
} from "../src/utils/evaluationMode";

type RawAuditRow = Record<string, unknown>;
type SignalCount = Partial<Record<FailureSignal, number>>;

export type SignalAuditCase = {
  sourceCaseId: string;
  expectedSignals: FailureSignal[];
  oldSignals: FailureSignal[];
  currentSignals: FailureSignal[];
  subtype: string;
};

export type SignalAuditSummary = {
  totalRows: number;
  labeledRows: number;
  current: {
    expectedRecall: number;
    unknownFailureRate: number;
    bySignal: SignalCount;
    falsePositiveRates: Pick<Record<FailureSignal, number>, "tool_not_called" | "safety_boundary">;
  };
  old: {
    expectedRecall: number;
    unknownFailureRate: number;
    bySignal: SignalCount;
    falsePositiveRates: Pick<Record<FailureSignal, number>, "tool_not_called" | "safety_boundary">;
  };
  focusDeltas: {
    tool_not_called: number;
    safety_boundary: number;
  };
  subtypeDistribution: Record<string, number>;
  cases: SignalAuditCase[];
};

const OLD_SIGNAL_KEYWORDS: Record<FailureSignal, string[]> = {
  memory_missing: ["多轮", "上下文", "history", "memory", "记忆", "上一轮", "承接", "指代", "coreference", "忘记"],
  coreference_failed: ["指代", "那里", "附近", "这个", "那个", "coreference"],
  tool_not_called: ["工具", "查询", "导航", "检索", "未调用", "没调用", "没有调用", "tool", "action missing"],
  wrong_tool: ["错工具", "wrong tool", "工具选择", "落域", "路由", "参数错误", "domain"],
  constraint_missing: ["约束", "遗漏", "漏", "复合", "限制", "条件", "排序", "数量", "只满足", "constraint"],
  weak_answer: ["空泛", "泛化", "弱答", "不具体", "无帮助", "不知道", "含糊", "vague", "generic"],
  negative_emotion: ["负向情绪", "显式负向", "投诉", "抱怨", "体验失败", "情绪识别", "纠偏", "negative emotion", "complaint"],
  safety_boundary: ["安全", "拒识", "拒答", "安全边界", "安全拒识", "高风险", "危险动作", "敏感", "违规", "unsafe", "safety"],
  format_error: ["格式", "schema", "json", "字段", "结构", "解析失败", "format"],
  retrieval_miss: ["检索", "retrieval", "context", "引用", "材料", "知识库", "grounding"],
  unknown_failure: [],
};

function roundScore(value: number) {
  return Number(value.toFixed(4));
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function readJsonl(filePath: string): RawAuditRow[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawAuditRow);
}

export function readSignalAuditRows(files: string[]): RawAuditRow[] {
  return files.flatMap((file) => readJsonl(path.resolve(process.cwd(), file)));
}

function caseText(caseItem: EvalEvidenceCase) {
  return [
    caseItem.interaction.input,
    caseItem.interaction.actualOutput,
    caseItem.expectation.expectedOutput,
    caseItem.context.retrievedContexts.join("\n"),
    caseItem.execution.toolsCalled.join("\n"),
    caseItem.judgments.map((judgment) => judgment.reason).join("\n"),
    caseItem.annotation.failureNote,
  ].join("\n").toLowerCase();
}

function extractSignalsWithKeywords(caseItem: EvalEvidenceCase, keywords: Record<FailureSignal, string[]>) {
  const text = caseText(caseItem);
  const matches = (Object.entries(keywords) as Array<[FailureSignal, string[]]>)
    .filter(([signal, words]) => signal !== "unknown_failure" && words.some((word) => text.includes(word.toLowerCase())))
    .map(([signal]) => signal);
  const unique = [...new Set(matches)];
  return unique.length > 0 ? unique.slice(0, 3) : ["unknown_failure" as FailureSignal];
}

function textFromRow(row: RawAuditRow) {
  const ignoredKeys = new Set(["source_file", "sourceFile", "run_id", "runId"]);
  return Object.entries(row)
    .filter(([key]) => !ignoredKeys.has(key))
    .map(([, value]) => cleanText(value))
    .join("\n")
    .toLowerCase();
}

export function inferExpectedSignals(row: RawAuditRow): FailureSignal[] {
  const dimension = cleanText(row.dimension || row.case_type || row.fail_reason || row.corrected_fail_reason).toLowerCase();
  const text = textFromRow(row);
  const signals: FailureSignal[] = [];

  if (/domain_error|wrong_tool|wrong tool|落域|路由|wrong_mode/.test(`${dimension}\n${text}`)) signals.push("wrong_tool");
  if (/weak_answer|弱答|answer_quality|unusable|空泛|无帮助|fallback/.test(`${dimension}\n${text}`)) signals.push("weak_answer");
  if (/negative_emotion|complaint|投诉|抱怨|负向|听不懂|太慢|打不开|不行/.test(`${dimension}\n${text}`)) signals.push("negative_emotion");
  if (/repetition|multi|memory|上下文|多轮|复询|effective_query|污染/.test(`${dimension}\n${text}`)) signals.push("memory_missing");
  if (/coreference|指代|那里|附近|这个|那个/.test(`${dimension}\n${text}`)) signals.push("coreference_failed");
  if (/format|schema|json|格式/.test(`${dimension}\n${text}`)) signals.push("format_error");
  if (/safety_boundary|高风险|危险动作|安全拒识/.test(`${dimension}\n${text}`)) signals.push("safety_boundary");
  if (/retrieval|grounding|检索|引用|材料/.test(`${dimension}\n${text}`)) signals.push("retrieval_miss");
  if (/tool_not_called|未调用|没有调用|missing tool call|no tool call/.test(`${dimension}\n${text}`)) signals.push("tool_not_called");

  return [...new Set(signals)];
}

function inferSubtype(row: RawAuditRow, expectedSignals: FailureSignal[]) {
  const text = textFromRow(row);
  const dimension = cleanText(row.dimension || row.case_type).toLowerCase();
  if (/wrong_mode/.test(text)) return "wrong_tool.wrong_mode";
  if (/effective_query|污染/.test(text)) return "memory_missing.effective_query_pollution";
  if (/fallback|unusable|空结果|无法获取/.test(text)) return "weak_answer.provider_or_empty_result";
  if (/domain_error/.test(dimension) || /落域/.test(text)) return "wrong_tool.domain_mismatch";
  if (/complaint|投诉|抱怨/.test(`${dimension}\n${text}`)) return "negative_emotion.complaint";
  if (/negative_emotion|负向|听不懂|打不开/.test(`${dimension}\n${text}`)) return "negative_emotion.explicit_negative";
  if (/repetition|复询/.test(`${dimension}\n${text}`)) return "memory_missing.repetition";
  if (/coreference|指代|那里|附近|这个|那个/.test(`${dimension}\n${text}`)) return "coreference_failed.reference_resolution";
  if (expectedSignals[0]) return `${expectedSignals[0]}.generic`;
  return "unlabeled";
}

export function compareSignalRules(rows: RawAuditRow[], sourceFile: string): SignalAuditCase[] {
  const snapshot = createEvaluationSnapshotFromRows({
    taskId: "signal-audit",
    sourceFile,
    rows,
    now: "2026-05-25T00:00:00.000Z",
  });

  return snapshot.cases.map((caseItem, index) => {
    const row = rows[index] || {};
    const expectedSignals = inferExpectedSignals(row);
    return {
      sourceCaseId: caseItem.sourceCaseId,
      expectedSignals,
      oldSignals: extractSignalsWithKeywords(caseItem, OLD_SIGNAL_KEYWORDS),
      currentSignals: caseItem.annotation.tags as FailureSignal[],
      subtype: inferSubtype(row, expectedSignals),
    };
  });
}

function countSignals(cases: SignalAuditCase[], key: "oldSignals" | "currentSignals") {
  return cases.reduce<SignalCount>((acc, item) => {
    item[key].forEach((signal) => {
      acc[signal] = (acc[signal] || 0) + 1;
    });
    return acc;
  }, {});
}

function expectedRecall(cases: SignalAuditCase[], key: "oldSignals" | "currentSignals") {
  const labeled = cases.filter((item) => item.expectedSignals.length > 0);
  if (labeled.length === 0) return 1;
  const hit = labeled.filter((item) => item.expectedSignals.some((signal) => item[key].includes(signal))).length;
  return hit / labeled.length;
}

function unknownFailureRate(cases: SignalAuditCase[], key: "oldSignals" | "currentSignals") {
  if (cases.length === 0) return 0;
  return cases.filter((item) => item[key].includes("unknown_failure")).length / cases.length;
}

function falsePositiveRate(cases: SignalAuditCase[], key: "oldSignals" | "currentSignals", signal: FailureSignal) {
  if (cases.length === 0) return 0;
  const falsePositiveCount = cases.filter((item) => !item.expectedSignals.includes(signal) && item[key].includes(signal)).length;
  return falsePositiveCount / cases.length;
}

function subtypeDistribution(cases: SignalAuditCase[]) {
  return cases.reduce<Record<string, number>>((acc, item) => ({
    ...acc,
    [item.subtype]: (acc[item.subtype] || 0) + 1,
  }), {});
}

export function summarizeSignalAudit(cases: SignalAuditCase[]): SignalAuditSummary {
  const currentToolFp = falsePositiveRate(cases, "currentSignals", "tool_not_called");
  const oldToolFp = falsePositiveRate(cases, "oldSignals", "tool_not_called");
  const currentSafetyFp = falsePositiveRate(cases, "currentSignals", "safety_boundary");
  const oldSafetyFp = falsePositiveRate(cases, "oldSignals", "safety_boundary");

  return {
    totalRows: cases.length,
    labeledRows: cases.filter((item) => item.expectedSignals.length > 0).length,
    current: {
      expectedRecall: roundScore(expectedRecall(cases, "currentSignals")),
      unknownFailureRate: roundScore(unknownFailureRate(cases, "currentSignals")),
      bySignal: countSignals(cases, "currentSignals"),
      falsePositiveRates: {
        tool_not_called: roundScore(currentToolFp),
        safety_boundary: roundScore(currentSafetyFp),
      },
    },
    old: {
      expectedRecall: roundScore(expectedRecall(cases, "oldSignals")),
      unknownFailureRate: roundScore(unknownFailureRate(cases, "oldSignals")),
      bySignal: countSignals(cases, "oldSignals"),
      falsePositiveRates: {
        tool_not_called: roundScore(oldToolFp),
        safety_boundary: roundScore(oldSafetyFp),
      },
    },
    focusDeltas: {
      tool_not_called: roundScore(currentToolFp - oldToolFp),
      safety_boundary: roundScore(currentSafetyFp - oldSafetyFp),
    },
    subtypeDistribution: subtypeDistribution(cases),
    cases,
  };
}

function defaultInputFiles() {
  return [
    "fixtures/evaluation/migration_badcase_dimensions.jsonl",
    "fixtures/evaluation/migration_badcase_regression.jsonl",
    "fixtures/evaluation/migration_badcase_full.jsonl",
    "tmp/migration-eval-dimensions/combined_eval_rows.jsonl",
    "/Users/Harland/Go/Chat/CHAT-0410/eval/reports/mt_migration90_20260515_095956_e4a4c8/badcases_answer_quality.jsonl",
  ];
}

function writeAuditReport(report: SignalAuditSummary) {
  const outDir = path.resolve(process.cwd(), "tmp/evaluation-signal-audit");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  fs.writeFileSync(path.join(outDir, "评测-report.md"), [
    "# Evaluation Signal Audit",
    "",
    `- Total rows: ${report.totalRows}`,
    `- Labeled rows: ${report.labeledRows}`,
    `- Current expected recall: ${report.current.expectedRecall}`,
    `- Current unknown failure rate: ${report.current.unknownFailureRate}`,
    `- Old tool_not_called false positive rate: ${report.old.falsePositiveRates.tool_not_called}`,
    `- Current tool_not_called false positive rate: ${report.current.falsePositiveRates.tool_not_called}`,
    `- Old safety_boundary false positive rate: ${report.old.falsePositiveRates.safety_boundary}`,
    `- Current safety_boundary false positive rate: ${report.current.falsePositiveRates.safety_boundary}`,
    "",
    "## Current Signal Distribution",
    "",
    "```json",
    JSON.stringify(report.current.bySignal, null, 2),
    "```",
    "",
    "## Subtype Distribution",
    "",
    "```json",
    JSON.stringify(report.subtypeDistribution, null, 2),
    "```",
  ].join("\n"), "utf-8");
}

function isCliEntry() {
  const currentFile = fileURLToPath(import.meta.url);
  const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return currentFile === invokedFile;
}

if (isCliEntry()) {
  const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultInputFiles();
  const rows = readSignalAuditRows(files);
  const report = summarizeSignalAudit(compareSignalRules(rows, files.join(",")));
  writeAuditReport(report);
  const { cases, ...summary } = report;
  console.log(JSON.stringify({
    ...summary,
    caseSampleCount: Math.min(cases.length, 20),
    caseSamples: cases.slice(0, 20),
  }, null, 2));
  if (
    report.current.expectedRecall < 0.85
    || report.current.unknownFailureRate > 0.12
    || report.current.falsePositiveRates.tool_not_called >= report.old.falsePositiveRates.tool_not_called
    || report.current.falsePositiveRates.safety_boundary >= report.old.falsePositiveRates.safety_boundary
  ) {
    process.exitCode = 1;
  }
}
