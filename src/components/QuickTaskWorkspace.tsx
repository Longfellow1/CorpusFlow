import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronsDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  buildQuickTaskSeedText,
  buildQuickTaskInstructionText,
  buildQuickTaskSystemText,
  type QuickTaskKind,
  type QuickTaskRow,
} from "../utils/quickTaskImport";
import { getQuickProgressPercent } from "../utils/taskWorkspaceState";
import { DEFAULT_INSTRUCTION_SYSTEM_PROMPT } from "../utils/fineTuneDataContract";
import type { RejectionCheck } from "../utils/rejectionSafety";
import type { WorkspaceRunStatus } from "../utils/workspaceModeContract";

type QuickGeneratedItem = {
  id: string;
  type: "single" | "multi" | "instruct";
  q: string;
  a: string;
  system?: string;
  instruction?: string;
  input?: string;
  output?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  currentQuery?: string;
  response?: string;
  conversations?: Array<{ from: string; value: string }>;
  seedIndex?: number;
};

type QuickTaskWorkspaceProps = {
  taskSwitcher: React.ReactNode;
  sidebarWidth: number;
  onSidebarResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  quickImportStatus: "idle" | "parsing" | "ready" | "error";
  quickImportError: string;
  quickFile: { name: string; size: string } | null;
  quickTaskKind: QuickTaskKind;
  quickMultiTurnEnabled: boolean;
  quickRows: QuickTaskRow[];
  quickHeaders: string[];
  quickColumns: {
    query?: string;
    input?: string;
    output?: string;
    instruction?: string;
    system?: string;
    history?: string;
  };
  quickWarnings: string[];
  quickTargetPerSeed: number;
  quickFilterStrength: "loose" | "medium" | "strict";
  quickConcurrency: number;
  quickControlExpanded: boolean;
  quickRunStatus: WorkspaceRunStatus;
  quickRunStats: {
    seeds_count: number;
    total_generated: number;
    total_retained: number;
    pass_rate: number;
  } | null;
  quickRunProgress: {
    total: number;
    done: number;
    errors: number;
    status: "running" | "done" | "cancelled";
  } | null;
  quickCachedBatches: Array<{
    id: string;
    label: string;
    createdAt: string;
    items: QuickGeneratedItem[];
    stats: {
      seeds_count: number;
      total_generated: number;
      total_retained: number;
      pass_rate: number;
    };
  }>;
  quickGeneratedItems: QuickGeneratedItem[];
  quickSeedTexts: string[];
  quickRejectedSeeds: Record<number, RejectionCheck>;
  quickGroupedResults: Array<{
    seedIndex: number;
    items: QuickGeneratedItem[];
  }>;
  onImportFile: (file: File) => Promise<void>;
  onResetImport: () => void;
  onTaskKindChange: (kind: QuickTaskKind) => void;
  onMultiTurnEnabledChange: (enabled: boolean) => void;
  onTargetPerSeedChange: (value: number) => void;
  onFilterStrengthChange: (value: "loose" | "medium" | "strict") => void;
  onConcurrencyChange: (value: number) => void;
  onToggleControlExpanded: () => void;
  onGenerate: () => void;
  onPauseGeneration: () => void;
  onStopGeneration: () => void;
  onExport: (format: "json" | "csv" | "jsonl") => void;
  onClearResults: () => void;
  onRestoreCachedBatch: (batchId: string) => void;
  isExporting: boolean;
  quickInstructionTemplate: string;
  onInstructionTemplateChange: (v: string) => void;
  quickDiversity: number;
  onDiversityChange: (v: number) => void;
  quickGenerationIntent: string;
  onGenerationIntentChange: (v: string) => void;
};

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function fieldBadge(value?: string) {
  if (!value) return <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-500">未识别</span>;
  return <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">{value}</span>;
}

function rejectionBadge(rejection?: RejectionCheck) {
  if (!rejection?.blocked) return null;
  return (
    <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-300">
      拒绝 · {rejection.reason || "敏感内容"}
    </span>
  );
}

function rowSubtitle(row?: QuickTaskRow) {
  if (!row?.raw) return null;
  const entries = Object.entries(row.raw)
    .map(([key, value]) => [key, String(value ?? "").trim()] as const)
    .slice(0, 8);
  if (entries.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {entries.map(([key, value]) => (
        <span key={key} className="max-w-full truncate">
          <span className="text-slate-600">{key}</span>：{value || "空"}
        </span>
      ))}
    </div>
  );
}

const MIN_TARGET_PER_SEED = 5;
const MAX_TARGET_PER_SEED = 100;

function clampTargetPerSeed(value: number) {
  if (Number.isNaN(value)) return MIN_TARGET_PER_SEED;
  return Math.min(MAX_TARGET_PER_SEED, Math.max(MIN_TARGET_PER_SEED, Math.round(value)));
}

export function QuickTaskWorkspace({
  taskSwitcher,
  sidebarWidth,
  onSidebarResizeStart,
  quickImportStatus,
  quickImportError,
  quickFile,
  quickTaskKind,
  quickMultiTurnEnabled,
  quickRows,
  quickHeaders,
  quickColumns,
  quickWarnings,
  quickTargetPerSeed,
  quickFilterStrength,
  quickConcurrency,
  quickControlExpanded,
  quickRunStatus,
  quickRunStats,
  quickRunProgress,
  quickCachedBatches,
  quickGeneratedItems,
  quickSeedTexts,
  quickRejectedSeeds,
  quickGroupedResults,
  onImportFile,
  onResetImport,
  onTaskKindChange,
  onMultiTurnEnabledChange,
  onTargetPerSeedChange,
  onFilterStrengthChange,
  onConcurrencyChange,
  onToggleControlExpanded,
  onGenerate,
  onPauseGeneration,
  onStopGeneration,
  onExport,
  onClearResults,
  onRestoreCachedBatch,
  isExporting,
  quickInstructionTemplate,
  onInstructionTemplateChange,
  quickDiversity,
  onDiversityChange,
  quickGenerationIntent,
  onGenerationIntentChange,
}: QuickTaskWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const openFilePicker = () => fileInputRef.current?.click();

  const previewTexts = useMemo(() => quickSeedTexts.slice(0, 8), [quickSeedTexts]);
  const totalCount = quickRows.length;
  const validCount = quickSeedTexts.filter((_, index) => !quickRejectedSeeds[index]?.blocked).length;
  const rejectedCount = Object.keys(quickRejectedSeeds).length;
  const generatableRows = quickRows.filter((row, index) => {
    const text = buildQuickTaskInstructionText(row).trim() || row.query?.trim() || row.input?.trim() || "";
    return Boolean(text) && !quickRejectedSeeds[index]?.blocked;
  });
  const hasUserQuestion = generatableRows.length > 0 && generatableRows.every((row) => Boolean(buildQuickTaskInstructionText(row)));
  const hasSystemPrompt = generatableRows.length > 0 && generatableRows.every((row) => Boolean(buildQuickTaskSystemText(row, quickInstructionTemplate)));
  const currentTypeLabel = `${quickTaskKind === "instruct" ? "指令微调" : "问答"}${quickMultiTurnEnabled ? " · 多轮" : ""}`;
  const quickBlockReason = quickImportStatus !== "ready"
    ? "先上传文件"
    : validCount === 0
      ? "没有可生成的数据"
      : quickTaskKind === "instruct" && !hasUserQuestion
        ? "缺少用户问题列，请检查字段识别"
        : quickTaskKind === "instruct" && !hasSystemPrompt
          ? "指令微调需要填写助手角色"
          : "";
  const expectedCount = validCount * quickTargetPerSeed;
  const retainedCount = quickRunStats?.total_retained ?? quickGeneratedItems.length;
  const quickProgressPercent = getQuickProgressPercent({
    runStatus: quickRunStatus,
    progress: quickRunProgress,
    retainedCount,
    expectedCount,
  });
  const quickStageLabel = quickRunStatus === "running"
    ? "生成与过滤中"
    : quickRunStatus === "paused"
      ? "已暂停"
    : quickRunStatus === "stopping"
      ? "正在停止"
    : quickRunStatus === "done"
      ? "完成"
      : "待开始";
  const quickProgressCard = (quickRunStatus === "running" || quickRunStatus === "paused" || quickRunStatus === "stopping" || quickRunStatus === "done") ? (
    <div className="mb-5 space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-400" />
            {quickStageLabel}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {validCount} 个种子 · 目标 {expectedCount} 条 · 并发 {quickConcurrency}
            {quickRunProgress ? ` · 已完成 ${quickRunProgress.done}/${quickRunProgress.total}` : ""}
          </div>
        </div>
        {quickRunStatus === "running" || quickRunStatus === "paused" || quickRunStatus === "stopping" ? (
          <div className="flex items-center gap-2">
            {quickRunStatus !== "stopping" && (
              <button
                onClick={quickRunStatus === "running" ? onPauseGeneration : onGenerate}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 transition-all hover:bg-emerald-500/20 hover:text-white"
                title={quickRunStatus === "running" ? "暂停生成" : "继续生成"}
                aria-label={quickRunStatus === "running" ? "暂停生成" : "继续生成"}
              >
                {quickRunStatus === "running" ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </button>
            )}
            <button
              onClick={onStopGeneration}
              disabled={quickRunStatus === "stopping"}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-100"
              title="停止生成"
              aria-label="停止生成"
            >
              <Square size={13} fill="currentColor" />
            </button>
          </div>
        ) : (
          <div className="text-lg font-black text-emerald-300">{quickProgressPercent}%</div>
        )}
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn(
            "relative h-full overflow-hidden rounded-full bg-emerald-400 transition-all duration-500",
          )}
          style={{ width: `${quickProgressPercent}%` }}
        >
          {(quickRunStatus === "running" || quickRunStatus === "stopping") && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
              <div className="h-full w-2/3 animate-[quick-progress-scan_1.35s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent blur-[1px]" />
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2">
          <div className="text-[11px] text-slate-500">目标</div>
          <div className="mt-0.5 text-xs font-bold text-white">{quickRunStats?.total_generated ?? expectedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2">
          <div className="text-[11px] text-slate-500">保留</div>
          <div className="mt-0.5 text-xs font-bold text-white">{quickRunStats?.total_retained ?? retainedCount}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-2 py-2">
          <div className="text-[11px] text-slate-500">保留率</div>
          <div className="mt-0.5 text-xs font-bold text-white">
            {quickRunStats ? `${Math.round(quickRunStats.pass_rate * 100)}%` : "计算中"}
          </div>
        </div>
      </div>
    </div>
  ) : null;
  const visibleResultGroups = quickGeneratedItems.length > 0
    ? quickRows
      .map((row, index) => {
        const generatedGroup = quickGroupedResults.find((group) => group.seedIndex === index);
        if (generatedGroup) return generatedGroup;
        if (quickRejectedSeeds[index]?.blocked) {
          return { seedIndex: index, items: [] as QuickGeneratedItem[] };
        }
        return null;
      })
      .filter((group): group is { seedIndex: number; items: QuickGeneratedItem[] } => Boolean(group))
    : quickGroupedResults;
  const displayedResultGroups = useMemo(() => {
    if (resultsExpanded || quickGeneratedItems.length <= 10) return visibleResultGroups;
    let remaining = 10;
    return visibleResultGroups
      .map((group) => {
        if (remaining <= 0) return { ...group, items: [] };
        const items = group.items.slice(0, remaining);
        remaining -= items.length;
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0 || quickRejectedSeeds[group.seedIndex]?.blocked);
  }, [quickGeneratedItems.length, quickRejectedSeeds, resultsExpanded, visibleResultGroups]);
  const hiddenResultCount = Math.max(
    0,
    quickGeneratedItems.length - displayedResultGroups.reduce((sum, group) => sum + group.items.length, 0),
  );

  useEffect(() => {
    setResultsExpanded(false);
  }, [quickRunStatus, quickGeneratedItems.length]);

  return (
    <>
      {/* ── 左轨 w-72：单一控制流 ── */}
      <div
        className="relative border-r border-slate-800 bg-[#1A1A27] flex flex-col shrink-0"
        style={{ width: sidebarWidth }}
      >
        <div
          className="absolute right-0 top-0 z-20 h-full w-2 translate-x-1 cursor-col-resize bg-transparent transition-colors hover:bg-emerald-400/20"
          onMouseDown={onSidebarResizeStart}
          title="拖动调整宽度"
          aria-label="拖动调整宽度"
        />
        <div className="space-y-3 border-b border-slate-800 p-4">
          {taskSwitcher}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Upload size={14} className="text-emerald-400" />
              批量导入
            </h2>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">{currentTypeLabel}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImportFile(file);
              event.target.value = "";
            }}
          />

          {/* ── 区块①：导入 ── */}
          {quickImportStatus === "idle" || quickImportStatus === "parsing" || quickImportStatus === "error" ? (
            <>
              {quickImportStatus === "error" && quickFile && (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-300">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-rose-100">{quickFile.name}</div>
                    <div className="mt-0.5 text-[11px] text-rose-300/70">{quickFile.size} · 解析失败</div>
                  </div>
                  <button
                    onClick={openFilePicker}
                    className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-100"
                    title="替换上传"
                    aria-label="替换上传"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    onClick={onResetImport}
                    className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-100"
                    title="删除该文件"
                    aria-label="删除该文件"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              <label
                className={cn(
                  "flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-4 text-center transition-all",
                  quickImportStatus === "error"
                    ? "border-rose-500/50 bg-rose-500/5"
                    : "border-slate-700 bg-slate-900/40 hover:border-emerald-500/50 hover:bg-emerald-500/5",
                )}
                onClick={openFilePicker}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files?.[0];
                  if (file) void onImportFile(file);
                }}
              >
                {quickImportStatus === "parsing" ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={36} className="animate-spin text-emerald-400" />
                    <p className="text-sm text-slate-300">正在识别文件</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                      <Upload size={26} />
                    </div>
                    <div>
                      <div className="text-base font-bold text-white">上传表格文件</div>
                      <div className="text-xs text-slate-500">支持 xlsx / csv / json</div>
                    </div>
                    <div className="text-[11px] text-slate-600">拖拽或点击选择文件</div>
                  </div>
                )}
              </label>

              {quickImportError && (
                <div className="space-y-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3">
                  <div className="text-xs text-rose-200">{quickImportError}</div>
                </div>
              )}
            </>
          ) : (
            /* quickImportStatus === "ready" */
            <>
              {/* 紧凑文件卡片 */}
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{quickFile?.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {quickFile?.size} · 有效 {validCount} / {totalCount} 行{rejectedCount > 0 ? ` · 拒识 ${rejectedCount}` : ""}
                  </div>
                </div>
                <button
                  onClick={openFilePicker}
                  className="rounded-lg p-1.5 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-100"
                  title="替换上传"
                  aria-label="替换上传"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={onResetImport}
                  className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/15 hover:text-rose-100"
                  title="删除该文件"
                  aria-label="删除该文件"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* 字段识别卡片 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="text-xs font-bold text-slate-400">字段识别</div>
                <div className="grid gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">用户问题 <span className="ml-2 font-mono font-bold text-slate-400">Instruction</span></span>
                    {fieldBadge(quickColumns.instruction)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300"><span className="font-mono text-slate-400">Input</span> <span className="ml-2">约束背景</span></span>
                    {fieldBadge(quickColumns.input)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">期望输出 <span className="ml-2 font-mono text-slate-500">Output</span></span>
                    {fieldBadge(quickColumns.output)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">助手角色 <span className="ml-2 font-mono text-slate-500">System</span></span>
                    {fieldBadge(quickColumns.system)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-300">多轮历史 <span className="ml-2 font-mono text-slate-500">History</span></span>
                    {fieldBadge(quickColumns.history)}
                  </div>
                </div>
                {hasUserQuestion ? (
                  <p className="text-[11px] text-slate-500">
                    已读取用户问题字段{quickColumns.instruction ? `：${quickColumns.instruction}` : ""}。
                  </p>
                ) : (
                  <p className="text-[11px] text-rose-400">
                    未识别到用户问题列，请使用 instruction、query、question、user_query 或 问题。
                  </p>
                )}
              </div>

              {/* Warnings */}
              {quickWarnings.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <AlertCircle size={12} />
                    识别提示
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    {quickWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 区块②：配置（仅 ready 时显示）── */}
          {quickImportStatus === "ready" && (
            <>
              {/* 输出类型 */}
              <div className="rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="text-sm font-bold text-slate-400">输出类型</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "qa", label: "问答" },
                      { value: "instruct", label: "指令微调" },
                    ] as const
                  ).map(({ value, label }) => {
                    const activeClasses: Record<string, string> = {
                      qa: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
                      instruct: "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30",
                    };
                    return (
                      <button
                        key={value}
                        onClick={() => onTaskKindChange(value)}
                        className={cn(
                          "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                          quickTaskKind === value
                            ? activeClasses[value]
                            : "border border-slate-700 text-slate-400 hover:bg-slate-800",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div>
                  <div className="text-xs font-bold text-slate-400">多轮对话</div>
                  <div className="mt-0.5 text-[11px] text-slate-600">开启后生成上一轮 1Q1A + 当前轮</div>
                </div>
                <button
                  type="button"
                  onClick={() => onMultiTurnEnabledChange(!quickMultiTurnEnabled)}
                  className={cn(
                    "relative h-7 w-12 rounded-full transition-colors",
                    quickMultiTurnEnabled ? "bg-violet-500" : "bg-slate-700",
                  )}
                  aria-pressed={quickMultiTurnEnabled}
                  aria-label="切换多轮对话"
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform",
                      quickMultiTurnEnabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>

              {/* 助手角色 */}
              {quickTaskKind === "instruct" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400">助手角色</label>
                  <span className="text-[11px] text-slate-600">必填，写入 system</span>
                  </div>
                  <textarea
                    rows={3}
                    value={quickInstructionTemplate}
                    onChange={(e) => onInstructionTemplateChange(e.target.value)}
                    placeholder={DEFAULT_INSTRUCTION_SYSTEM_PROMPT}
                    className={cn(
                      "w-full resize-none rounded-xl border px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition-colors",
                      "border-slate-700 bg-slate-900/60 focus:border-indigo-500"
                    )}
                  />
                  <p className="text-[11px] text-slate-500">
                    用来约束助手身份和回答风格；如果文件里有 system、role、persona 或 角色设定 列，优先使用文件内容。
                  </p>
                  {!hasSystemPrompt && (
                    <p className="text-[11px] text-rose-400">指令微调必须填写助手角色，或在上传文件中提供 system/role/persona/角色设定 列。</p>
                  )}
                </div>
              )}

              {/* 生成规模 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-400">生成规模</div>
                  <div className="text-sm font-bold text-emerald-400">x{quickTargetPerSeed}</div>
                </div>
                <input
                  type="range"
                  min={MIN_TARGET_PER_SEED}
                  max={MAX_TARGET_PER_SEED}
                  step="10"
                  value={quickTargetPerSeed}
                  onChange={(event) => onTargetPerSeedChange(clampTargetPerSeed(Number(event.target.value)))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
                />
                <input
                  type="number"
                  min={MIN_TARGET_PER_SEED}
                  max={MAX_TARGET_PER_SEED}
                  value={quickTargetPerSeed}
                  onChange={(event) => onTargetPerSeedChange(clampTargetPerSeed(Number(event.target.value)))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>{MIN_TARGET_PER_SEED}</span>
                  <span>{MAX_TARGET_PER_SEED}</span>
                </div>
              </div>

              {/* 语义多样性 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400">语义多样性</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">生成时控制探索范围</div>
                  </div>
                  <div className="text-sm font-bold text-emerald-400">{quickDiversity}</div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={quickDiversity}
                  onChange={(e) => onDiversityChange(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>专注 2-3簇</span>
                  <span>广泛 10+簇</span>
                </div>
              </div>

              {/* 质量过滤 */}
              <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400">质量过滤</div>
                    <div className="mt-0.5 text-[11px] text-slate-600">生成后控制相似表达保留力度</div>
                  </div>
                  <button
                    onClick={onToggleControlExpanded}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
                  >
                    {quickControlExpanded ? "收起" : "高级"}{" "}
                    <ChevronDown size={12} className={cn("transition-transform", quickControlExpanded && "rotate-180")} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["loose", "宽松"],
                      ["medium", "平衡"],
                      ["strict", "严格"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => onFilterStrengthChange(value)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                        quickFilterStrength === value
                          ? "bg-slate-100 text-slate-950"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {quickControlExpanded && (
                  <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="space-y-2">
                      <span className="text-[11px] text-slate-500">生成意图</span>
                      <textarea
                        rows={2}
                        value={quickGenerationIntent}
                        onChange={(event) => onGenerationIntentChange(event.target.value)}
                        placeholder="例：保持 query 扩写，不要把句子改成知识问答"
                        className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 outline-none transition-colors placeholder-slate-600 focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">并发</span>
                      <span className="text-xs font-bold text-white">{quickConcurrency}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={quickConcurrency}
                      onChange={(event) => onConcurrencyChange(Number(event.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-slate-100"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── 区块③：生成控制（播放器式）── */}
          {quickRunStatus !== "running" && quickRunStatus !== "paused" && quickRunStatus !== "stopping" && (
            <>
              <button
                onClick={onGenerate}
                disabled={
                  validCount === 0 ||
                  (quickTaskKind === "instruct" && (!hasUserQuestion || !hasSystemPrompt))
                }
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-60",
                  quickRunStatus === "done"
                    ? "border border-emerald-500 bg-transparent text-emerald-400 hover:bg-emerald-500/10 shadow-none"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/20",
                )}
              >
                {quickRunStatus === "done" ? (
                  <>
                    <RefreshCw size={16} />
                    重新生成
                  </>
                ) : (
                  <>
                    <Play size={16} />
                    开始生成
                  </>
                )}
              </button>
              {quickBlockReason && (
                <p className="px-1 text-[11px] text-amber-300">{quickBlockReason}</p>
              )}
            </>
          )}

          {/* ── 区块④：导出 + 统计（仅有结果时显示）── */}
          {quickGeneratedItems.length > 0 && (
            <div className="space-y-3">
              {/* 统计行 */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>保留 {quickRunStats?.total_retained ?? quickGeneratedItems.length} 条</span>
                {quickRunStats && (
                  <span>保留率 {Math.round(quickRunStats.pass_rate * 100)}%</span>
                )}
              </div>

              {/* 导出按钮 */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onExport("json")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileJson size={12} /> JSON
                </button>
                <button
                  onClick={() => onExport("csv")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileSpreadsheet size={12} /> CSV
                </button>
                <button
                  onClick={() => onExport("jsonl")}
                  disabled={isExporting}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileText size={12} /> JSONL
                </button>
              </div>

              {/* 清空：文字链接，非按钮 */}
              <button
                onClick={onClearResults}
                className="w-full text-center text-xs text-slate-500 hover:text-rose-400 transition-colors"
              >
                清空结果
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 中央区块（全宽结果，原样保留）── */}
      <div className="flex-1 overflow-y-auto bg-[#0F0F16] p-6 custom-scrollbar">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-[#1A1A27] p-6">
            {quickProgressCard}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles size={16} className="text-emerald-400" />
                数据预览 / 结果
              </h3>
              {quickRunStatus === "done" && quickRunStats && (
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>保留 {quickRunStats.total_retained}</span>
                  <span>保留率 {Math.round(quickRunStats.pass_rate * 100)}%</span>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {quickGeneratedItems.length > 0 ? (
                <>
                {quickCachedBatches.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/30 p-3">
                    <span className="text-[11px] font-bold text-slate-500">批次缓存</span>
                    {quickCachedBatches.map((batch) => (
                      <button
                        key={batch.id}
                        onClick={() => onRestoreCachedBatch(batch.id)}
                        className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-bold text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-200"
                        title={`${batch.stats.total_retained} 条，最多保留近 3 轮`}
                      >
                        {batch.label} · {batch.stats.total_retained}
                      </button>
                    ))}
                  </div>
                )}
                {displayedResultGroups.map((group) => {
                  const sourceRow = quickRows[group.seedIndex];
                  const sourceText = sourceRow
                    ? buildQuickTaskSeedText(sourceRow, quickTaskKind) || `种子 ${group.seedIndex + 1}`
                    : quickSeedTexts[group.seedIndex] || `种子 ${group.seedIndex + 1}`;
                  const rejection = quickRejectedSeeds[group.seedIndex];
                  return (
                    <div key={group.seedIndex} className="overflow-hidden rounded-2xl border border-slate-800 bg-[#161621]">
                      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                              #{group.seedIndex + 1}
                            </span>
                            <span className="truncate text-base text-white">{sourceText}</span>
                            {rejectionBadge(rejection)}
                          </div>
                          {quickTaskKind === "instruct" && rowSubtitle(sourceRow)}
                        </div>
                        <span className="text-[11px] text-slate-500">{rejection?.blocked ? "拒识" : `${group.items.length} 条`}</span>
                      </div>
                      {rejection?.blocked && group.items.length === 0 ? (
                        <div className="p-4 text-sm text-rose-200/80">
                          该行已拒识，未进入普通生成。
                        </div>
                      ) : (
                      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                        {group.items.map((item, index) => {
                          const hasMultiTurnContext = Boolean((item.conversations?.length || item.history?.length || 0) > 0);
                          const itemLabel = item.type === "instruct"
                            ? hasMultiTurnContext ? "指令微调 · 多轮" : "指令微调"
                            : item.type === "multi" ? "多轮问答" : "问答";
                          return (
                          <div key={item.id || `${group.seedIndex}-${index}`} className="rounded-2xl border border-slate-800 bg-[#1A1A27] p-4">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span className={item.type === "instruct" ? "text-indigo-400" : item.type === "multi" ? "text-violet-400" : "text-emerald-400"}>
                                {itemLabel}
                              </span>
                              <span>#{index + 1}</span>
                            </div>
                            {item.type === "multi" ? (
                              <div className="mt-3 space-y-2">
                                {((item as any).conversations || []).map((turn: any, i: number) => (
                                  <div key={i} className={cn("rounded-xl px-3 py-2 text-sm", turn.from === "human" ? "bg-slate-800 text-white" : "bg-indigo-500/10 text-indigo-200")}>
                                    <span className="text-[11px] font-bold text-slate-500 mr-2">{turn.from === "human" ? "用户" : "助手"}</span>
                                    {turn.value}
                                  </div>
                                ))}
                              </div>
                            ) : item.type === "instruct" ? (
                              <div className="mt-3 space-y-3">
                                {((item as any).conversations || []).length > 0 && (
                                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                    <div className="text-[11px] font-bold text-slate-500">上一轮上下文</div>
                                    {((item as any).conversations || []).slice(0, 2).map((turn: any, i: number) => (
                                      <div key={i} className={cn("rounded-lg px-2 py-1 text-xs", turn.from === "human" ? "bg-slate-800/70 text-slate-200" : "bg-slate-800/40 text-slate-400")}>
                                        <span className="mr-2 font-bold text-slate-500">{turn.from === "human" ? "用户" : "助手"}</span>
                                        {turn.value}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {((item as any).conversations || []).length > 0 && <div className="h-px bg-slate-800/70" />}
                                <div>
                                  <div className="mb-1 text-xs font-bold text-slate-300">助手角色 <span className="ml-2 font-mono text-slate-500">System</span></div>
                                  <p className="text-sm leading-relaxed text-slate-400">{(item as any).system || "—"}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                                  <div className="mb-1 text-xs font-black text-sky-200">用户问题 <span className="ml-2 font-mono text-sky-300/80">Instruction</span></div>
                                  <p className="text-sm font-bold leading-relaxed text-white">{(item as any).instruction || "—"}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-xs font-bold text-slate-300"><span className="font-mono text-slate-400">Input</span> <span className="ml-2">约束背景</span></div>
                                  <p className="text-sm leading-relaxed text-slate-400">{(item as any).input || "—"}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-xs font-bold text-slate-300">期望输出 <span className="ml-2 font-mono text-slate-500">Output</span></div>
                                  <p className="text-sm leading-relaxed text-slate-400">{(item as any).output || "—"}</p>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">提问</div>
                                  <p className="text-base leading-relaxed text-white">{item.q}</p>
                                </div>
                                <div className="h-px bg-slate-800" />
                                <div>
                                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">回答</div>
                                  <p className="text-base leading-relaxed text-slate-400">{item.a || "—"}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                      )}
                    </div>
                  );
                })}
                {hiddenResultCount > 0 && (
                  <button
                    onClick={() => setResultsExpanded(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-300 transition-colors hover:border-emerald-500/30 hover:text-white"
                  >
                    <ChevronsDown size={16} className="text-emerald-400" />
                    展开其余 {hiddenResultCount} 条
                  </button>
                )}
                </>
              ) : previewTexts.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {previewTexts.map((text, index) => (
                    <div key={`${text}-${index}`} className={cn("rounded-2xl border bg-[#161621] p-4", quickRejectedSeeds[index]?.blocked ? "border-rose-500/30" : "border-slate-800")}>
                      <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span>#{index + 1}</span>
                        {rejectionBadge(quickRejectedSeeds[index]) || <span>待生成</span>}
                      </div>
                      <p className="text-base leading-relaxed text-white">{text}</p>
                      {quickTaskKind === "instruct" && rowSubtitle(quickRows[index])}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-800 bg-[#12121A] text-slate-500">
                  <FileText size={42} className="opacity-20" />
                  <p className="text-sm">先上传文件，再开始生成</p>
                </div>
              )}
            </div>
          </div>

          {quickImportStatus === "ready" && quickHeaders.length > 0 && (
            <div className="rounded-3xl border border-slate-800 bg-[#1A1A27] p-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
                <Check size={12} className="text-emerald-400" />
                识别到的列
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickHeaders.map((header) => (
                  <span key={header} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                    {header}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
