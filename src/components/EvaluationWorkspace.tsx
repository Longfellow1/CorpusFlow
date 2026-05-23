import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Check,
  ChevronDown,
  Download,
  Edit3,
  FileJson,
  FileText,
  Loader2,
  Map,
  PackageCheck,
  Play,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import type {
  ClusterDecisionStatus,
  EvalAssetType,
  EvalAssetPackage,
  EvaluationSnapshot,
  FailureSignal,
  ProblemCluster,
} from "../utils/evaluationMode";

type EvaluationWorkspaceProps = {
  taskSwitcher: React.ReactNode;
  sidebarWidth: number;
  onSidebarResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  snapshot: EvaluationSnapshot | null;
  status: "idle" | "parsing" | "working";
  error: string;
  onImportFile: (file: File) => Promise<void>;
  onLoadSample: () => Promise<void>;
  onClusterStatusChange: (clusterId: string, status: ClusterDecisionStatus) => Promise<void>;
  onUpdateStrategy: (clusterId: string, strategy: Partial<ProblemCluster["recommendedStrategy"]>) => Promise<void>;
  onPreviewAssets: () => Promise<void>;
  onGeneratePackage: () => Promise<void>;
  onDownloadAsset: (fileName: string) => Promise<void>;
};

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusTone(status: ClusterDecisionStatus) {
  if (status === "rejected") return "border-slate-800 bg-[#1E1E2D]/80 opacity-75";
  if (status === "pending") return "border-amber-500/20 bg-[#1E1E2D]";
  return "border-slate-800 bg-[#1E1E2D]";
}

function assetTypeLabel(type: EvalAssetType) {
  if (type === "training_candidates") return "训练候选";
  if (type === "eval_cases") return "回归评测";
  return "负例边界";
}

function evidenceRoleLabel(role: FailureSignal | string) {
  const labels: Record<string, string> = {
    identity: "样本标识",
    input: "用户问题",
    actual: "实际回答",
    expected: "期望行为",
    context: "上下文",
    tooling: "工具调用",
    judgment: "评测结果",
    runtime: "运行信息",
    annotation: "失败备注",
  };
  return labels[role] || role;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

const CLUSTER_ANCHORS = [
  { x: 26, y: 40 },
  { x: 60, y: 34 },
  { x: 43, y: 68 },
  { x: 78, y: 64 },
  { x: 52, y: 50 },
];

const DOWNLOAD_FILES = ["batch_expanded_assets.jsonl", "training_candidates.jsonl", "eval_cases.jsonl", "negative_cases.jsonl", "quality_report.json", "provenance.json"];

const CLUSTER_VISUALS = [
  {
    name: "amber",
    dot: "#fbbf24",
    glow: "rgba(251, 191, 36, 0.34)",
    glowSoft: "rgba(251, 191, 36, 0.14)",
    tag: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    ring: "shadow-[0_0_0_4px_rgba(251,191,36,0.16)]",
  },
  {
    name: "sky",
    dot: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.34)",
    glowSoft: "rgba(56, 189, 248, 0.14)",
    tag: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    ring: "shadow-[0_0_0_4px_rgba(56,189,248,0.16)]",
  },
  {
    name: "rose",
    dot: "#fb7185",
    glow: "rgba(251, 113, 133, 0.34)",
    glowSoft: "rgba(251, 113, 133, 0.14)",
    tag: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    ring: "shadow-[0_0_0_4px_rgba(251,113,133,0.16)]",
  },
  {
    name: "indigo",
    dot: "#818cf8",
    glow: "rgba(129, 140, 248, 0.34)",
    glowSoft: "rgba(129, 140, 248, 0.14)",
    tag: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
    ring: "shadow-[0_0_0_4px_rgba(129,140,248,0.16)]",
  },
  {
    name: "emerald",
    dot: "#34d399",
    glow: "rgba(52, 211, 153, 0.28)",
    glowSoft: "rgba(52, 211, 153, 0.12)",
    tag: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    ring: "shadow-[0_0_0_4px_rgba(52,211,153,0.16)]",
  },
];

function getClusterVisual(index: number) {
  return CLUSTER_VISUALS[index % CLUSTER_VISUALS.length];
}

function getCasePosition(index: number, clusterIndex: number) {
  const anchor = CLUSTER_ANCHORS[clusterIndex % CLUSTER_ANCHORS.length];
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 3.6 + (index % 5) * 2.4;
  return {
    x: Math.max(6, Math.min(94, anchor.x + Math.cos(angle) * radius)),
    y: Math.max(10, Math.min(90, anchor.y + Math.sin(angle) * radius)),
  };
}

function assetFileLabel(type: EvalAssetType) {
  if (type === "training_candidates") return "training_candidates.jsonl";
  if (type === "eval_cases") return "eval_cases.jsonl";
  return "negative_cases.jsonl";
}

function assetImpactLabel(cluster: ProblemCluster) {
  if (cluster.status === "rejected") {
    return "已拒绝但保留记录。影响：quality_report.json 标记人工确认。";
  }
  if (cluster.recommendedStrategy.assetType === "training_candidates") {
    return `影响：${assetFileLabel(cluster.recommendedStrategy.assetType)} +${cluster.recommendedStrategy.count}；长上下文训练候选。`;
  }
  if (cluster.recommendedStrategy.assetType === "eval_cases") {
    return `影响：${assetFileLabel(cluster.recommendedStrategy.assetType)} +${cluster.recommendedStrategy.count}；进入回归评测集。`;
  }
  return `影响：${assetFileLabel(cluster.recommendedStrategy.assetType)} +${cluster.recommendedStrategy.count}；沉淀边界负例。`;
}

function hasClusterSignal(tag: string, cluster: ProblemCluster) {
  return cluster.failureSignals.includes(tag as FailureSignal);
}

function trimPreview(text: string) {
  return text.length > 1800 ? `${text.slice(0, 1800)}\n...` : text;
}

function getAssetPreview(assetPackage: EvalAssetPackage, fileName: string) {
  if (fileName === "batch_expanded_assets.jsonl") {
    const asset = [
      ...assetPackage.assets.trainingCandidates,
      ...assetPackage.assets.evalCases,
      ...assetPackage.assets.negativeCases,
    ][0];
    if (!asset) return "[]";
    return trimPreview(JSON.stringify({
      asset_type: asset.assetType,
      cluster_id: asset.clusterId,
      source_case_id: asset.sourceCaseId,
      system: asset.system,
      instruction: asset.instruction,
      input: asset.input,
      output: asset.output,
      ...(asset.expected ? { expected: asset.expected } : {}),
      ...(asset.history ? { history: asset.history } : {}),
      tags: asset.tags,
    }, null, 2));
  }
  if (fileName === "training_candidates.jsonl") {
    const asset = assetPackage.assets.trainingCandidates[0];
    if (!asset) return "[]";
    return trimPreview(JSON.stringify({
      system: asset.system,
      instruction: asset.instruction,
      input: asset.input,
      output: asset.output,
      ...(asset.history ? { history: asset.history } : {}),
    }, null, 2));
  }
  if (fileName === "eval_cases.jsonl") {
    const asset = assetPackage.assets.evalCases[0];
    if (!asset) return "[]";
    return trimPreview(JSON.stringify({
      id: asset.id,
      input: asset.instruction,
      expected_output: asset.expected || asset.output,
      tags: asset.tags,
    }, null, 2));
  }
  if (fileName === "negative_cases.jsonl") {
    const asset = assetPackage.assets.negativeCases[0];
    if (!asset) return "[]";
    return trimPreview(JSON.stringify({
      input: asset.instruction,
      unsafe_output: asset.output,
      expected_behavior: asset.expected,
      tags: asset.tags,
    }, null, 2));
  }
  if (fileName === "quality_report.json") {
    return trimPreview(JSON.stringify(assetPackage.assets.qualityReport, null, 2));
  }
  if (fileName === "provenance.json") {
    return trimPreview(JSON.stringify(assetPackage.assets.provenance.slice(0, 3), null, 2));
  }
  return "文件不存在";
}

export function EvaluationWorkspace({
  taskSwitcher,
  sidebarWidth,
  onSidebarResizeStart,
  snapshot,
  status,
  error,
  onImportFile,
  onLoadSample,
  onClusterStatusChange,
  onUpdateStrategy,
  onPreviewAssets,
  onGeneratePackage,
  onDownloadAsset,
}: EvaluationWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapDragRef = useRef({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapDragging, setMapDragging] = useState(false);
  const [mapViewportSize, setMapViewportSize] = useState({ width: 1, height: 1 });
  const [hoverCaseId, setHoverCaseId] = useState<string | null>(null);
  const [hoverCaseAnchor, setHoverCaseAnchor] = useState<{ x: number; y: number } | null>(null);
  const [caseDrawerClusterId, setCaseDrawerClusterId] = useState<string | null>(null);
  const [editingCluster, setEditingCluster] = useState<ProblemCluster | null>(null);
  const [rootCausePage, setRootCausePage] = useState(1);
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedAssetFile, setSelectedAssetFile] = useState(DOWNLOAD_FILES[0]);
  const [pendingAssetAction, setPendingAssetAction] = useState<"preview" | "package" | null>(null);

  const clusters = snapshot?.clusters || [];
  const cases = snapshot?.cases || [];
  const acceptedClusters = clusters.filter((cluster) => cluster.status === "accepted");
  const acceptedCount = acceptedClusters.length;
  const rejectedCount = clusters.filter((cluster) => cluster.status === "rejected").length;
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(clusters.length / pageSize));
  const visibleClusters = clusters.slice((rootCausePage - 1) * pageSize, rootCausePage * pageSize);
  const drawerCluster = clusters.find((cluster) => cluster.id === caseDrawerClusterId) || null;
  const drawerCases = drawerCluster
    ? cases.filter((caseItem) => drawerCluster.representativeCaseIds.includes(caseItem.id)
      || caseItem.annotation.tags.some((tag) => hasClusterSignal(tag, drawerCluster)))
    : [];
  const hoveredCase = cases.find((caseItem) => caseItem.id === hoverCaseId) || null;
  const assetPackage = snapshot?.package || snapshot?.preview || null;
  const packageFiles = assetPackage?.files || null;
  const mapClusters = useMemo(() => clusters.slice(0, 4), [clusters]);
  const mapClusterDetails = useMemo(() => mapClusters.map((cluster, clusterIndex) => {
    const clusterCases = cases.filter((caseItem) => cluster.representativeCaseIds.includes(caseItem.id)
      || caseItem.annotation.tags.some((tag) => hasClusterSignal(tag, cluster)));
    return { cluster, clusterCases, clusterIndex };
  }), [cases, mapClusters]);
  const recognizedFieldRows = (snapshot?.fieldRoles || []).slice(0, 4);
  const transformedHoverAnchor = hoverCaseAnchor
    ? {
        x: 50 + (hoverCaseAnchor.x - 50) * mapZoom + (mapPan.x / mapViewportSize.width) * 100,
        y: 50 + (hoverCaseAnchor.y - 50) * mapZoom + (mapPan.y / mapViewportSize.height) * 100,
      }
    : null;

  const openFilePicker = () => fileInputRef.current?.click();
  const updateMapViewportSize = () => {
    const rect = mapViewportRef.current?.getBoundingClientRect();
    if (!rect) return { width: 1, height: 1 };
    const nextSize = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    setMapViewportSize(nextSize);
    return nextSize;
  };
  const zoomMap = (delta: number, originX = 0, originY = 0) => {
    setMapZoom((zoom) => {
      const nextZoom = Math.min(2.8, Math.max(0.65, Number((zoom + delta).toFixed(2))));
      if (nextZoom === zoom) return zoom;
      const ratio = nextZoom / zoom;
      setMapPan((pan) => ({
        x: originX - (originX - pan.x) * ratio,
        y: originY - (originY - pan.y) * ratio,
      }));
      return nextZoom;
    });
  };
  const resetMap = () => {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
  };
  const selectedPreview = assetPackage ? getAssetPreview(assetPackage, selectedAssetFile) : "";
  const initialReasoningActive = !snapshot && status !== "idle";
  const previewPending = pendingAssetAction === "preview";
  const packagePending = pendingAssetAction === "package";
  const generationStatusText = previewPending
    ? "预览推理中"
    : packagePending
      ? "资产生成中"
      : snapshot?.package
        ? "资产包已生成"
        : snapshot?.preview
          ? "预览已生成"
          : "等待预览";
  const runAssetAction = async (action: "preview" | "package", runner: () => Promise<void>) => {
    setPendingAssetAction(action);
    try {
      await runner();
      setAssetModalOpen(true);
    } finally {
      setPendingAssetAction(null);
    }
  };

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      setMapViewportSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
      zoomMap(event.deltaY < 0 ? 0.14 : -0.14, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  });

  useEffect(() => {
    if (!packageFiles) return;
    if (!DOWNLOAD_FILES.includes(selectedAssetFile)) {
      setSelectedAssetFile(DOWNLOAD_FILES[0]);
    }
  }, [packageFiles, selectedAssetFile]);

  return (
    <>
      <div
        className="relative flex h-full min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-r border-slate-800 bg-[#1A1A27] max-[819px]:h-auto max-[819px]:!w-full max-[819px]:border-b max-[819px]:border-r-0"
        style={{ width: sidebarWidth }}
      >
        <div
          className="absolute right-0 top-0 z-20 h-full w-2 translate-x-1 cursor-col-resize bg-transparent transition-colors hover:bg-cyan-400/20 max-[819px]:hidden"
          onMouseDown={onSidebarResizeStart}
          title="拖动调整宽度"
          aria-label="拖动调整宽度"
        />
        <div className="shrink-0 border-b border-slate-800 p-3 sm:p-4">
          {taskSwitcher}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#1A1A27] custom-scrollbar max-[819px]:flex-none max-[819px]:overflow-visible">
          <div className="flex min-h-[58px] items-center border-b border-slate-800 px-3 py-2.5 sm:min-h-[70px] sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-500/10 text-sm font-black text-emerald-300">1</span>
              <h2 className="truncate text-[15px] font-black text-white">操作区</h2>
            </div>
          </div>

          <div className="evaluation-control-grid grid min-w-0 gap-[14px] p-3 sm:p-4">
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

          <div className="grid min-w-0 gap-[10px]">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={status !== "idle"}
              className="grid min-h-[118px] min-w-0 w-full place-items-center overflow-hidden rounded-[20px] border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 p-3 text-center transition-colors hover:border-emerald-400/45 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-[150px] sm:p-4"
            >
              <span className="grid h-11 w-11 place-items-center rounded-[16px] bg-emerald-500/10 text-emerald-300 sm:h-[52px] sm:w-[52px] sm:rounded-[18px]">
                {status === "parsing" || initialReasoningActive ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
              </span>
              <strong className="mt-2 block max-w-full truncate text-[15px] font-black text-white sm:mt-2.5">
                {status === "parsing" ? "解析与诊断中" : initialReasoningActive ? "样例推理中" : snapshot ? "复赛样例已导入" : "上传失败证据"}
              </strong>
              <span className="mt-1 block max-w-full text-xs leading-relaxed text-slate-500 sm:mt-1.5">
                {status === "parsing" || initialReasoningActive ? "Evidence 标准化、根因聚类、生产策略生成。" : "CSV / XLSX / JSON 进入统一 Evidence Case。"}
              </span>
              {(status === "parsing" || initialReasoningActive) && (
                <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <span className="block h-full w-1/3 rounded-full bg-emerald-400/80 [animation:quick-progress-scan_1.4s_ease-in-out_infinite]" />
                </span>
              )}
            </button>

            {snapshot ? (
              <div className="flex min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-emerald-500/10 text-xs font-black text-emerald-300">
                  {snapshot.sourceFile.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate text-[13px] font-black text-white">{snapshot.sourceFile}</strong>
                  <span className="mt-1 block text-[11px] leading-normal text-slate-500">
                    有效 {snapshot.stats.evidenceCount} / {snapshot.stats.rawCount} 行 · 明确失败 {snapshot.stats.failedCount} · 拒识 {snapshot.stats.rejectedCount}
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onLoadSample()}
                disabled={status !== "idle"}
                className="flex min-h-[34px] w-full items-center justify-center gap-2 rounded-[10px] border border-slate-700 bg-slate-950/30 px-3 text-xs font-black text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {initialReasoningActive ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {initialReasoningActive ? "推理诊断中" : "使用复赛样例"}
              </button>
            )}

            {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}
          </div>

          <div className="grid min-w-0 gap-2 rounded-xl border border-[rgba(129,140,248,0.24)] bg-[rgba(99,102,241,0.08)] p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-black text-slate-200">
              <span>方案调整指令</span>
              {clusters[0] && <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-300">引用 {clusters[0].id}</span>}
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>目标</span>
                <strong className="text-right text-slate-200">评测优先，训练辅助</strong>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>策略</span>
                <strong className="text-right text-slate-200">
                  {clusters.length > 0 ? `${clusters.slice(0, 2).map((cluster) => cluster.id).join("/")} P0${clusters[2] ? `，${clusters[2].id} P1` : ""}` : "待解析"}
                </strong>
              </div>
            </div>
            <div className="grid min-w-0 gap-2 rounded-xl border border-slate-800 bg-[#161621] p-2.5">
              <textarea
                rows={3}
                placeholder="补充业务背景、调整聚类、修改生成配比..."
                className="min-h-[68px] w-full resize-none rounded-[10px] border border-slate-700 bg-[rgba(15,15,22,0.62)] p-[9px] text-xs leading-normal text-slate-200 outline-none placeholder-slate-600 focus:border-indigo-500/50"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-400">应用到：生产方案</span>
                <button
                  type="button"
                  className="min-h-8 min-w-[86px] rounded-[10px] border border-slate-700 bg-slate-900/60 px-3 text-xs font-black text-slate-300 hover:bg-slate-800"
                >
                  发送
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-slate-800 bg-[#161621] p-3.5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-emerald-500/10 text-sm font-black text-emerald-300">3</span>
              <h2 className="truncate text-[15px] font-black text-white">生成</h2>
            </div>
            <button
              type="button"
              onClick={() => void runAssetAction("preview", onPreviewAssets)}
              disabled={!snapshot || acceptedCount === 0 || status !== "idle" || pendingAssetAction !== null}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-[13px] font-black text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {previewPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              {previewPending ? "推理生成预览中" : "生成预览样例"}
            </button>
            <button
              type="button"
              onClick={() => void runAssetAction("package", onGeneratePackage)}
              disabled={!snapshot || acceptedCount === 0 || status !== "idle" || pendingAssetAction !== null}
              className="mt-2 flex min-h-[34px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-xs font-black text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {packagePending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
              {packagePending ? "生成资产包中" : "确认生成资产包"}
            </button>
            <div className="mt-2.5 grid gap-[7px]">
              <div className="flex min-h-[34px] items-center justify-between gap-2 rounded-[10px] border border-slate-800 bg-[rgba(15,15,22,0.44)] px-[9px] py-[7px] text-xs text-slate-400">
                <span>状态</span>
                <strong className="text-right text-xs text-slate-200">{generationStatusText}</strong>
              </div>
              <div className="flex min-h-[34px] items-center justify-between gap-2 rounded-[10px] border border-slate-800 bg-[rgba(15,15,22,0.44)] px-[9px] py-[7px] text-xs text-slate-400">
                <span>交付</span>
                <strong className="text-right text-xs text-slate-200">jsonl / report / provenance</strong>
              </div>
            </div>
            {snapshot?.package && (
              <button
                type="button"
                onClick={() => setAssetModalOpen(true)}
                className="mt-2 flex min-h-[34px] w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-4 text-xs font-black text-slate-300 hover:bg-slate-800"
              >
                <Download size={14} />
                下载资产文件
              </button>
            )}
          </div>

          {snapshot && (
            <>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                {[
                  ["原始记录", snapshot.stats.rawCount],
                  ["候选 case", snapshot.stats.evidenceCount],
                  ["明确失败", snapshot.stats.failedCount],
                  ["安全拒识", snapshot.stats.rejectedCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-800 bg-[#0F0F16]/50 p-2.5">
                    <span className="block text-[11px] font-bold text-slate-500">{label}</span>
                    <strong className="mt-1 block text-2xl font-black leading-none text-white">{value}</strong>
                  </div>
                ))}
              </div>

              <div className="min-w-0 rounded-xl border border-slate-800 bg-[#161621] p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-xs font-black text-slate-200">
                  <span>字段识别</span>
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-300">{formatPercent(snapshot.stats.fieldRoleSuccessRate)}</span>
                </div>
                <div className="grid gap-[7px]">
                  {recognizedFieldRows.map((field) => (
                    <div key={`${field.role}-${field.header}`} className="flex min-h-[34px] items-center justify-between gap-2 rounded-[10px] border border-slate-800 bg-[#0F0F16]/45 px-2.5 text-xs text-slate-400">
                      <span>{evidenceRoleLabel(field.role)}</span>
                      <strong className="truncate text-right text-slate-200">{field.header}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#171720] custom-scrollbar max-[819px]:flex-none max-[819px]:overflow-visible">
        {!snapshot ? (
          <div className="bg-[#171720] p-4">
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-slate-800 bg-[#12121A] text-slate-500 sm:min-h-[560px]">
              {initialReasoningActive ? (
                <>
                  <Loader2 size={42} className="animate-spin text-emerald-300/80" />
                  <div className="text-sm font-black text-slate-200">{status === "parsing" ? "解析失败证据" : "推理根因诊断"}</div>
                  <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full w-1/3 rounded-full bg-emerald-400/80 [animation:quick-progress-scan_1.4s_ease-in-out_infinite]" />
                  </div>
                </>
              ) : (
                <>
                  <Map size={44} className="opacity-30" />
                  <div className="text-sm">上传评测失败或使用复赛样例</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-full bg-[#171720]">
            <div className="sticky top-0 z-20 border-b border-slate-800 bg-[#171720]/95 px-5 py-3.5 shadow-lg shadow-slate-950/10 backdrop-blur">
              <p className="text-[13px] font-semibold leading-relaxed text-slate-100 sm:text-sm">{snapshot.oneSentenceConclusion}</p>
            </div>

            <div className="flex min-h-[70px] items-center justify-between gap-4 border-b border-slate-800 bg-[#171720] px-5 py-3.5">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-lg font-black text-emerald-300">2</span>
                <h1 className="text-lg font-black text-white">根因诊断</h1>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-300">{acceptedCount} 已采纳</span>
                <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-300">{rejectedCount} 已拒绝</span>
              </div>
            </div>

            <div className="grid gap-[14px] bg-[#171720] p-4">
              <div className="grid gap-2.5 rounded-xl border border-slate-800 bg-[#1E1E2D] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block text-[13px] font-black text-slate-50">Badcase 分布</strong>
                    <span className="mt-[3px] block text-[11px] font-black text-slate-500">
                      {snapshot.stats.failedCount} 个明确失败
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapCollapsed((prev) => !prev)}
                    aria-expanded={!mapCollapsed}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-300 transition-colors hover:bg-indigo-500/15"
                    title={mapCollapsed ? "展开分布图" : "收起分布图"}
                  >
                    <span>{snapshot.stats.failedCount} badcases · {clusters.length} clusters</span>
                    <ChevronDown size={13} className={cn("transition-transform", !mapCollapsed && "rotate-180")} />
                  </button>
                </div>

                {!mapCollapsed && (
                  <>
                    <div className="flex flex-wrap justify-end gap-[7px]">
                      {mapClusterDetails.map(({ cluster, clusterIndex }) => {
                        const visual = getClusterVisual(clusterIndex);
                        return (
                          <button
                            key={cluster.id}
                            type="button"
                            onClick={() => setCaseDrawerClusterId(cluster.id)}
                            className={cn("inline-flex min-h-6 items-center gap-1.5 rounded-full border bg-slate-950/40 px-2 py-[3px] text-[11px] font-black", visual.tag)}
                          >
                            <span className="h-[7px] w-[7px] rounded-full" style={{ background: visual.dot }} />
                            {cluster.id} {cluster.name}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      ref={mapViewportRef}
                      data-map-viewport
                      className={cn(
                        "relative min-h-[218px] touch-none overflow-hidden rounded-xl border border-slate-800 bg-[#101420]",
                        mapDragging ? "cursor-grabbing" : "cursor-grab",
                      )}
                      style={{
                        backgroundImage: "linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px)",
                        backgroundSize: "44px 44px",
                      }}
                      onPointerDown={(event) => {
                        if ((event.target as HTMLElement).closest("[data-map-control]")) return;
                        updateMapViewportSize();
                        mapDragRef.current = {
                          dragging: true,
                          startX: event.clientX,
                          startY: event.clientY,
                          baseX: mapPan.x,
                          baseY: mapPan.y,
                        };
                        setMapDragging(true);
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={(event) => {
                        if (!mapDragRef.current.dragging) return;
                        setHoverCaseId(null);
                        setHoverCaseAnchor(null);
                        setMapPan({
                          x: mapDragRef.current.baseX + event.clientX - mapDragRef.current.startX,
                          y: mapDragRef.current.baseY + event.clientY - mapDragRef.current.startY,
                        });
                      }}
                      onPointerUp={(event) => {
                        mapDragRef.current.dragging = false;
                        setMapDragging(false);
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                      }}
                      onPointerCancel={() => {
                        mapDragRef.current.dragging = false;
                        setMapDragging(false);
                      }}
                    >
                      <span className="absolute left-2.5 top-3 z-[2] text-[10px] font-black uppercase tracking-[0.04em] text-slate-400/60 [writing-mode:vertical-rl]">semantic distance</span>
                      <span className="absolute bottom-2 right-3 z-[2] text-[10px] font-black uppercase tracking-[0.04em] text-slate-400/60">constraint complexity</span>
                      <div className="absolute bottom-2.5 left-3 z-[7] inline-flex items-center gap-1.5 rounded-[10px] border border-slate-700 bg-[#0F0F16]/75 p-1.5">
                        <button
                          type="button"
                          onClick={() => zoomMap(-0.25)}
                          data-map-control
                          className="grid h-[26px] min-w-7 place-items-center rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-black text-slate-300 hover:bg-slate-800"
                          title="缩小"
                        >
                          −
                        </button>
                        <span data-map-scale className="min-w-[42px] text-center text-[11px] font-black text-slate-400">{Math.round(mapZoom * 100)}%</span>
                        <button
                          type="button"
                          onClick={() => zoomMap(0.25)}
                          data-map-control
                          className="grid h-[26px] min-w-7 place-items-center rounded-lg border border-slate-800 bg-slate-900/60 text-xs font-black text-slate-300 hover:bg-slate-800"
                          title="放大"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={resetMap}
                          data-map-control
                          className="grid h-[26px] min-w-[42px] place-items-center rounded-lg border border-slate-800 bg-slate-900/60 px-2 text-xs font-black text-slate-300 hover:bg-slate-800"
                          title="复位"
                        >
                          复位
                        </button>
                      </div>

                      <div
                        data-map-world
                        className={cn("absolute inset-0 z-[3]", !mapDragging && "transition-transform duration-150")}
                        style={{
                          transform: `translate3d(${mapPan.x}px, ${mapPan.y}px, 0) scale(${mapZoom})`,
                          transformOrigin: "center center",
                          willChange: "transform",
                        }}
                      >
                        {mapClusterDetails.map(({ cluster, clusterIndex }) => {
                          const visual = getClusterVisual(clusterIndex);
                          const anchor = CLUSTER_ANCHORS[clusterIndex % CLUSTER_ANCHORS.length];
                          const size = 118 + Math.min(cluster.caseCount, 16) * 7;
                          return (
                            <span
                              key={`${cluster.id}-heat`}
                              className="pointer-events-none absolute z-[1] rounded-full blur-[1px]"
                              style={{
                                left: `${anchor.x}%`,
                                top: `${anchor.y}%`,
                                width: size,
                                height: size,
                                transform: "translate(-50%, -50%)",
                                opacity: 0.86,
                                background: `radial-gradient(circle, ${visual.glow} 0%, ${visual.glowSoft} 38%, transparent 72%)`,
                              }}
                            />
                          );
                        })}

                        {mapClusterDetails.flatMap(({ cluster, clusterCases, clusterIndex }) => {
                          const visual = getClusterVisual(clusterIndex);
                          const pointCount = Math.max(1, cluster.caseCount || clusterCases.length);
                          return Array.from({ length: pointCount }).map((_, caseIndex) => {
                            const pos = getCasePosition(caseIndex, clusterIndex);
                            const caseItem = clusterCases[caseIndex % Math.max(1, clusterCases.length)];
                            const isHot = caseIndex === 0 || (pointCount > 6 && caseIndex === 3);
                            return (
                              <button
                                key={`${cluster.id}-${caseIndex}`}
                                type="button"
                                className={cn(
                                  "absolute z-[3] rounded-full border border-slate-50/70 bg-current p-0 transition-transform hover:z-[6] hover:scale-125 focus-visible:z-[6] focus-visible:outline-none",
                                  visual.ring,
                                )}
                                style={{
                                  left: `${pos.x}%`,
                                  top: `${pos.y}%`,
                                  width: isHot ? 10 : 7,
                                  height: isHot ? 10 : 7,
                                  color: visual.dot,
                                  transform: "translate(-50%, -50%)",
                                  borderWidth: isHot ? 2 : 1,
                                  boxShadow: isHot ? `0 0 0 5px ${visual.glowSoft}, 0 0 18px ${visual.glow}` : `0 0 0 4px ${visual.glowSoft}`,
                                }}
                                onMouseEnter={() => {
                                  if (caseItem) {
                                    updateMapViewportSize();
                                    setHoverCaseId(caseItem.id);
                                    setHoverCaseAnchor(pos);
                                  }
                                }}
                                onMouseLeave={() => {
                                  setHoverCaseId(null);
                                  setHoverCaseAnchor(null);
                                }}
                                onFocus={() => {
                                  if (caseItem) {
                                    updateMapViewportSize();
                                    setHoverCaseId(caseItem.id);
                                    setHoverCaseAnchor(pos);
                                  }
                                }}
                                onBlur={() => {
                                  setHoverCaseId(null);
                                  setHoverCaseAnchor(null);
                                }}
                                aria-label={`${cluster.id} badcase ${caseIndex + 1}`}
                              />
                            );
                          });
                        })}
                      </div>

                      {hoveredCase && transformedHoverAnchor && (
                        <div
                          className="absolute z-[8] w-[190px] rounded-[9px] border border-slate-700 bg-[#111827] px-[9px] py-2 text-[11px] font-bold leading-normal text-slate-200 shadow-2xl"
                          style={{
                            left: `${Math.min(78, Math.max(8, transformedHoverAnchor.x + 2))}%`,
                            top: `${Math.min(76, Math.max(8, transformedHoverAnchor.y + 4))}%`,
                          }}
                        >
                          <div className="mb-1 text-slate-400">{hoveredCase.sourceCaseId}</div>
                          <div className="line-clamp-3">{hoveredCase.annotation.failureNote || hoveredCase.judgments[0]?.reason || hoveredCase.interaction.input}</div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="grid gap-2.5">
                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-slate-800 bg-[#0F0F16]/40 px-3 py-2.5">
                  <strong className="block text-xs font-black text-slate-50">根因聚合</strong>
                </div>

                <div className="grid gap-2.5">
                  {visibleClusters.map((cluster) => {
                    return (
                      <article key={cluster.id} className={cn("grid grid-cols-[42px_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border p-3", statusTone(cluster.status))}>
                        <span className="grid h-[30px] w-9 place-items-center rounded-[9px] bg-indigo-500/10 text-xs font-black text-indigo-300">{cluster.id}</span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-black leading-snug text-white">{cluster.name}</h3>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{cluster.summary}</p>
                          <div className="mt-2 text-xs leading-relaxed text-slate-300">
                            <b className="text-emerald-300">根因：</b>{cluster.rootCauseHypothesis}
                          </div>
                        </div>
                        <div className="grid justify-items-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCaseDrawerClusterId(cluster.id)}
                            className="rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-[11px] font-black text-slate-200 transition-colors hover:bg-slate-800"
                            title="查看关联 badcase"
                          >
                            {cluster.caseCount} cases ›
                          </button>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-black",
                              cluster.status === "rejected"
                                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                                : cluster.status === "accepted"
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                            )}
                          >
                            {cluster.status === "rejected" ? "已拒绝" : cluster.status === "accepted" ? "已采纳" : "待确认"}
                          </span>
                        </div>
                        <div className="col-start-2 col-end-4 grid gap-2 border-t border-slate-800 pt-2.5">
                          <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border border-slate-800 bg-[#0F0F16]/40 p-[9px]", cluster.status === "rejected" && "border-dashed opacity-70")}>
                            <div className="min-w-0">
                              <strong className="block text-xs font-black text-slate-200">
                                {cluster.status === "rejected"
                                  ? "本轮不进入生成，仅进入人工确认报告"
                                  : `生成${assetTypeLabel(cluster.recommendedStrategy.assetType)} ${cluster.recommendedStrategy.count} 条`}
                              </strong>
                              <span className="mt-[3px] block text-[11px] leading-normal text-slate-500">{assetImpactLabel(cluster)}</span>
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void onClusterStatusChange(cluster.id, "accepted")}
                                className="flex h-7 w-[30px] items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/15"
                                title={cluster.status === "rejected" ? "恢复采纳" : "采纳"}
                                aria-label={cluster.status === "rejected" ? "恢复采纳" : "采纳"}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void onClusterStatusChange(cluster.id, "rejected")}
                                className="flex h-7 w-[30px] items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/15"
                                title="拒绝"
                                aria-label="拒绝"
                              >
                                <X size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCluster(cluster)}
                                className="flex h-7 w-[30px] items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 transition-colors hover:bg-indigo-500/15"
                                title="编辑"
                                aria-label="编辑"
                              >
                                <Edit3 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-[10px] border border-slate-800 bg-[#0F0F16]/40 px-3 py-2.5">
                  <div>
                    <strong className="block text-xs font-black text-slate-50">默认 20 个根因 / 页</strong>
                    <span className="text-[11px] font-black text-slate-500">
                      {(rootCausePage - 1) * pageSize + 1}-{Math.min(rootCausePage * pageSize, clusters.length)} / {clusters.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRootCausePage((page) => Math.max(1, page - 1))}
                      disabled={rootCausePage === 1}
                      className="min-h-7 rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 text-[11px] font-black text-slate-300 disabled:opacity-40"
                    >
                      上一页
                    </button>
                    {Array.from({ length: totalPages }).map((_, pageIndex) => (
                      <button
                        key={pageIndex + 1}
                        type="button"
                        onClick={() => setRootCausePage(pageIndex + 1)}
                        className={cn(
                          "min-h-7 rounded-lg border px-2.5 text-[11px] font-black",
                          rootCausePage === pageIndex + 1
                            ? "border-slate-500/50 bg-slate-100/10 text-slate-100"
                            : "border-slate-700 bg-slate-900/60 text-slate-300",
                        )}
                      >
                        {pageIndex + 1}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRootCausePage((page) => Math.min(totalPages, page + 1))}
                      disabled={rootCausePage === totalPages}
                      className="min-h-7 rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 text-[11px] font-black text-slate-300 disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {caseDrawerClusterId && drawerCluster && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <div className="h-full w-[520px] overflow-y-auto border-l border-slate-800 bg-[#151520] p-5 shadow-2xl custom-scrollbar">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-cyan-300">{drawerCluster.id}</div>
                <h3 className="mt-1 text-lg font-bold text-white">{drawerCluster.name}</h3>
              </div>
              <button onClick={() => setCaseDrawerClusterId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              {drawerCases.map((caseItem) => (
                <div key={caseItem.id} className="rounded-2xl border border-slate-800 bg-[#1A1A27] p-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{caseItem.sourceCaseId}</span>
                    <span>完整度 {caseItem.completeness}</span>
                  </div>
                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <div className="mb-1 text-[11px] font-bold text-slate-500">输入</div>
                      <p className="text-slate-200">{caseItem.interaction.input || "—"}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-[11px] font-bold text-slate-500">实际输出</div>
                        <p className="text-slate-400">{caseItem.interaction.actualOutput || "—"}</p>
                      </div>
                      <div>
                        <div className="mb-1 text-[11px] font-bold text-slate-500">期望</div>
                        <p className="text-slate-400">{caseItem.expectation.expectedOutput || "—"}</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950/40 p-3 text-slate-300">{caseItem.annotation.failureNote || caseItem.judgments[0]?.reason || "无失败备注"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingCluster && (
        <StrategyEditor
          cluster={editingCluster}
          onClose={() => setEditingCluster(null)}
          onSave={(strategy) => void onUpdateStrategy(editingCluster.id, strategy).then(() => setEditingCluster(null))}
        />
      )}

      {assetModalOpen && packageFiles && assetPackage && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
          <div className="grid max-h-[86vh] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] rounded-3xl border border-slate-800 bg-[#151520] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <PackageCheck size={18} className="text-emerald-300" />
                  资产包
                </div>
                <div className="mt-1 text-xs text-slate-500">{snapshot?.package ? "已生成，可下载" : "预览结果"}</div>
              </div>
              <button onClick={() => setAssetModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="grid min-h-0 gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
              <div className="grid content-start gap-2">
                {DOWNLOAD_FILES.map((fileName) => (
                  <div
                    key={fileName}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAssetFile(fileName)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAssetFile(fileName);
                      }
                    }}
                    className={cn(
                      "flex min-h-[58px] items-center justify-between rounded-2xl border p-3 text-left transition-colors",
                      selectedAssetFile === fileName
                        ? "border-emerald-500/35 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/35 hover:bg-slate-900/70",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                        {fileName.endsWith(".jsonl") ? <FileText size={16} /> : <FileJson size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{fileName}</div>
                        <div className="text-xs text-slate-500">{packageFiles[fileName] ?? 0} 条</div>
                      </div>
                    </div>
                    {snapshot?.package && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onDownloadAsset(fileName);
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                        title="下载"
                        aria-label={`下载 ${fileName}`}
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="min-h-0 rounded-2xl border border-slate-800 bg-slate-950/45">
                <div className="flex min-h-[46px] items-center justify-between border-b border-slate-800 px-4">
                  <div className="truncate text-sm font-black text-white">{selectedAssetFile}</div>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-black text-slate-400">
                    {snapshot?.package ? "generated" : "preview"}
                  </span>
                </div>
                <pre className="max-h-[420px] overflow-auto p-4 text-[11px] leading-relaxed text-slate-300 custom-scrollbar">
                  <code>{selectedPreview}</code>
                </pre>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <span className="text-xs text-slate-500">
                {snapshot?.package ? "文件已生成，可下载进入训练或回归评测流程。" : "预览不会写入交付文件，确认后生成完整资产包。"}
              </span>
              {snapshot?.package ? (
                <button
                  type="button"
                  onClick={() => void onDownloadAsset(selectedAssetFile)}
                  className="flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-500"
                >
                  <Download size={14} />
                  下载当前文件
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void runAssetAction("package", onGeneratePackage)}
                  disabled={status !== "idle" || pendingAssetAction !== null}
                  className="flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {packagePending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                  {packagePending ? "生成资产包中" : "确认生成资产包"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StrategyEditor({
  cluster,
  onClose,
  onSave,
}: {
  cluster: ProblemCluster;
  onClose: () => void;
  onSave: (strategy: Partial<ProblemCluster["recommendedStrategy"]>) => void;
}) {
  const [count, setCount] = useState(cluster.recommendedStrategy.count);
  const [assetType, setAssetType] = useState<EvalAssetType>(cluster.recommendedStrategy.assetType);
  const [solution, setSolution] = useState(cluster.recommendedStrategy.solution);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-[#151520] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-cyan-300">{cluster.id}</div>
            <h3 className="mt-1 text-lg font-bold text-white">编辑生产策略</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["training_candidates", "eval_cases", "negative_cases"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setAssetType(type)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-bold",
                  assetType === type
                    ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-100"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800",
                )}
              >
                {assetTypeLabel(type)}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">生成数量</label>
            <input
              type="number"
              min="0"
              max="300"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400">解法抽象</label>
            <textarea
              rows={4}
              value={solution}
              onChange={(event) => setSolution(event.target.value)}
              className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
            />
          </div>
          <button
            onClick={() => onSave({ count, assetType, solution })}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-500"
          >
            <Box size={15} />
            应用到生产任务
          </button>
        </div>
      </div>
    </div>
  );
}
