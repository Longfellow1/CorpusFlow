/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  RotateCcw,
  RefreshCw,
  Save,
  Play,
  Download,
  Copy,
  MoreHorizontal,
  ChevronLeft,
  User,
  LogOut,
  Sparkles,
  MessageSquare,
  FileJson,
  FileSpreadsheet,
  Check,
  Edit3,
  History,
  LayoutGrid,
  Settings,
  AlertCircle,
  FileText,
  Trash2,
  Loader2,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { analyzeSentence, expandSeedFields, generateParaphrases, generateQA, generateInstruct } from "./services/geminiService";
import { apiService } from "./services/apiService";
import {
  buildQuickTaskInstructionText,
  buildQuickTaskInputText,
  buildQuickTaskSeedText,
  buildQuickTaskSystemText,
  parseQuickTaskFile,
  resolveQuickImportSystemTemplate,
  type QuickTaskKind,
} from "./utils/quickTaskImport";
import {
  clearQuickWorkspaceResults,
  createEmptyQuickWorkspaceState,
  createGenerationSnapshot,
  getFineTuneProgressPercent,
  reconcileSeedPreview,
  splitSeedInput,
} from "./utils/taskWorkspaceState";
import {
  DEFAULT_INSTRUCTION_SYSTEM_PROMPT,
  applyDefaultInstructionSystemPrompt,
  createEmptyInstructionSample,
  createEmptyMultiTurnSample,
  getMissingInstructionFields,
  getMissingMultiTurnFields,
  normalizeInstructionSample,
  normalizeInstructionSampleForEdit,
  normalizeMultiTurnSample,
  type InstructionSample,
  type MultiTurnSample,
} from "./utils/fineTuneDataContract";
import {
  getFineTuneOutputKind,
  isFineTuneMultiTurn,
  resolveFineTuneMode,
  resolveQuickRequestType,
  resolveQuickResultType,
  type FineTuneOutputKind,
  type QuickOutputKind,
} from "./utils/generationModeConfig";
import { detectRejectionRisk, type RejectionCheck } from "./utils/rejectionSafety";
import { getFineTuneModeContract, getMissingContractRequirements, getQuickModeContract } from "./utils/workspaceModeContract";
import { QuickTaskWorkspace } from "./components/QuickTaskWorkspace";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Task {
  id: string;
  name: string;
  time: string;
  active?: boolean;
  status: "running" | "completed" | "idle";
  businessType?: "evaluation" | "training";
  workMode?: "quick" | "advanced";
}

interface SeedData {
  id: string;
  text: string;
  analysis: {
    intent: string;
    subject: string;
    action: string;
    object: string;
    modifiers: string;
  };
  paraphrases: { text: string; type: 'convergence' | 'generalization' }[];
  qa: MultiTurnSample;
  instruct: InstructionSample;
  expansions: {
    subject: string[];
    action: string[];
    object: string[];
    modifiers: string[];
  };
  selectedExpansions: {
    subject: string[];
    action: string[];
    object: string[];
    modifiers: string[];
  };
  expansionStatus?: 'idle' | 'processing';
  styleAdjustmentDraft?: string;
  styleAdjustmentHistory?: string[];
  appliedStyleAdjustment?: string;
  paraphraseStatus?: 'idle' | 'processing';
  copyMessage?: string;
  status: 'pending' | 'processing' | 'completed';
  dirty?: boolean;
  rejection?: RejectionCheck;
}

interface GeneratedItem {
  id: string;
  type: 'single' | 'multi' | 'instruct';
  q: string;
  a: string;
  // instruct mode 专用
  system?: string;
  instruction?: string;
  input?: string;
  output?: string;
  // multi mode 专用
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  currentQuery?: string;
  response?: string;
  conversations?: Array<{ from: string; value: string }>;
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
      active ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/30" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    )}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);

const Card = ({ title, step, children, className, headerRight }: { title: string, step?: number, children: React.ReactNode, className?: string, headerRight?: React.ReactNode }) => (
  <div className={cn("bg-[#1E1E2D] border border-slate-800 rounded-xl flex flex-col h-full", className)}>
    <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
      {step && (
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
          {step}
        </div>
      )}
      <h3 className="text-[15px] font-bold text-slate-200 uppercase tracking-wide">{title}</h3>
      </div>
      {headerRight}
    </div>
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      {children}
    </div>
  </div>
);

const InputGroup = ({ label, value, placeholder, readOnly = false }: { label: string, value: string, placeholder?: string, readOnly?: boolean }) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-[15px] text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
    />
  </div>
);

type View = 'home' | 'fine-tune' | 'quick' | 'batch' | 'task-list';
type QuickWorkspaceSnapshot = ReturnType<typeof createEmptyQuickWorkspaceState>;
const MIN_SIDEBAR_RATIO = 1 / 6;
const MAX_SIDEBAR_RATIO = 1 / 3;
const DEFAULT_FINE_TUNE_SIDEBAR_WIDTH = 292;
const DEFAULT_QUICK_SIDEBAR_WIDTH = 320;
const ABSOLUTE_MIN_SIDEBAR_WIDTH = 260;
const ABSOLUTE_MAX_SIDEBAR_WIDTH = 520;
type FineTuneProgress = {
  stage: "idle" | "preparing" | "generating";
  completed: number;
  total: number;
};
type SaveSource = "auto" | "manual";
type SaveFeedback = "idle" | "done" | "auto";
type GenerationRequest = {
  taskId: string;
  mode: "single" | "multi" | "instruct" | "quick";
  multiTurnEnabled: boolean;
  expansionRatio: number;
  temperature: number;
  overallRequirement: string;
  multiTurnContext: string;
  styleAdjustment: string;
  seeds: SeedData[];
};

function getTaskView(task: Task): View {
  if (task.name.includes("批量")) return "quick";
  if (task.workMode === "quick" || task.name.includes("快速")) return "quick";
  return "fine-tune";
}

function getTaskBadge(task: Task) {
  const view = getTaskView(task);
  if (view === "batch") {
    return { label: "批量任务", className: "bg-sky-500/10 text-sky-400" };
  }
  if (view === "quick") {
    return { label: "批量任务", className: "bg-emerald-500/10 text-emerald-400" };
  }
  return { label: "精调生成", className: "bg-indigo-500/10 text-indigo-400" };
}

const MIN_EXPANSION_RATIO = 5;
const MAX_EXPANSION_RATIO = 100;
const MAX_EXPANSION_CANDIDATES = 7;
const MAX_SEED_PROCESS_CONCURRENCY = 2;
const AUTO_SAVE_ANIMATION_INTERVAL_MS = 30_000;

function createEmptyAnalysis() {
  return { intent: "", subject: "", action: "", object: "", modifiers: "" };
}

function createEmptyExpansions() {
  return { subject: [], action: [], object: [], modifiers: [] };
}

function createSeedForGeneration(seed: SeedData): SeedData {
  return {
    ...seed,
    expansions: seed.selectedExpansions || createEmptyExpansions(),
  };
}

function normalizeSeed(seed: Partial<SeedData> & Pick<SeedData, "id" | "text">): SeedData {
  const rejection = detectRejectionRisk(seed.text);
  return {
    id: seed.id,
    text: seed.text,
    analysis: seed.analysis || createEmptyAnalysis(),
    expansions: seed.expansions || createEmptyExpansions(),
    selectedExpansions: seed.selectedExpansions || seed.expansions || createEmptyExpansions(),
    expansionStatus: seed.expansionStatus || "idle",
    paraphrases: seed.paraphrases || [],
    qa: normalizeMultiTurnSample(seed.qa, seed.text),
    instruct: normalizeInstructionSample(seed.instruct, seed.text),
    styleAdjustmentDraft: seed.styleAdjustmentDraft || "",
    styleAdjustmentHistory: seed.styleAdjustmentHistory || [],
    appliedStyleAdjustment: seed.appliedStyleAdjustment || "",
    paraphraseStatus: seed.paraphraseStatus || "idle",
    copyMessage: seed.copyMessage || "",
    status: seed.status || "pending",
    dirty: seed.dirty || false,
    rejection,
  };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}

function appendExpansionCandidates(current: string[], incoming: string[]) {
  const normalizedCurrent = current.filter(Boolean);
  const merged = [...normalizedCurrent];
  const appended: string[] = [];

  for (const candidate of incoming.filter(Boolean)) {
    if (merged.length >= MAX_EXPANSION_CANDIDATES) break;
    if (merged.includes(candidate)) continue;
    merged.push(candidate);
    appended.push(candidate);
  }

  return { merged, appended };
}

function formatSavedAt(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [activeTask, setActiveTask] = useState("");
  const [mode, setMode] = useState<"single" | "multi" | "instruct" | "quick">("single");
  const [expansionRatio, setExpansionRatio] = useState(MIN_EXPANSION_RATIO);
  const [temperature, setTemperature] = useState(0.78);
  const [generationRequest, setGenerationRequest] = useState<GenerationRequest | null>(null);
  const [fineTuneProgress, setFineTuneProgress] = useState<FineTuneProgress>({ stage: "idle", completed: 0, total: 0 });
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>("idle");
  const [loginNudgeVisible, setLoginNudgeVisible] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isTaskDataLoaded, setIsTaskDataLoaded] = useState(false);
  const [seedInput, setSeedInput] = useState("我的车是不是该加玻璃水了\n什么时候应该保养\n冬天下午雪该用什么模式");
  const [seeds, setSeeds] = useState<SeedData[]>([]);
  const [overallRequirement, setOverallRequirement] = useState("");
  const [fineTuneMultiTurnEnabled, setFineTuneMultiTurnEnabled] = useState(false);
  const [multiTurnContext, setMultiTurnContext] = useState("");
  const [styleAdjustment, setStyleAdjustment] = useState("");
  const [generatedData, setGeneratedData] = useState<GeneratedItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskDataMap, setTaskDataMap] = useState<Record<string, { seeds: SeedData[], generated: GeneratedItem[] }>>({});
  const [newTaskName, setNewTaskName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [editingTaskName, setEditingTaskName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [batchFile, setBatchFile] = useState<{ name: string, size: string } | null>(null);
  const [batchStep, setBatchStep] = useState<'upload' | 'config' | 'running' | 'result'>('upload');
  const [batchConfig, setBatchConfig] = useState({
    generalization: 50,
    duplication: 3,
    mode: 'balanced' as 'conservative' | 'balanced' | 'creative'
  });
  const [quickWorkspaceByTask, setQuickWorkspaceByTask] = useState<Record<string, QuickWorkspaceSnapshot>>({});
  const [fineTuneSidebarWidth, setFineTuneSidebarWidth] = useState(DEFAULT_FINE_TUNE_SIDEBAR_WIDTH);
  const [quickSidebarWidth, setQuickSidebarWidth] = useState(DEFAULT_QUICK_SIDEBAR_WIDTH);

  // Login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [tempEmail, setTempEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'error' | 'info'}>>([]);
  const saveFeedbackTimerRef = useRef<number | null>(null);
  const lastAutoSaveAnimationAtRef = useRef(0);
  const quickGenerationRunRef = useRef(0);
  const quickAbortControllerRef = useRef<AbortController | null>(null);
  const quickJobIdRef = useRef<string | null>(null);
  const quickControlIntentRef = useRef<"pause" | "stop" | null>(null);
  const quickGeneratedItemsRef = useRef<GeneratedItem[]>([]);
  const currentQuickWorkspaceKey = activeTask || "__quick-adhoc__";
  const currentQuickWorkspace = quickWorkspaceByTask[currentQuickWorkspaceKey] ?? createEmptyQuickWorkspaceState();
  const {
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
    quickRunStatus,
    quickRunStats,
    quickRunProgress,
    quickCachedBatches,
    quickGeneratedItems,
    quickControlExpanded,
    quickInstructionTemplate,
    quickDiversity,
    quickGenerationIntent,
  } = currentQuickWorkspace;

  const updateQuickWorkspace = useCallback((patch: Partial<QuickWorkspaceSnapshot> | ((prev: QuickWorkspaceSnapshot) => Partial<QuickWorkspaceSnapshot>)) => {
    setQuickWorkspaceByTask((prev) => {
      const current = prev[currentQuickWorkspaceKey] ?? createEmptyQuickWorkspaceState();
      const nextPatch = typeof patch === "function" ? patch(current) : patch;
      return {
        ...prev,
        [currentQuickWorkspaceKey]: {
          ...current,
          ...nextPatch,
        },
      };
    });
  }, [currentQuickWorkspaceKey]);

  const fineTuneOutputKind: FineTuneOutputKind = mode === "instruct" ? "instruct" : "qa";
  const effectiveFineTuneMultiTurn = isFineTuneMultiTurn(
    mode === "quick" ? "single" : mode,
    fineTuneMultiTurnEnabled,
  );
  const setFineTuneOutputKind = useCallback((kind: FineTuneOutputKind) => {
    if (kind === "instruct") {
      setMultiTurnContext((prev) => prev.trim() ? prev : DEFAULT_INSTRUCTION_SYSTEM_PROMPT);
      setSeeds((prev) => prev.map((seed) => ({
        ...seed,
        instruct: applyDefaultInstructionSystemPrompt(normalizeInstructionSampleForEdit(seed.instruct, seed.text)),
      })));
    }
    setMode(resolveFineTuneMode(kind, fineTuneMultiTurnEnabled));
  }, [fineTuneMultiTurnEnabled]);
  const setFineTuneMultiTurn = useCallback((enabled: boolean) => {
    setFineTuneMultiTurnEnabled(enabled);
    setMode(resolveFineTuneMode(getFineTuneOutputKind(mode === "quick" ? "single" : mode), enabled));
  }, [mode]);

  const hydrateQuickWorkspaces = useCallback(async (taskList: Task[]) => {
    const quickTasks = taskList.filter((task) => getTaskView(task) === "quick");
    if (quickTasks.length === 0) return;
    const entries = await Promise.all(
      quickTasks.map(async (task) => {
        try {
          const workspace = await apiService.getWorkspace<QuickWorkspaceSnapshot>(task.id);
          return [task.id, workspace ? { ...createEmptyQuickWorkspaceState(), ...workspace } : createEmptyQuickWorkspaceState()] as const;
        } catch (error) {
          console.error("Failed to hydrate quick workspace", task.id, error);
          return null;
        }
      }),
    );
    setQuickWorkspaceByTask((prev) => ({
      ...prev,
      ...Object.fromEntries(entries.filter((entry): entry is readonly [string, QuickWorkspaceSnapshot] => entry !== null)),
    }));
  }, []);

  const resetCurrentQuickWorkspace = useCallback(() => {
    setQuickWorkspaceByTask((prev) => ({
      ...prev,
      [currentQuickWorkspaceKey]: createEmptyQuickWorkspaceState(),
    }));
  }, [currentQuickWorkspaceKey]);

  const clearCurrentQuickResults = useCallback(() => {
    setQuickWorkspaceByTask((prev) => ({
      ...prev,
      [currentQuickWorkspaceKey]: clearQuickWorkspaceResults(prev[currentQuickWorkspaceKey] ?? createEmptyQuickWorkspaceState()),
    }));
  }, [currentQuickWorkspaceKey]);

  const addToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, [hydrateQuickWorkspaces]);

  const clampExpansionRatio = (value: number) => {
    if (Number.isNaN(value)) return MIN_EXPANSION_RATIO;
    return Math.min(MAX_EXPANSION_RATIO, Math.max(MIN_EXPANSION_RATIO, Math.round(value)));
  };

  const clampSidebarWidth = useCallback((value: number) => {
    const viewportWidth = window.innerWidth || 1440;
    const minWidth = Math.max(ABSOLUTE_MIN_SIDEBAR_WIDTH, viewportWidth * MIN_SIDEBAR_RATIO);
    const maxWidth = Math.min(ABSOLUTE_MAX_SIDEBAR_WIDTH, viewportWidth * MAX_SIDEBAR_RATIO);
    return Math.round(Math.min(maxWidth, Math.max(minWidth, value)));
  }, []);

  const beginSidebarResize = useCallback((
    event: React.MouseEvent<HTMLDivElement>,
    initialWidth: number,
    setWidth: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = initialWidth;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      setWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX));
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clampSidebarWidth]);

  const saveCurrentWorkspace = useCallback(async (source: SaveSource) => {
    if (!isLoggedIn || !activeTask) return;

    try {
      const activeTaskRecord = tasks.find((task) => task.id === activeTask);
      const shouldSaveQuickWorkspace = view === "quick" || activeTaskRecord?.workMode === "quick";
      if (shouldSaveQuickWorkspace) {
        await apiService.saveWorkspace(activeTask, currentQuickWorkspace);
      } else {
        await Promise.all([
          apiService.saveSeeds(activeTask, seeds),
          apiService.saveGenerated(activeTask, generatedData),
        ]);
      }
      setLastSavedAt(formatSavedAt(new Date()));
      if (source === "manual") {
        if (saveFeedbackTimerRef.current !== null) {
          window.clearTimeout(saveFeedbackTimerRef.current);
        }
        setSaveFeedback("done");
        saveFeedbackTimerRef.current = window.setTimeout(() => {
          setSaveFeedback("idle");
          saveFeedbackTimerRef.current = null;
        }, 3000);
      } else {
        const now = Date.now();
        if (now - lastAutoSaveAnimationAtRef.current >= AUTO_SAVE_ANIMATION_INTERVAL_MS) {
          if (saveFeedbackTimerRef.current !== null) {
            window.clearTimeout(saveFeedbackTimerRef.current);
          }
          lastAutoSaveAnimationAtRef.current = now;
          setSaveFeedback("auto");
          saveFeedbackTimerRef.current = window.setTimeout(() => {
            setSaveFeedback("idle");
            saveFeedbackTimerRef.current = null;
          }, 900);
        }
      }
    } catch (error) {
      console.error("Failed to save workspace", error);
      if (source === "manual") {
        addToast("保存失败，请稍后重试");
      }
    }
  }, [activeTask, addToast, currentQuickWorkspace, generatedData, isLoggedIn, seeds, tasks, view]);

  useEffect(() => {
    quickGeneratedItemsRef.current = quickGeneratedItems as GeneratedItem[];
  }, [quickGeneratedItems]);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimerRef.current !== null) {
        window.clearTimeout(saveFeedbackTimerRef.current);
      }
    };
  }, []);

  const requireLoginForWorkspace = useCallback(() => {
    if (isLoggedIn) return true;
    setLoginError("");
    setLoginNudgeVisible(true);
    window.setTimeout(() => setLoginNudgeVisible(false), 2500);
    return false;
  }, [isLoggedIn]);

  const createWorkspaceTask = useCallback(async (workMode: "quick" | "advanced") => {
    const nextMode = workMode === "quick" ? "quick" : "single";
    const taskName = workMode === "quick"
      ? `批量任务-${new Date().toLocaleTimeString()}`
      : `精调任务-${new Date().toLocaleTimeString()}`;
    const newTask = await apiService.createTask({
      name: taskName,
      businessType: workMode === "quick" ? "evaluation" : "training",
      workMode,
    });
    setTasks((prev) => [newTask as Task, ...prev]);
    setActiveTask(newTask.id);
    setView(workMode === "quick" ? "quick" : "fine-tune");
    setMode(nextMode);
    if (workMode === "advanced") {
      setFineTuneMultiTurnEnabled(false);
    }
    setTaskDataMap((prev) => ({
      ...prev,
      [newTask.id]: { seeds: [], generated: [] },
    }));
    if (workMode === "quick") {
      setQuickWorkspaceByTask((prev) => ({
        ...prev,
        [newTask.id]: createEmptyQuickWorkspaceState(),
      }));
    }
    return newTask as Task;
  }, []);

  const openFineTuneWorkspace = useCallback(async () => {
    if (!requireLoginForWorkspace()) return;
    const activeTaskRecord = tasks.find((task) => task.id === activeTask);
    const targetTask = activeTaskRecord && getTaskView(activeTaskRecord) === "fine-tune"
      ? activeTaskRecord
      : tasks.find((task) => getTaskView(task) === "fine-tune");
    if (targetTask) {
      setActiveTask(targetTask.id);
    } else {
      try {
        await createWorkspaceTask("advanced");
        return;
      } catch (error) {
        console.error("Create fine-tune task failed", error);
        setApiError("创建精调任务失败");
        return;
      }
    }
    setView('fine-tune');
    setMode('single');
    setFineTuneMultiTurnEnabled(false);
  }, [activeTask, createWorkspaceTask, requireLoginForWorkspace, tasks]);

  const openQuickWorkspace = useCallback(async () => {
    if (!requireLoginForWorkspace()) return;
    const activeTaskRecord = tasks.find((task) => task.id === activeTask);
    const targetTask = activeTaskRecord && getTaskView(activeTaskRecord) === "quick"
      ? activeTaskRecord
      : tasks.find((task) => getTaskView(task) === "quick");
    if (targetTask) {
      setActiveTask(targetTask.id);
    } else {
      try {
        await createWorkspaceTask("quick");
        return;
      } catch (error) {
        console.error("Create quick task failed", error);
        setApiError("创建批量任务失败");
        return;
      }
    }
    setView('quick');
    setMode('quick');
  }, [activeTask, createWorkspaceTask, requireLoginForWorkspace, tasks]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = tempEmail.trim();
    const password = tempPassword.trim();

    if (email.length < 3) {
      setLoginError("账号过短，请输入有效邮箱");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLoginError("请输入有效邮箱");
      return;
    }
    if (password.length < 3) {
      setLoginError("密码过短，至少 3 位");
      return;
    }

    try {
      setLoginError("");
      const login = await apiService.login(email, password);
      apiService.setSession(login.token, login.user.email);
      setUserEmail(login.user.email);
      setIsLoggedIn(true);
      setTempPassword("");

      const nextTasks = await apiService.getTasks();
        setTasks(nextTasks as Task[]);
        setTaskDataMap({});
        setQuickWorkspaceByTask({});
        setGenerationRequest(null);
        setLastSavedAt("");
        setIsTaskDataLoaded(false);
        void hydrateQuickWorkspaces(nextTasks as Task[]);
        const first = nextTasks[0];
        setActiveTask(first?.id || "");
    } catch (error) {
      console.error("Login failed", error);
      const message = error instanceof Error ? error.message : "";
      setLoginError(message.includes("email") || message.includes("邮箱") ? "请输入有效邮箱" : "账号或密码错误，请重新输入");
    }
  };

  const handleLogout = () => {
    apiService.clearToken();
    setIsLoggedIn(false);
    setUserEmail("");
    setTempEmail("");
    // Clear current state
    setTasks([]);
    setActiveTask("");
    setSeeds([]);
    setGeneratedData([]);
    setTaskDataMap({});
    setQuickWorkspaceByTask({});
    setGenerationRequest(null);
    setIsTaskDataLoaded(false);
    setLastSavedAt("");
  };

  // Calculate task progress
  const completedSeeds = seeds.filter(s => s.status === 'completed').length;
  const isGenerating = generationRequest !== null || batchGenerating;
  const seedInputLineCount = seedInput.split('\n').filter(line => line.trim()).length;
  const fineTuneBlockReason = seedInputLineCount === 0
    ? "请输入至少一条种子语句"
    : mode === "instruct" && !multiTurnContext.trim()
      ? "指令微调需要填写助手角色"
      : isGenerating
        ? "正在生成中"
        : "";
  const canRunFineTune = !fineTuneBlockReason;
  const fineTuneProgressPercent = getFineTuneProgressPercent(fineTuneProgress);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const session = apiService.getStoredSession();
      if (!session.token) {
        setTasks([]);
        setTaskDataMap({});
        setIsLoading(false);
        return;
      }

      try {
        const nextTasks = await apiService.getTasks();
        if (cancelled) return;
        setIsLoggedIn(true);
        setUserEmail(session.email);
        setTasks(nextTasks as Task[]);
        setTaskDataMap({});
        setQuickWorkspaceByTask({});
        setGenerationRequest(null);
        void hydrateQuickWorkspaces(nextTasks as Task[]);
        setActiveTask((nextTasks as Task[])[0]?.id || "");
      } catch (error) {
        console.error("Failed to restore session", error);
        apiService.clearToken();
        if (!cancelled) {
          setIsLoggedIn(false);
          setUserEmail("");
          setTasks([]);
          setTaskDataMap({});
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync active task data to state
  useEffect(() => {
    if (!isLoggedIn) {
      setSeeds([]);
      setGeneratedData([]);
      setSeedInput("");
      return;
    }

    if (activeTask && taskDataMap[activeTask]) {
      const data = taskDataMap[activeTask];
      setSeeds(data.seeds || []);
      setGeneratedData(data.generated || []);
      if (data.seeds && data.seeds.length > 0) {
        setSeedInput(data.seeds.map(s => s.text).join("\n"));
      }
    } else if (activeTask) {
      // Initialize empty data for new task if not in map
      setSeeds([]);
      setGeneratedData([]);
      setSeedInput("");
    }
  }, [activeTask, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !activeTask) return;

    let cancelled = false;
    setIsTaskDataLoaded(false);

    (async () => {
      try {
        const [nextSeeds, nextGenerated, nextWorkspace] = await Promise.all([
          apiService.getSeeds(activeTask),
          apiService.getGenerated(activeTask),
          apiService.getWorkspace<QuickWorkspaceSnapshot>(activeTask),
        ]);

        if (cancelled) return;
        const normalizedSeeds = (nextSeeds as SeedData[]).map((seed) => normalizeSeed(seed));
        const normalizedQuickWorkspace = nextWorkspace
          ? { ...createEmptyQuickWorkspaceState(), ...nextWorkspace }
          : createEmptyQuickWorkspaceState();
        setTaskDataMap((prev) => ({
          ...prev,
          [activeTask]: {
            seeds: normalizedSeeds,
            generated: nextGenerated as GeneratedItem[],
          },
        }));
        setQuickWorkspaceByTask((prev) => ({
          ...prev,
          [activeTask]: normalizedQuickWorkspace,
        }));
        setSeeds(normalizedSeeds);
        setGeneratedData(nextGenerated as GeneratedItem[]);
        if (normalizedSeeds.length > 0) {
          setSeedInput(normalizedSeeds.map((s) => s.text).join("\n"));
        }
        setIsTaskDataLoaded(true);
      } catch (error) {
        console.error("Failed to load task data", error);
        if (!cancelled) {
          setIsTaskDataLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTask, isLoggedIn]);

  // Save to map whenever seeds or generatedData change
  useEffect(() => {
    if (!activeTask) return;

    setTaskDataMap(prev => ({
      ...prev,
      [activeTask]: {
        seeds,
        generated: generatedData
      }
    }));
  }, [seeds, generatedData, activeTask]);

  useEffect(() => {
    if (!isLoggedIn || !activeTask || !isTaskDataLoaded) return;

    const timeout = setTimeout(() => {
      saveCurrentWorkspace("auto");
    }, 300);

    return () => clearTimeout(timeout);
  }, [activeTask, currentQuickWorkspace, generatedData, isLoggedIn, isTaskDataLoaded, saveCurrentWorkspace, seeds]);

  // Generation Loop
  useEffect(() => {
    if (!generationRequest || view === "batch") return;

    let cancelled = false;

    (async () => {
      try {
        setFineTuneProgress({ stage: "preparing", completed: 0, total: generationRequest.seeds.length });
        const readySeeds = await runWithConcurrency<SeedData, SeedData>(
          generationRequest.seeds,
          MAX_SEED_PROCESS_CONCURRENCY,
          async (seed) => {
            if (!seedNeedsPreviewForMode(seed, generationRequest.mode, generationRequest.multiTurnEnabled)) {
              if (!cancelled) {
                setFineTuneProgress((prev) => ({
                  ...prev,
                  completed: Math.min(prev.completed + 1, prev.total),
                }));
              }
              return seed;
            }
            const processed = await processSeed(seed, generationRequest);
            if (!processed) {
              throw new Error("上游种子解析失败");
            }
            if (!cancelled) {
              setFineTuneProgress((prev) => ({
                ...prev,
                completed: Math.min(prev.completed + 1, prev.total),
              }));
            }
            return processed;
          },
        );

        if (!cancelled) {
          setFineTuneProgress({ stage: "generating", completed: readySeeds.length, total: readySeeds.length });
        }
        const generationSeeds = readySeeds.filter((seed) => !seed.rejection?.blocked);
        if (generationSeeds.length === 0) {
          setGeneratedData([]);
          return;
        }

        const result = await apiService.generate(generationRequest.taskId, {
          task: {
            mode: generationRequest.mode,
            expansionRatio: generationRequest.expansionRatio,
            temperature: generationRequest.temperature,
            multiTurnEnabled: generationRequest.multiTurnEnabled,
            overallRequirement: generationRequest.overallRequirement,
            multiTurnContext: generationRequest.multiTurnContext,
            styleAdjustment: generationRequest.styleAdjustment,
          },
          seeds: generationSeeds,
        });

        if (cancelled) return;
        setGeneratedData(result.items as GeneratedItem[]);
      } catch (error) {
        console.error("Generation failed", error);
        setApiError("批量生成失败，请检查后端或算法服务");
      } finally {
        if (!cancelled) {
          setGenerationRequest(null);
          setFineTuneProgress({ stage: "idle", completed: 0, total: 0 });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generationRequest, view]);

  const handleCreateTask = async () => {
    const name = newTaskName || `新任务-${new Date().toLocaleTimeString()}`;
    const workMode = view === "quick" || mode === "quick" ? "quick" : "advanced";
    try {
      const newTask = await apiService.createTask({
        name,
        businessType: mode === "instruct" ? "training" : "evaluation",
        workMode,
      });

      setTasks((prev) => [newTask as Task, ...prev]);
      setNewTaskName("");
      setActiveTask(newTask.id);
      setView(workMode === "quick" ? "quick" : "fine-tune");
      setMode(workMode === "quick" ? "quick" : "single");
      if (workMode === "advanced") {
        setFineTuneMultiTurnEnabled(false);
      }
      setTaskDataMap((prev) => ({
        ...prev,
        [newTask.id]: { seeds: [], generated: [] },
      }));
    } catch (error) {
      console.error("Create task failed", error);
      setApiError("创建任务失败");
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除该任务及其所有数据吗？")) {
      try {
        await apiService.deleteTask(id);
      } catch (error) {
        console.error("Delete task failed", error);
      }
      setTasks(prev => prev.filter(t => t.id !== id));
      setTaskDataMap(prev => {
        const newMap = { ...prev };
        delete newMap[id];
        return newMap;
      });
      setQuickWorkspaceByTask(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeTask === id) {
        setActiveTask("");
        setSeeds([]);
        setGeneratedData([]);
      }
    }
  };

  const beginEditTaskName = (task: Task, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingTaskId(task.id);
    setEditingTaskName(task.name);
  };

  const cancelEditTaskName = () => {
    setEditingTaskId("");
    setEditingTaskName("");
  };

  const submitTaskName = async (taskId: string) => {
    const name = editingTaskName.trim();
    if (!name) {
      cancelEditTaskName();
      return;
    }
    try {
      const updatedTask = await apiService.updateTask(taskId, { name });
      setTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, ...updatedTask } : task));
      cancelEditTaskName();
    } catch (error) {
      console.error("Rename task failed", error);
      addToast(error instanceof Error ? error.message : "任务重命名失败");
    }
  };

  const clearQuickWorkspace = () => {
    resetCurrentQuickWorkspace();
  };

  const handleQuickImport = async (file: File) => {
    updateQuickWorkspace({
      quickImportStatus: "parsing",
      quickImportError: "",
      quickFile: {
        name: file.name,
        size: `${Math.max(1, Math.round(file.size / 1024))}KB`,
      },
    });
    try {
      const parsed = await parseQuickTaskFile(file);
      const parsedKind = parsed.kind === "multi" ? "qa" : parsed.kind;
      updateQuickWorkspace({
        quickFile: {
          name: file.name,
          size: `${Math.max(1, Math.round(file.size / 1024))}KB`,
        },
        quickTaskKind: parsedKind,
        quickMultiTurnEnabled: parsed.kind === "multi",
        quickInstructionTemplate: parsedKind === "instruct"
          ? resolveQuickImportSystemTemplate(parsed.rows, quickInstructionTemplate.trim() ? quickInstructionTemplate : DEFAULT_INSTRUCTION_SYSTEM_PROMPT)
          : quickInstructionTemplate,
        quickRows: parsed.rows,
        quickHeaders: parsed.headers,
        quickColumns: parsed.columns,
        quickWarnings: parsed.warnings,
        quickGeneratedItems: [],
        quickRunStats: null,
        quickRunProgress: null,
        quickRunStatus: "idle",
        quickImportStatus: "ready",
      });
    } catch (error) {
      console.error("Quick import failed", error);
      updateQuickWorkspace({
        quickImportStatus: "error",
        quickImportError: error instanceof Error ? error.message : "文件解析失败",
        quickRows: [],
        quickHeaders: [],
        quickColumns: {
          query: undefined,
          input: undefined,
          output: undefined,
          instruction: undefined,
          system: undefined,
          history: undefined,
        },
        quickWarnings: [],
      });
    }
  };

  const normalizeQuickGeneratedItems = (
    rawItems: Array<any>,
    kind: QuickOutputKind,
    multiTurnEnabled: boolean,
    seedIndexMap: number[],
  ) => rawItems.map((item: any) => {
    const mappedSeedIndex = typeof item.seed_index === "number"
      ? seedIndexMap[item.seed_index] ?? item.seed_index
      : undefined;
    const base = {
      id: item.id || `quick-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      seedIndex: mappedSeedIndex,
    };
    const resultType = resolveQuickResultType(kind, multiTurnEnabled);
    switch (resultType) {
      case "instruct":
        return {
          ...base,
          type: "instruct" as const,
          q: item.instruction ?? item.currentQuery ?? "",
          a: item.response ?? item.output ?? "",
          system: item.system ?? "",
          instruction: item.instruction ?? item.currentQuery ?? "",
          input: item.input ?? "",
          output: item.output ?? item.response ?? "",
          history: item.history ?? [],
          currentQuery: item.currentQuery ?? item.instruction ?? "",
          response: item.response ?? item.output ?? "",
          conversations: item.conversations ?? [],
        };
      case "multi":
        return {
          ...base,
          type: "multi" as const,
          history: item.history ?? [],
          currentQuery: item.currentQuery ?? item.q ?? "",
          response: item.response ?? item.a ?? "",
          conversations: item.conversations ?? [],
          q: item.currentQuery ?? item.q ?? "",
          a: item.response ?? item.a ?? "",
        };
      default:
        return { ...base, type: "single" as const, q: item.q ?? "", a: item.a ?? "" };
    }
  });

  const handleQuickGenerate = async () => {
    const quickOutputKind = (quickTaskKind === "multi" ? "qa" : quickTaskKind) as QuickOutputKind;
    const quickContract = getQuickModeContract(quickOutputKind);
    if (quickRows.length === 0) {
      updateQuickWorkspace({ quickImportError: "请先导入文件" });
      return;
    }

    const seedEntries = quickRows
      .map((row, index) => ({
        index,
        text: buildQuickTaskSeedText(row, quickTaskKind).trim(),
        instruction: buildQuickTaskInstructionText(row),
        system: buildQuickTaskSystemText(row, quickInstructionTemplate),
        input: buildQuickTaskInputText(row),
        rejection: detectRejectionRisk(buildQuickTaskSeedText(row, quickTaskKind).trim()),
      }))
      .filter((entry) => entry.text && !entry.rejection.blocked);
    const seeds = seedEntries.map((entry) => entry.text);
    const hasInstructionForEverySeed = quickOutputKind !== "instruct"
      || seedEntries.every((entry) => entry.instruction.trim().length > 0);
    const hasSystemForEverySeed = quickOutputKind !== "instruct"
      || seedEntries.every((entry) => entry.system.trim().length > 0);

    const missing = getMissingContractRequirements(quickContract, {
      importedRows: seeds,
      instruction: hasInstructionForEverySeed && hasSystemForEverySeed ? "ready" : "",
    });
    if (missing.length > 0) {
      updateQuickWorkspace({
        quickImportError: missing.includes("instruction")
          ? !hasInstructionForEverySeed
            ? "必须在上传文件中提供 instruction/query/question/user_query/问题 等用户问题字段"
            : "指令微调必须填写助手角色，或在上传文件中提供 system/role/persona/角色设定 列"
          : "没有可用于生成的有效行",
      });
      return;
    }

    const isResume = quickRunStatus === "paused";
    const completedSeedIndexes = isResume
      ? new Set(quickGeneratedItems.map((item) => item.seedIndex).filter((index): index is number => typeof index === "number"))
      : new Set<number>();
    const pendingSeedEntries = seeds
      .map((text, index) => ({ ...seedEntries[index], text }))
      .filter((entry) => !completedSeedIndexes.has(entry.index));

    if (pendingSeedEntries.length === 0) {
      updateQuickWorkspace({
        quickRunStatus: quickGeneratedItems.length > 0 ? "done" : "idle",
        quickImportError: quickGeneratedItems.length > 0 ? "" : "全部为拒识样本，未进入普通生成",
      });
      return;
    }

    const runId = quickGenerationRunRef.current + 1;
    quickGenerationRunRef.current = runId;
    quickControlIntentRef.current = null;
    const jobId = `quick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const abortController = new AbortController();
    quickJobIdRef.current = jobId;
    quickAbortControllerRef.current = abortController;
    let progressTimer: number | null = null;

    try {
      updateQuickWorkspace({
        quickRunStatus: "running",
        quickImportError: "",
        quickRunProgress: {
          total: pendingSeedEntries.length,
          done: 0,
          errors: 0,
          status: "running",
        },
      });
      progressTimer = window.setInterval(() => {
        if (quickGenerationRunRef.current !== runId) return;
        void apiService.getQuickGenerateProgress(jobId)
          .then((progress) => {
            if (quickGenerationRunRef.current !== runId) return;
            updateQuickWorkspace({
              quickRunProgress: progress,
            });
          })
          .catch(() => {
            // The progress entry is briefly unavailable after a very fast finish.
          });
      }, 500);
      const result = await apiService.quickGenerate({
        job_id: jobId,
        seeds: pendingSeedEntries.map((entry) => entry.text),
        type: resolveQuickRequestType(quickOutputKind, quickMultiTurnEnabled),
        multi_turn: quickMultiTurnEnabled,
        target_per_seed: quickTargetPerSeed,
        filter_strength: quickFilterStrength,
        concurrency: quickConcurrency,
        diversity: quickDiversity,
        generation_intent: quickGenerationIntent.trim() || undefined,
        system_prompt: quickOutputKind === "instruct" && quickInstructionTemplate.trim()
          ? quickInstructionTemplate.trim()
          : undefined,
        seed_instructions: quickOutputKind === "instruct"
          ? pendingSeedEntries.map((entry) => entry.instruction)
          : undefined,
        seed_systems: quickOutputKind === "instruct"
          ? pendingSeedEntries.map((entry) => entry.system)
          : undefined,
        seed_inputs: quickOutputKind === "instruct"
          ? pendingSeedEntries.map((entry) => entry.input)
          : undefined,
      }, abortController.signal);

      if (quickGenerationRunRef.current !== runId) return;

      const nextItems = normalizeQuickGeneratedItems(
        result.items,
        quickOutputKind,
        quickMultiTurnEnabled,
        pendingSeedEntries.map((entry) => entry.index),
      );
      const finalItems = isResume ? [...quickGeneratedItems, ...nextItems] : nextItems;
      const previousGeneratedCount = isResume
        ? quickRunStats?.total_generated ?? quickGeneratedItems.length
        : 0;
      const totalGenerated = previousGeneratedCount + result.stats.total_generated;
      const nextStats = {
        seeds_count: seeds.length,
        total_generated: totalGenerated,
        total_retained: finalItems.length,
        pass_rate: totalGenerated > 0 ? Number((finalItems.length / totalGenerated).toFixed(4)) : 0,
      };
      const controlIntent = quickControlIntentRef.current;
      const completedAfterRun = new Set(finalItems.map((item) => item.seedIndex).filter((index): index is number => typeof index === "number"));
      const hasPendingSeeds = completedAfterRun.size < seeds.length;
      const nextBatch = {
        id: `batch-${Date.now()}`,
        label: `批次 ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        createdAt: new Date().toISOString(),
        items: finalItems,
        stats: nextStats,
      };
      updateQuickWorkspace((prev) => ({
        quickGeneratedItems: finalItems,
        quickRunStats: nextStats,
        quickCachedBatches: [
          nextBatch,
          ...(prev.quickCachedBatches || []).filter((batch) => batch.items.length > 0),
        ].slice(0, 3),
        quickRunProgress: {
          total: pendingSeedEntries.length,
          done: pendingSeedEntries.length,
          errors: result.errors?.length ?? 0,
          status: result.status === "cancelled" ? "cancelled" : "done",
        },
        quickRunStatus: controlIntent === "pause" && hasPendingSeeds
          ? "paused"
          : finalItems.length > 0 || result.status !== "cancelled"
            ? "done"
            : "idle",
      }));
    } catch (error) {
      if (quickGenerationRunRef.current !== runId || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      console.error("Quick generation failed", error);
      updateQuickWorkspace({
        quickRunStatus: "idle",
        quickImportError: error instanceof Error ? error.message : "批量任务生成失败",
      });
    } finally {
      if (progressTimer !== null) {
        window.clearInterval(progressTimer);
      }
      if (quickGenerationRunRef.current === runId) {
        quickAbortControllerRef.current = null;
        quickJobIdRef.current = null;
        quickControlIntentRef.current = null;
      }
    }
  };

  const handlePauseQuickGeneration = useCallback(() => {
    quickControlIntentRef.current = "pause";
    const jobId = quickJobIdRef.current;
    if (jobId) {
      void apiService.cancelQuickGenerate(jobId).catch((error) => {
        console.warn("Failed to pause quick generation", error);
      });
    }
    updateQuickWorkspace({ quickRunStatus: "stopping" });
  }, [updateQuickWorkspace]);

  const handleStopQuickGeneration = useCallback(() => {
    quickControlIntentRef.current = "stop";
    const jobId = quickJobIdRef.current;
    if (jobId) {
      void apiService.cancelQuickGenerate(jobId).catch((error) => {
        console.warn("Failed to stop quick generation", error);
      });
    }
    updateQuickWorkspace({ quickRunStatus: "stopping" });
  }, [updateQuickWorkspace]);

  const navigateToView = useCallback((nextView: View) => {
    if (view === "quick" && nextView !== "quick" && quickRunStatus === "running") {
      handlePauseQuickGeneration();
    }
    setView(nextView);
  }, [handlePauseQuickGeneration, quickRunStatus, view]);

  const openTask = useCallback((task: Task) => {
    setActiveTask(task.id);
    const nextView = getTaskView(task);
    navigateToView(nextView);
    setMode(nextView === "quick" ? "quick" : "single");
    if (nextView === "fine-tune") {
      setFineTuneMultiTurnEnabled(false);
    }
  }, [navigateToView]);

  const buildGenerationRequest = (seedSnapshot: SeedData[]): GenerationRequest => createGenerationSnapshot({
    taskId: activeTask || `temp-${Date.now()}`,
    mode,
    multiTurnEnabled: effectiveFineTuneMultiTurn,
    expansionRatio,
    temperature,
    overallRequirement,
    multiTurnContext,
    styleAdjustment,
    seeds: seedSnapshot.map(createSeedForGeneration),
  });

  const seedHasPreviewForMode = (seed: SeedData, requestMode: GenerationRequest["mode"], multiTurnEnabled = false) => {
    if (seed.rejection?.blocked) return true;
    if (requestMode === "multi" || multiTurnEnabled) {
      if (getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).length > 0) {
        return false;
      }
    }
    if (requestMode === "multi") {
      return getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).length === 0;
    }
    if (requestMode === "instruct") {
      return getMissingInstructionFields(normalizeInstructionSampleForEdit(seed.instruct, seed.text)).length === 0;
    }
    if (requestMode === "single") {
      return (seed.paraphrases?.length || 0) > 0;
    }
    return seed.status === "completed";
  };

  const seedNeedsPreviewForMode = (seed: SeedData, requestMode: GenerationRequest["mode"], multiTurnEnabled = false) => (
    seed.dirty || seed.status !== "completed" || !seedHasPreviewForMode(seed, requestMode, multiTurnEnabled)
  );

  const handleGeneratePreview = async () => {
    if (!canRunFineTune) return;
    if (mode !== "quick") {
      const contract = getFineTuneModeContract(mode);
      const missing = getMissingContractRequirements(contract, { seeds: splitSeedInput(seedInput) });
      if (missing.length > 0) return;
    }

    const reconciled = reconcileSeedPreview(seeds, seedInput, ({ id, text }) => normalizeSeed({
      id,
      text,
      status: "pending",
      dirty: false,
    }));

    setSeeds(reconciled.seeds);
    if (reconciled.seeds.length === 0) return;

    const request = buildGenerationRequest(reconciled.seeds);
    const seedsToPreview = reconciled.seeds.filter((seed) => seedNeedsPreviewForMode(seed, request.mode, request.multiTurnEnabled));
    await runWithConcurrency<SeedData, SeedData | null>(
      seedsToPreview,
      MAX_SEED_PROCESS_CONCURRENCY,
      (seed) => processSeed(seed, request),
    );
  };

  const handleGenerateCorpus = () => {
    if (!canRunFineTune) return;
    const seedSnapshot = reconcileSeedPreview(seeds, seedInput, ({ id, text }) => normalizeSeed({
      id,
      text,
      status: "pending",
      dirty: false,
    })).seeds;

    if (seedSnapshot.length === 0) return;
    setSeeds(seedSnapshot);
    setApiError("");
    setGenerationRequest(buildGenerationRequest(seedSnapshot));
  };

  const processSeed = async (seed: SeedData, request: GenerationRequest): Promise<SeedData | null> => {
    if (seed.rejection?.blocked) {
      const rejectedSeed = {
        ...seed,
        dirty: false,
        status: "completed" as const,
      };
      setSeeds((prev) => prev.map((item) => item.id === seed.id ? rejectedSeed : item));
      return rejectedSeed;
    }

    setSeeds((prev) => prev.map((item) => item.id === seed.id ? { ...item, status: "processing" } : item));

    try {
      const businessType = request.mode === "instruct" ? "training" : "evaluation";
      const workMode = request.mode === "quick" ? "quick" : "advanced";
      const analysis = await analyzeSentence(seed.text, {
        overallRequirement: request.overallRequirement,
        styleAdjustment: request.styleAdjustment,
        multiTurnContext: request.multiTurnContext,
        businessType,
        workMode,
      });
      const expansions = await expandSeedFields(seed.text, analysis, {
        overallRequirement: request.overallRequirement,
        workMode,
        businessType,
      });
      const paraphrases = await generateParaphrases(seed.text, analysis, {
        expansions,
        style: request.styleAdjustment,
        overallRequirement: request.overallRequirement,
        multiTurnContext: request.multiTurnContext,
        workMode,
        businessType,
      });

      let qa: SeedData["qa"] = createEmptyMultiTurnSample(seed.text);
      let instruct: SeedData["instruct"] = createEmptyInstructionSample(seed.text);

      if (request.mode === 'multi' || request.multiTurnEnabled) {
        qa = normalizeMultiTurnSample(await generateQA(seed.text, {
          context: request.multiTurnContext,
          overallRequirement: request.overallRequirement,
          styleAdjustment: request.styleAdjustment,
        }), seed.text);
      }
      if (request.mode === 'instruct') {
        const generatedInstruct = normalizeInstructionSample(await generateInstruct(seed.text, {
          context: request.multiTurnContext,
          overallRequirement: request.overallRequirement,
          styleAdjustment: request.styleAdjustment,
        }), seed.text);
        instruct = {
          ...generatedInstruct,
          system: generatedInstruct.system || request.multiTurnContext.trim() || DEFAULT_INSTRUCTION_SYSTEM_PROMPT,
        };
      }

      const processedSeed: SeedData = {
        ...seed,
        analysis,
        expansions,
        selectedExpansions: expansions,
        paraphrases,
        qa,
        instruct,
        expansionStatus: 'idle',
        paraphraseStatus: 'idle',
        dirty: false,
        status: 'completed'
      };

      setSeeds((prev) => prev.map((item) => item.id === seed.id ? processedSeed : item));
      return processedSeed;
    } catch (error) {
      console.error("Error processing seed:", error);
      addToast(error instanceof Error ? error.message : '句子解析失败');
      setSeeds((prev) => prev.map((item) => item.id === seed.id ? { ...item, status: 'pending' } : item));
      return null;
    }
  };

  const handleRegenerateParaphrase = async (id: string, styleInput?: string) => {
    const seed = seeds.find(s => s.id === id);
    if (!seed) return;

    try {
      const nextStyle = (styleInput ?? seed.styleAdjustmentDraft ?? "").trim();
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphraseStatus: 'processing',
        appliedStyleAdjustment: nextStyle || s.appliedStyleAdjustment || "",
        styleAdjustmentHistory: nextStyle
          ? [nextStyle, ...(s.styleAdjustmentHistory || []).filter(item => item !== nextStyle)].slice(0, 3)
          : (s.styleAdjustmentHistory || []),
      } : s));
      const paraphrases = await generateParaphrases(seed.text, seed.analysis, {
        expansions: seed.selectedExpansions,
        style: nextStyle || seed.appliedStyleAdjustment || styleAdjustment,
        overallRequirement,
        multiTurnContext,
        workMode: mode === "quick" ? "quick" : "advanced",
        businessType: mode === "instruct" ? "training" : "evaluation",
      });
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphrases,
        paraphraseStatus: 'idle',
        appliedStyleAdjustment: nextStyle || s.appliedStyleAdjustment || "",
        styleAdjustmentDraft: "",
        dirty: false,
        styleAdjustmentHistory: nextStyle
          ? [nextStyle, ...(s.styleAdjustmentHistory || []).filter(item => item !== nextStyle)].slice(0, 3)
          : (s.styleAdjustmentHistory || []),
      } : s));
    } catch (error) {
      console.error("Error regenerating paraphrases:", error);
      addToast(error instanceof Error ? error.message : '仿写生成失败');
      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        paraphraseStatus: 'idle',
      } : s));
    }
  };

  const handleRegenerateTrainingSample = async (id: string) => {
    const seed = seeds.find(s => s.id === id);
    if (!seed || mode === "single" && !effectiveFineTuneMultiTurn) return;
    if (mode === "instruct") {
      const instructionSample = normalizeInstructionSampleForEdit(seed.instruct, seed.text);
      if (!instructionSample.instruction.trim()) {
        addToast("请先填写用户问题 Instruction");
        return;
      }
      if (!multiTurnContext.trim() && !instructionSample.system?.trim()) {
        addToast("请先填写助手角色 System");
        return;
      }
    }

    try {
      setSeeds(prev => prev.map(s => s.id === id ? { ...s, status: "processing" } : s));
      let qa = seed.qa;
      let instruct = seed.instruct;

      if (mode === "multi" || effectiveFineTuneMultiTurn) {
        qa = normalizeMultiTurnSample(await generateQA(seed.text, {
          context: multiTurnContext,
          overallRequirement,
          styleAdjustment,
        }), seed.text);
      }

      if (mode === "instruct") {
        const generatedInstruct = normalizeInstructionSample(await generateInstruct(seed.text, {
          context: multiTurnContext,
          overallRequirement,
          styleAdjustment,
        }), seed.text);
        instruct = {
          ...generatedInstruct,
          system: generatedInstruct.system || multiTurnContext.trim() || DEFAULT_INSTRUCTION_SYSTEM_PROMPT,
        };
      }

      setSeeds(prev => prev.map(s => s.id === id ? {
        ...s,
        qa,
        instruct,
        status: "completed",
        dirty: false,
      } : s));
    } catch (error) {
      console.error("Training sample regeneration failed", error);
      addToast(error instanceof Error ? error.message : "训练样本预览生成失败");
      setSeeds(prev => prev.map(s => s.id === id ? { ...s, status: "completed" } : s));
    }
  };

  const handleUpdateSeedField = (seedId: string, section: 'analysis' | 'qa' | 'instruct', field: string, value: string) => {
    setSeeds(prev => prev.map(s => {
      if (s.id !== seedId) return s;

      if (section === "qa") {
        const current = normalizeMultiTurnSample(s.qa, s.text);
        if (field === "q1" || field === "a1" || field === "q2" || field === "a2") {
          const mapped = {
            q1: { history: [{ ...current.history[0], content: value }, current.history[1]] },
            a1: { history: [current.history[0], { ...current.history[1], content: value }] },
            q2: { currentQuery: value },
            a2: { response: value },
          }[field];
          return {
            ...s,
            qa: normalizeMultiTurnSample({ ...current, ...mapped }, s.text),
          };
        }
      }

      const currentSection = s[section] || {};
      const nextDirty = section === "analysis" && s.paraphrases.length > 0 ? true : s.dirty;

      return {
        ...s,
        [section]: {
          ...currentSection,
          [field]: value
        },
        dirty: nextDirty,
      };
    }));
  };

  const handleUpdateSeedStyleDraft = (seedId: string, value: string) => {
    setSeeds(prev => prev.map(s => s.id === seedId ? {
      ...s,
      styleAdjustmentDraft: value,
      dirty: s.paraphrases.length > 0 ? true : s.dirty,
    } : s));
  };

  const handleToggleExpansion = (seedId: string, field: 'subject' | 'action' | 'object' | 'modifiers', value: string) => {
    setSeeds((prev) => prev.map((item) => {
      if (item.id !== seedId) return item;
      const current = item.selectedExpansions[field] || [];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      return {
        ...item,
        selectedExpansions: {
          ...item.selectedExpansions,
          [field]: next,
        },
        dirty: item.paraphrases.length > 0 ? true : item.dirty,
      };
    }));
  };

  const handleExpandSeed = async (seedId: string) => {
    const seed = seeds.find((item) => item.id === seedId);
    if (!seed) return;

    try {
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        expansionStatus: "processing",
      } : item));

      const generated = await expandSeedFields(seed.text, seed.analysis, {
        overallRequirement,
        styleAdjustment,
        workMode: mode === "quick" ? "quick" : "advanced",
        businessType: mode === "instruct" ? "training" : "evaluation",
      });

      let appendedTotal = 0;
      setSeeds((prev) => prev.map((item) => {
        if (item.id !== seedId) return item;
        const subject = appendExpansionCandidates(item.expansions.subject || [], generated.subject || []);
        const action = appendExpansionCandidates(item.expansions.action || [], generated.action || []);
        const object = appendExpansionCandidates(item.expansions.object || [], generated.object || []);
        const modifiers = appendExpansionCandidates(item.expansions.modifiers || [], generated.modifiers || []);
        appendedTotal = subject.appended.length + action.appended.length + object.appended.length + modifiers.appended.length;

        return {
          ...item,
          expansions: {
            subject: subject.merged,
            action: action.merged,
            object: object.merged,
            modifiers: modifiers.merged,
          },
          selectedExpansions: {
            subject: appendExpansionCandidates(item.selectedExpansions.subject || [], subject.appended).merged,
            action: appendExpansionCandidates(item.selectedExpansions.action || [], action.appended).merged,
            object: appendExpansionCandidates(item.selectedExpansions.object || [], object.appended).merged,
            modifiers: appendExpansionCandidates(item.selectedExpansions.modifiers || [], modifiers.appended).merged,
          },
          expansionStatus: "idle",
          dirty: item.paraphrases.length > 0 ? true : item.dirty,
        };
      }));
      if (appendedTotal === 0) {
        addToast("候选已达上限，批量生成会继续基于现有候选泛化，不用担心覆盖不足", "info");
      }
    } catch (error) {
      console.error("Error expanding seed fields:", error);
      addToast(error instanceof Error ? error.message : 'AI扩写失败');
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        expansionStatus: "idle",
        expansions: { subject: [], action: [], object: [], modifiers: [] },
        selectedExpansions: { subject: [], action: [], object: [], modifiers: [] },
      } : item));
    }
  };

  const handleCopyParaphrases = async (seedId: string) => {
    const seed = seeds.find((item) => item.id === seedId);
    if (!seed || !seed.paraphrases.length) return;

    try {
      await navigator.clipboard.writeText(seed.paraphrases.map((item) => item.text).join("\n"));
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        copyMessage: `已复制 ${item.paraphrases.length} 条仿写句子`,
      } : item));
      window.setTimeout(() => {
        setSeeds((prev) => prev.map((item) => item.id === seedId ? { ...item, copyMessage: "" } : item));
      }, 1600);
    } catch (error) {
      console.error("Copy paraphrases failed", error);
      setSeeds((prev) => prev.map((item) => item.id === seedId ? {
        ...item,
        copyMessage: "复制失败，请手动复制",
      } : item));
    }
  };

  const handleExport = (format: 'json' | 'csv' | 'jsonl', items?: GeneratedItem[]) => {
    const exportItems = items ?? (view === "quick" ? quickGeneratedItemsRef.current : generatedData);
    setIsExporting(true);
    apiService
      .export(activeTask || "adhoc", { format, items: exportItems })
      .then((result) => {
        const mimeType = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain";
        const ext = format === "jsonl" ? "jsonl" : format;
        const blob = new Blob([result.content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `corpusflow_export_${Date.now()}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((error) => {
        console.error("Export failed", error);
        setApiError("导出失败");
      })
      .finally(() => {
        setIsExporting(false);
      });
  };

  const handleClearGenerated = () => {
    if (view === "quick") {
      if (confirm("确定要清空当前批量任务已生成的结果吗？")) {
        clearCurrentQuickResults();
      }
      return;
    }

    if (confirm("确定要清空当前任务已生成的语料吗？")) {
      setGeneratedData([]);
      if (activeTask) {
        setTaskDataMap(prev => ({
          ...prev,
          [activeTask]: {
            ...prev[activeTask],
            generated: [],
          },
        }));
      }
    }
  };

  const handleDeleteGeneratedItem = (id: string) => {
    if (view === "quick") {
      updateQuickWorkspace((prev) => ({
        quickGeneratedItems: prev.quickGeneratedItems.filter((item) => item.id !== id),
        quickRunStats: prev.quickRunStats
          ? {
              ...prev.quickRunStats,
              total_retained: Math.max(0, prev.quickRunStats.total_retained - 1),
            }
          : prev.quickRunStats,
      }));
      return;
    }
    setGeneratedData(prev => prev.filter(item => item.id !== id));
  };

  const handleEditGeneratedItem = (id: string, field: keyof GeneratedItem, value: string) => {
    setGeneratedData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const quickSeedTexts = quickRows
    .map((row) => buildQuickTaskSeedText(row, quickTaskKind))
    .map((text) => text.trim())
    .filter(Boolean);
  const quickRejectedSeeds = quickRows.reduce<Record<number, RejectionCheck>>((acc, row, index) => {
    const text = buildQuickTaskSeedText(row, quickTaskKind).trim();
    const rejection = detectRejectionRisk(text);
    if (text && rejection.blocked) {
      acc[index] = rejection;
    }
    return acc;
  }, {});

  const quickGroupedResults = quickGeneratedItems.reduce<Array<{
    seedIndex: number;
    items: Array<GeneratedItem & { seedIndex?: number }>;
  }>>((groups, item) => {
    const seedIndex = item.seedIndex ?? 0;
    const group = groups.find((entry) => entry.seedIndex === seedIndex);
    if (group) {
      group.items.push(item);
      return groups;
    }
    return [...groups, { seedIndex, items: [item] }];
  }, []);
  const getQuickWorkspaceForTask = (taskId: string) => quickWorkspaceByTask[taskId] ?? null;
  const getTaskGeneratedCount = (task: Task) => {
    if (getTaskView(task) === "quick") {
      const workspace = getQuickWorkspaceForTask(task.id);
      return workspace?.quickGeneratedItems.length ?? 0;
    }
    return task.id === activeTask ? generatedData.length : (task.status === "completed" ? 100 : 0);
  };
  const getTaskAssetLabel = (task: Task) => {
    if (getTaskView(task) !== "quick") return task.time;
    const workspace = getQuickWorkspaceForTask(task.id);
    if (workspace?.quickFile?.name) return workspace.quickFile.name;
    return "打开查看资产";
  };
  const handleTaskSelect = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (view === "quick" && task.id !== activeTask && quickRunStatus === "running") {
      handlePauseQuickGeneration();
    }
    openTask(task);
  };
  const renderTaskSwitcher = (accent: "indigo" | "emerald") => {
    const targetView = accent === "emerald" ? "quick" : "fine-tune";
    const modeTasks = tasks.filter((task) => getTaskView(task) === targetView);
    const activeTaskRecord = modeTasks.find((task) => task.id === activeTask);
    const selectValue = activeTaskRecord ? activeTask : "";
    const accentClasses = accent === "emerald"
      ? "focus:border-emerald-500 text-emerald-100"
      : "focus:border-indigo-500 text-indigo-100";
    const buttonClasses = accent === "emerald"
      ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
      : "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30";
    return (
      <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-slate-500">
          <span>当前任务</span>
          {activeTaskRecord && <span className="normal-case tracking-normal text-slate-600">{getTaskAssetLabel(activeTaskRecord)}</span>}
        </div>
        <div className="flex items-center gap-2">
          {editingTaskId === activeTask && activeTaskRecord ? (
            <input
              value={editingTaskName}
              onChange={(event) => setEditingTaskName(event.target.value)}
              onBlur={() => void submitTaskName(activeTask)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitTaskName(activeTask);
                if (event.key === "Escape") cancelEditTaskName();
              }}
              autoFocus
              className={cn("min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#161621] px-3 py-2 text-sm font-bold outline-none transition-colors", accentClasses)}
            />
          ) : (
            <select
              value={selectValue}
              onChange={(event) => handleTaskSelect(event.target.value)}
              className={cn("min-w-0 flex-1 rounded-xl border border-slate-700 bg-[#161621] px-3 py-2 text-sm font-bold outline-none transition-colors", accentClasses)}
            >
              {modeTasks.length === 0 && (
                <option value="">暂无任务，点 + 新建</option>
              )}
              {modeTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {getTaskView(task) === "quick" ? "批量 · " : "精调 · "}{task.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={(event) => activeTaskRecord && beginEditTaskName(activeTaskRecord, event)}
            disabled={!activeTaskRecord || editingTaskId === activeTask}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-700 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            title="重命名当前任务"
            aria-label="重命名当前任务"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={handleCreateTask}
            className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors", buttonClasses)}
            title="新建任务"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    );
  };
  const fineTuneProgressHud = generationRequest ? (
    <div className="m-4 mb-0 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-indigo-200">
          {fineTuneProgress.stage === "preparing" ? "解析上游" : "批量生成"}
        </span>
        <span className="text-[11px] text-indigo-300">{fineTuneProgressPercent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-indigo-400 transition-all duration-300"
          style={{ width: `${Math.max(6, fineTuneProgressPercent)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{fineTuneProgress.completed}/{fineTuneProgress.total} 个种子就绪</span>
        <span>{fineTuneProgress.stage === "preparing" ? `并发 ${MAX_SEED_PROCESS_CONCURRENCY}` : "生成结果中"}</span>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-screen bg-[#12121A] text-slate-300 font-sans overflow-hidden">
      {/* Top Header */}
      <header className="relative h-12 border-b border-slate-800 bg-[#1A1A27] flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            onClick={() => navigateToView('home')}
          >
            <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-white group-hover:bg-indigo-500 transition-colors">
              <LayoutGrid size={18} />
            </div>
            <span className="font-bold text-lg tracking-tight text-white">CorpusFlow</span>
          </div>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className={cn("cursor-pointer hover:text-indigo-400 transition-colors", view === 'home' && "text-indigo-400")} onClick={() => navigateToView('home')}>首页</span>
            {view !== 'home' && (
              <>
                <ChevronLeft size={12} className="rotate-180" />
                <span className="text-indigo-400">
                  {view === 'fine-tune' ? '精调生成' : view === 'quick' ? '批量任务' : '任务列表'}
                </span>
              </>
            )}
          </div>
        </div>

        {isLoggedIn && (
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-2 py-1 shadow-sm">
            <button
              onClick={() => saveCurrentWorkspace("manual")}
              disabled={!activeTask}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50",
                saveFeedback === "done"
                  ? "bg-emerald-500 text-white scale-105 shadow-lg shadow-emerald-500/20"
                  : "bg-slate-100 text-slate-950 hover:bg-white"
              )}
              title="保存当前工作区"
            >
              <AnimatePresence mode="wait" initial={false}>
                {saveFeedback === "done" ? (
                  <motion.span
                    key="saved"
                    initial={{ opacity: 0, scale: 0.82 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Check size={14} />
                  </motion.span>
                ) : saveFeedback === "auto" ? (
                  <motion.span
                    key="auto"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: [0, 1, 1], y: [8, -3, 0] }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.46, ease: "easeOut" }}
                  >
                    <Save size={14} strokeWidth={1.8} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="save"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Save size={13} strokeWidth={1.8} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            {activeTask && lastSavedAt && (
              <span className="min-w-[68px] whitespace-nowrap pr-1 text-center text-[11px] font-semibold tabular-nums text-slate-300">
                {lastSavedAt}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-4">
          {!isLoggedIn ? (
            <form
              onSubmit={handleLogin}
              className={cn(
                "relative flex items-center gap-2 rounded-lg transition-all",
                loginNudgeVisible && "ring-2 ring-indigo-400/70 ring-offset-2 ring-offset-[#1A1A27]"
              )}
            >
              <AnimatePresence>
                {(loginError || loginNudgeVisible) && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-bold text-indigo-200 shadow-xl"
                  >
                    {loginError || "先登录/注册后开始任务"}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative">
                <User size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="用户名/邮箱"
                  value={tempEmail}
                  onChange={(e) => {
                    setTempEmail(e.target.value);
                    setLoginError("");
                  }}
                  autoComplete="username"
                  className="bg-slate-800 border border-slate-700 rounded px-7 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 w-32 transition-all"
                />
              </div>
              <input
                type="password"
                placeholder="密码"
                value={tempPassword}
                onChange={(e) => {
                  setTempPassword(e.target.value);
                  setLoginError("");
                }}
                autoComplete="current-password"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500 w-24 transition-all"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-[11px] font-bold transition-colors"
              >
                登陆/注册
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                  <User size={12} />
                </div>
                <span className="font-medium text-slate-200">{userEmail}</span>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-400 transition-colors"
              >
                <LogOut size={14} /> 退出
              </button>
            </>
          )}
        </div>
      </header>

      {/* API Alert */}
      {apiError && (
        <div className="bg-amber-900/20 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-amber-500 text-xs font-medium">
            <AlertCircle size={14} />
            <span>{apiError}</span>
          </div>
          <button onClick={() => setApiError(null)} className="text-amber-500/50 hover:text-amber-500"><Plus size={14} className="rotate-45" /></button>
        </div>
      )}

      <main className="flex flex-1 overflow-hidden relative">
        {/* View: Home */}
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
              className="absolute inset-0 overflow-y-auto p-12 custom-scrollbar flex flex-col items-center"
            >
              <div className="max-w-5xl w-full space-y-12">
                <div className="grid grid-cols-2 gap-8">
                  {/* Fine-tune Card */}
                  <div
                    onClick={openFineTuneWorkspace}
                    className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all group shadow-xl"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                      <Edit3 size={40} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2">精调生成</h2>
                      <p className="text-base text-slate-500">深度解析、仿写、扩写，支持极速与高质量模式</p>
                    </div>
                  </div>

                  {/* Quick Card */}
                  <div
                    onClick={openQuickWorkspace}
                    className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center space-y-6 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all group shadow-xl"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                      <FileText size={40} />
                    </div>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-white mb-2">批量任务</h2>
                      <p className="text-base text-slate-500">弱编辑、重吞吐，面向大批量生成与筛选</p>
                    </div>
                  </div>
                </div>

                {/* Past Tasks List */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <History className="text-indigo-400" size={20} />
                      任务列表
                    </h3>
                    <button
                      onClick={() => navigateToView('task-list')}
                      className="text-sm text-slate-500 hover:text-white transition-colors"
                    >
                      查看全部任务
                    </button>
                  </div>

                  <div className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="grid grid-cols-5 gap-4 p-4 border-b border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                      <div className="col-span-2">任务名称</div>
                      <div>类型</div>
                      <div className="text-right">时间</div>
                      <div className="text-right">操作</div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {tasks.slice(0, 5).map(task => (
                        <div
                          key={task.id}
                          onClick={() => openTask(task)}
                          className="grid grid-cols-5 gap-4 p-4 hover:bg-slate-800/30 cursor-pointer transition-colors group"
                        >
                          <div className="col-span-2 flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                              <FileText size={16} />
                            </div>
                            <div
                              className="flex min-w-0 flex-1 items-center gap-2"
                              onDoubleClick={(event) => beginEditTaskName(task, event)}
                            >
                            {editingTaskId === task.id ? (
                              <input
                                value={editingTaskName}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setEditingTaskName(event.target.value)}
                                onBlur={() => void submitTaskName(task.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void submitTaskName(task.id);
                                  if (event.key === "Escape") cancelEditTaskName();
                                }}
                                autoFocus
                                className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm font-medium text-white outline-none focus:border-indigo-500"
                              />
                            ) : (
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-medium text-slate-300 group-hover:text-white">{task.name}</span>
                                {getTaskView(task) === "quick" && (
                                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                                    {getTaskAssetLabel(task)} · {getTaskGeneratedCount(task)} 条结果
                                  </span>
                                )}
                              </div>
                            )}
                            {editingTaskId !== task.id && (
                              <button
                                onClick={(event) => beginEditTaskName(task, event)}
                                className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-indigo-300 transition-all"
                                title="编辑任务名称"
                              >
                                <Edit3 size={12} />
                              </button>
                            )}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold uppercase", getTaskBadge(task).className)}>
                              {getTaskBadge(task).label}
                            </span>
                          </div>
                          <div className="flex min-w-0 items-center justify-end text-xs text-slate-500">
                            <span className="truncate text-right">{task.time}</span>
                          </div>
                          <div className="flex items-center justify-end">
                            <button
                              onClick={(event) => handleDeleteTask(task.id, event)}
                              className="rounded-lg p-2 text-slate-500 opacity-0 transition-all hover:bg-red-600/10 hover:text-red-400 group-hover:opacity-100"
                              title="删除任务"
                              aria-label="删除任务"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* View: Batch Task (Bulk Generation) */}
          {false && view === 'batch' && (
            <motion.div
              key="batch"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
              className="absolute inset-0 flex flex-col overflow-hidden bg-[#0F0F16]"
            >
              {/* Step 1: Upload */}
              {batchStep === 'upload' && (
                <div className="flex-1 flex flex-col items-center justify-center p-12">
                  <div
                    onClick={() => {
                      setIsBatchImporting(true);
                      setTimeout(() => {
                        setBatchFile({ name: "批量任务数据_2026.xlsx", size: "1.2MB" });
                        setSeeds([
                          { id: '1', text: '打开空调到25度', status: 'idle' },
                          { id: '2', text: '我想听周杰伦的歌', status: 'idle' },
                          { id: '3', text: '帮我导航到最近的加油站', status: 'idle' },
                          { id: '4', text: '车窗降下一半', status: 'idle' },
                          { id: '5', text: '现在几点了', status: 'idle' },
                        ]);
                        setIsBatchImporting(false);
                        setBatchStep('config');
                      }, 1500);
                    }}
                    className="max-w-2xl w-full aspect-video border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center space-y-6 hover:border-sky-500/50 hover:bg-sky-600/5 transition-all cursor-pointer group"
                  >
                    {isBatchImporting ? (
                      <div className="flex flex-col items-center space-y-4">
                        <Loader2 size={48} className="animate-spin text-sky-400" />
                        <p className="text-lg font-medium text-slate-300">正在解析文件并检索 Query...</p>
                      </div>
                    ) : (
                      <>
                        <div className="w-20 h-20 rounded-full bg-sky-600/10 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                          <Download size={40} className="rotate-180" />
                        </div>
                        <div className="text-center px-8">
                          <h2 className="text-2xl font-bold text-white mb-2">导入批量任务文件</h2>
                          <p className="text-slate-500">支持 .txt, .csv, .xlsx 格式。系统将自动提取首列作为种子 Query。</p>
                        </div>
                        <button className="bg-sky-600 hover:bg-sky-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-sky-500/20">
                          选择并上传文件
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Configuration (PRD Requirement) */}
              {batchStep === 'config' && batchFile && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-slate-800 bg-[#1A1A27] flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center text-sky-400">
                        <Settings size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">任务配置与预览</h2>
                        <p className="text-xs text-slate-500">已成功检索到 {seeds.length} 条种子 Query，请配置生成参数</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setBatchFile(null);
                          setBatchStep('upload');
                        }}
                        className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-400 hover:text-white"
                      >
                        重新上传
                      </button>
                      <button
                        onClick={() => {
                          setBatchGenerating(true);
                          setBatchStep('running');
                          setTimeout(() => {
                            const mockGenerated: GeneratedItem[] = [];
                            seeds.filter((seed) => !seed.rejection?.blocked).forEach(s => {
                              for(let i=0; i<batchConfig.duplication; i++) {
                                mockGenerated.push({
                                  id: `g-${s.id}-${i}`,
                                  type: 'single',
                                  q: `${s.text} (变体 ${i+1})`,
                                  a: "执行成功"
                                });
                              }
                            });
                            setGeneratedData(mockGenerated);
                            setBatchGenerating(false);
                            setBatchStep('result');
                          }, 3000);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2 rounded-lg text-xs font-bold shadow-lg shadow-indigo-500/20"
                      >
                        开始执行生成
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 flex overflow-hidden">
                    {/* Left: Query Preview */}
                    <div className="w-1/2 border-r border-slate-800 flex flex-col overflow-hidden">
                      <div className="p-4 border-b border-slate-800 bg-slate-800/20">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">检索到的数据预览</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {seeds.map((seed, idx) => (
                          <div key={seed.id} className="p-3 bg-[#161621] border border-slate-800 rounded-xl flex items-center gap-3">
                            <span className="text-[11px] font-black text-slate-600 w-4">{idx + 1}</span>
                            <span className="text-xs text-slate-300">{seed.text}</span>
                            {seed.rejection?.blocked && (
                              <span className="ml-auto rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                                拒绝
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Parameter Tuning */}
                    <div className="w-1/2 p-8 space-y-10 overflow-y-auto custom-scrollbar">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Sparkles size={16} className="text-indigo-400" />
                            生成模式调节
                          </h3>
                          <div className="flex bg-[#161621] p-1 rounded-lg border border-slate-800">
                            {['conservative', 'balanced', 'creative'].map(m => (
                              <button
                                key={m}
                                onClick={() => setBatchConfig({...batchConfig, mode: m as any})}
                                className={cn(
                                  "px-3 py-1 rounded-md text-[11px] font-bold transition-all",
                                  batchConfig.mode === m ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-300"
                                )}
                              >
                                {m === 'conservative' ? '保守' : m === 'balanced' ? '平衡' : '创意'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Generalization Slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <h4 className="text-xs font-bold text-slate-300">泛化程度 (Generalization)</h4>
                              <p className="text-[11px] text-slate-500 mt-1">控制 AI 偏离原始语义的程度，数值越高句式变化越大</p>
                            </div>
                            <span className="text-lg font-black text-indigo-400">{batchConfig.generalization}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={batchConfig.generalization}
                            onChange={(e) => setBatchConfig({...batchConfig, generalization: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                          />
                          <div className="flex justify-between text-[11px] text-slate-600 font-bold">
                            <span>同义替换</span>
                            <span>场景重构</span>
                          </div>
                        </div>

                        {/* Duplication Slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <h4 className="text-xs font-bold text-slate-300">重复/收敛程度 (Duplication)</h4>
                              <p className="text-[11px] text-slate-500 mt-1">每条种子 Query 生成的变体数量</p>
                            </div>
                            <span className="text-lg font-black text-sky-400">x{batchConfig.duplication}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={batchConfig.duplication}
                            onChange={(e) => setBatchConfig({...batchConfig, duplication: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                          />
                          <div className="flex justify-between text-[11px] text-slate-600 font-bold">
                            <span>精简生成</span>
                            <span>海量覆盖</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-indigo-600/5 border border-indigo-500/20 rounded-2xl space-y-3">
                        <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-2">
                          <AlertCircle size={14} /> 任务预估
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#161621] p-3 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-500 mb-1">预计生成总数</p>
                            <p className="text-sm font-bold text-white">{seeds.length * batchConfig.duplication} 条</p>
                          </div>
                          <div className="bg-[#161621] p-3 rounded-xl border border-slate-800">
                            <p className="text-[11px] text-slate-500 mb-1">预计消耗时长</p>
                            <p className="text-sm font-bold text-white">约 {Math.ceil(seeds.length * batchConfig.duplication / 2)} 秒</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Running */}
              {batchStep === 'running' && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center flex-col">
                      <span className="text-2xl font-black text-white">65%</span>
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-white">正在执行批量生成任务...</h2>
                    <p className="text-sm text-slate-500">正在应用泛化度 {batchConfig.generalization}% 的生成策略</p>
                  </div>
                  <div className="w-96 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '65%' }}
                      className="h-full bg-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Result */}
              {batchStep === 'result' && batchFile && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Task Overview Header */}
                  <div className="bg-[#1A1A27] border-b border-slate-800 p-6 shrink-0">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">任务名称</span>
                          <h2 className="text-lg font-bold text-white">{tasks.find(t => t.id === activeTask)?.name || "批量生成任务"}</h2>
                        </div>
                        <div className="h-10 w-px bg-slate-800" />
                        <div className="flex items-center gap-8">
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">导入文件</span>
                            <div className="flex items-center gap-2 text-sky-400 font-medium">
                              <FileText size={14} />
                              <span className="text-sm">{batchFile.name}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">数据统计</span>
                            <div className="text-sm font-medium text-slate-300">
                              种子: <span className="text-white">{seeds.length}</span> /
                              生成: <span className="text-indigo-400">{generatedData.length}</span>
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1">配置参数</span>
                            <div className="text-sm font-medium text-slate-300">
                              泛化: {batchConfig.generalization}% / 重复: x{batchConfig.duplication}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setBatchStep('config')}
                          className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                        >
                          调整参数
                        </button>
                        <button
                          onClick={() => handleExport('csv')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                        >
                          <Download size={14} /> 导出结果
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Seed-to-Generation Detailed List */}
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <LayoutGrid size={16} className="text-sky-400" />
                          生成结果详细列表
                        </h3>
                      </div>

                      <div className="space-y-4">
                        {seeds.map((seed, sIdx) => (
                          <div key={seed.id} className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                            <div className="bg-slate-800/30 px-6 py-3 border-b border-slate-800 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] font-black text-slate-600">0{sIdx + 1}</span>
                                <span className="text-sm font-bold text-white">{seed.text}</span>
                              </div>
                              <span className="text-[11px] text-slate-500">变体: {generatedData?.filter(g => g.id.startsWith(`g-${seed.id}`)).length || 0} 条</span>
                            </div>
                            <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {generatedData?.filter(g => g.id.startsWith(`g-${seed.id}`)).map((gen, gIdx) => (
                                <div
                                  key={gen.id}
                                  className={cn(
                                    "p-3 rounded-xl border text-xs font-medium transition-all group relative",
                                    gIdx % 2 === 0 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-violet-500/20 bg-violet-500/5 text-violet-300"
                                  )}
                                >
                                  {gen.q}
                                  <button
                                    onClick={() => handleDeleteGeneratedItem(gen.id)}
                                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* View: Task List (Management) */}
          {view === 'task-list' && (
            <motion.div
              key="task-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
              className="absolute inset-0 overflow-y-auto p-8 custom-scrollbar bg-[#0F0F16]"
            >
              <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => navigateToView('home')}
                      className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <h2 className="text-2xl font-bold text-white">任务列表</h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input
                        type="text"
                        placeholder="搜索任务..."
                        className="bg-[#1A1A27] border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-all w-64"
                      />
                    </div>
                    <button className="p-2 bg-slate-800 text-slate-400 rounded-lg hover:text-white">
                      <RotateCcw size={18} />
                    </button>
                  </div>
                </div>

                <div className="bg-[#1A1A27] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-800/30">
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">任务名称</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">任务类型</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">创建时间</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest">状态</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {tasks?.map(task => (
                        <tr
                          key={task.id}
                          onClick={() => openTask(task)}
                          className="cursor-pointer hover:bg-slate-800/20 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-colors">
                                <FileText size={20} />
                              </div>
                              <div
                                className="flex min-w-0 flex-1 items-center gap-2"
                                onClick={(event) => event.stopPropagation()}
                                onDoubleClick={(event) => beginEditTaskName(task, event)}
                              >
                              {editingTaskId === task.id ? (
                                <input
                                  value={editingTaskName}
                                  onClick={(event) => event.stopPropagation()}
                                  onChange={(event) => setEditingTaskName(event.target.value)}
                                  onBlur={() => void submitTaskName(task.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") void submitTaskName(task.id);
                                    if (event.key === "Escape") cancelEditTaskName();
                                  }}
                                  autoFocus
                                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm font-bold text-white outline-none focus:border-indigo-500"
                                />
                              ) : (
                                <>
                                  <span className="text-sm font-bold text-slate-200 group-hover:text-white">{task.name}</span>
                                  <button
                                    onClick={(event) => beginEditTaskName(task, event)}
                                    className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-indigo-300 transition-all"
                                    title="编辑任务名称"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                </>
                              )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2 py-1 rounded text-[11px] font-bold uppercase", getTaskBadge(task).className)}>
                              {getTaskBadge(task).label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {task.time}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                task.status === 'completed' ? "bg-emerald-500" : "bg-orange-500 animate-pulse"
                              )} />
                              <span className="text-xs text-slate-400">{task.status === 'completed' ? '已完成' : '进行中'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTask(task);
                                }}
                                className="p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-all"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleExport('csv');
                                }}
                                className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-emerald-600/10 rounded-lg transition-all"
                              >
                                <Download size={16} />
                              </button>
                              <button
                                onClick={(e) => handleDeleteTask(task.id, e)}
                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-600/10 rounded-lg transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tasks.length === 0 && (
                    <div className="py-20 text-center text-slate-600">
                      暂无历史任务
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* View: Fine-tune (Existing Advanced Mode) */}
          {(view === 'fine-tune' || view === 'quick') && (
            <motion.div
              key={view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
              className="absolute inset-0 flex overflow-hidden"
            >
              {view === 'quick' ? (
                <QuickTaskWorkspace
                  taskSwitcher={renderTaskSwitcher("emerald")}
                  sidebarWidth={quickSidebarWidth}
                  onSidebarResizeStart={(event) => beginSidebarResize(event, quickSidebarWidth, setQuickSidebarWidth)}
                  quickImportStatus={quickImportStatus}
                  quickImportError={quickImportError}
                  quickFile={quickFile}
                  quickTaskKind={quickTaskKind}
                  quickMultiTurnEnabled={quickMultiTurnEnabled}
                  quickRows={quickRows}
                  quickHeaders={quickHeaders}
                  quickColumns={quickColumns}
                  quickWarnings={quickWarnings}
                  quickTargetPerSeed={quickTargetPerSeed}
                  quickFilterStrength={quickFilterStrength}
                  quickConcurrency={quickConcurrency}
                  quickControlExpanded={quickControlExpanded}
                  quickRunStatus={quickRunStatus}
                  quickRunStats={quickRunStats}
                  quickRunProgress={quickRunProgress}
                  quickCachedBatches={quickCachedBatches || []}
                  quickGeneratedItems={quickGeneratedItems}
                  quickSeedTexts={quickSeedTexts}
                  quickRejectedSeeds={quickRejectedSeeds}
                  quickGroupedResults={quickGroupedResults}
                  onImportFile={handleQuickImport}
                  onResetImport={clearQuickWorkspace}
                  onTaskKindChange={(kind) => updateQuickWorkspace((prev) => {
                    const nextKind = kind === "multi" ? "qa" : kind;
                    return {
                      quickTaskKind: nextKind,
                      quickInstructionTemplate: nextKind === "instruct"
                        ? resolveQuickImportSystemTemplate(prev.quickRows, prev.quickInstructionTemplate.trim() ? prev.quickInstructionTemplate : DEFAULT_INSTRUCTION_SYSTEM_PROMPT)
                        : prev.quickInstructionTemplate,
                    };
                  })}
                  onMultiTurnEnabledChange={(enabled) => updateQuickWorkspace({ quickMultiTurnEnabled: enabled })}
                  onTargetPerSeedChange={(value) => updateQuickWorkspace({ quickTargetPerSeed: clampExpansionRatio(value) })}
                  onFilterStrengthChange={(value) => updateQuickWorkspace({ quickFilterStrength: value })}
                  onConcurrencyChange={(value) => updateQuickWorkspace({ quickConcurrency: value })}
                  onToggleControlExpanded={() => updateQuickWorkspace((prev) => ({ quickControlExpanded: !prev.quickControlExpanded }))}
                  onGenerate={handleQuickGenerate}
                  onPauseGeneration={handlePauseQuickGeneration}
                  onStopGeneration={handleStopQuickGeneration}
                  onExport={(format) => handleExport(format)}
                  onClearResults={handleClearGenerated}
                  onRestoreCachedBatch={(batchId) => updateQuickWorkspace((prev) => {
                    const batch = (prev.quickCachedBatches || []).find((item) => item.id === batchId);
                    if (!batch) return {};
                    return {
                      quickGeneratedItems: batch.items,
                      quickRunStats: batch.stats,
                      quickRunStatus: "done",
                    };
                  })}
                  isExporting={isExporting}
                  quickInstructionTemplate={quickInstructionTemplate}
                  onInstructionTemplateChange={(value) => updateQuickWorkspace({ quickInstructionTemplate: value })}
                  quickDiversity={quickDiversity}
                  onDiversityChange={(value) => updateQuickWorkspace({ quickDiversity: value })}
                  quickGenerationIntent={quickGenerationIntent}
                  onGenerationIntentChange={(value) => updateQuickWorkspace({ quickGenerationIntent: value })}
                />
              ) : (
                <>
        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden bg-[#0F0F16]">
          {/* Left Column: Input & Config */}
          <div
            className="relative border-r border-slate-800 flex flex-col shrink-0 p-4 space-y-6 overflow-y-auto custom-scrollbar"
            style={{ width: fineTuneSidebarWidth }}
          >
            <div
              className="absolute right-0 top-0 z-20 h-full w-2 translate-x-1 cursor-col-resize bg-transparent transition-colors hover:bg-indigo-400/20"
              onMouseDown={(event) => beginSidebarResize(event, fineTuneSidebarWidth, setFineTuneSidebarWidth)}
              title="拖动调整宽度"
              aria-label="拖动调整宽度"
            />
            {renderTaskSwitcher("indigo")}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                  <Sparkles size={14} /> 种子语句
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">数量: {seedInputLineCount}</span>
                  <button className="text-[11px] font-bold text-slate-400 hover:text-white flex items-center gap-1">
                    <Download size={10} className="rotate-180" /> 导入
                  </button>
                </div>
              </div>
              <textarea
                className="w-full h-32 bg-[#161621] border border-slate-700 rounded-xl p-3 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none font-mono"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">每行代表一个 query，系统会自动忽略空行。</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-400">生成意图</h3>
                <span className="text-[11px] text-slate-500">可选</span>
              </div>
              <textarea
                placeholder="例：重点覆盖导航、用车设置，语气简短口语"
                className="w-full h-24 bg-[#161621] border border-slate-700 rounded-xl p-3 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                value={overallRequirement}
                onChange={(e) => setOverallRequirement(e.target.value)}
              />
              <p className="text-[11px] text-slate-600">仅用于指导生成方向，不写入训练数据。</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-400">微调配置</h3>
              <div className="rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div className="text-sm font-bold text-slate-400">输出类型</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    { value: "qa", label: "问答" },
                    { value: "instruct", label: "指令微调" },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFineTuneOutputKind(value)}
                      className={cn(
                        "rounded-xl px-3 py-2 text-xs font-bold transition-all",
                        fineTuneOutputKind === value
                          ? value === "instruct"
                            ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
                            : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-[#161621] p-4">
                <div>
                  <div className="text-xs font-bold text-slate-400">多轮对话</div>
                  <div className="mt-0.5 text-[11px] text-slate-600">开启后上一轮 1Q1A 为当前 query 配套</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFineTuneMultiTurn(!effectiveFineTuneMultiTurn)}
                  className={cn(
                    "relative h-7 w-12 rounded-full transition-colors",
                    effectiveFineTuneMultiTurn ? "bg-violet-500" : "bg-slate-700",
                  )}
                  aria-pressed={effectiveFineTuneMultiTurn}
                  aria-label="切换多轮对话"
                >
                  <span
                    className={cn(
                      "absolute left-0 top-1 h-5 w-5 rounded-full bg-white transition-transform",
                      effectiveFineTuneMultiTurn ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>

              {(effectiveFineTuneMultiTurn || mode === "instruct") && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400">
                      {mode === "instruct" ? "助手角色" : "多轮上下文描述"}
                    </label>
                    {mode === "instruct" && <span className="text-[11px] text-slate-600">写入 System</span>}
                  </div>
                  <textarea
                    placeholder={mode === "instruct" ? DEFAULT_INSTRUCTION_SYSTEM_PROMPT : "例：车主正在连续询问同一个用车问题"}
                    className="w-full h-20 bg-[#161621] border border-slate-700 rounded-xl p-3 text-sm text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                    value={multiTurnContext}
                    onChange={(e) => setMultiTurnContext(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-600">
                    {mode === "instruct" ? <>用于约束助手身份和回答风格，不会写入 <span className="font-mono font-bold text-slate-500">Instruction</span>。</> : "只用于生成上一轮配套上下文。"}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 space-y-3">
              <button
                onClick={handleGeneratePreview}
                disabled={!canRunFineTune}
                className={cn(
                  "w-full border py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                  canRunFineTune
                    ? "bg-blue-600/20 border-blue-500/30 text-blue-400 hover:bg-blue-600/30"
                    : "bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed",
                )}
              >
                <Sparkles size={14} /> 生成预览
              </button>
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] text-slate-500">任务进度: {completedSeeds}/{seeds.length} 已解析</span>
                <button
                  onClick={handleGeneratePreview}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw size={10} /> 重新解析
                </button>
              </div>
              <button
                onClick={handleGenerateCorpus}
                disabled={!canRunFineTune}
                className={cn(
                  "w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                  !canRunFineTune ? "bg-slate-800 text-slate-600 cursor-not-allowed shadow-none" : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/20"
                )}
              >
                <Play size={14} /> 生成语料
              </button>
              {fineTuneBlockReason && (
                <p className="px-1 text-[11px] text-amber-300">{fineTuneBlockReason}</p>
              )}
            </div>
          </div>

          {/* Center Column: Processing Cards or Quick Results */}
          <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
            <AnimatePresence mode="wait" initial={false}>
            {mode === 'quick' ? (
              <motion.div
                key="quick-generated-results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles size={20} className="text-emerald-400" />
                    批量生成结果
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">已生成: {generatedData.length} 条</span>
                    <button
                      onClick={handleClearGenerated}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      清空结果
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {generatedData.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1A1A27] border border-slate-800 rounded-2xl p-4 space-y-3 group relative hover:border-emerald-500/30 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-700">#{generatedData.length - idx}</span>
                          <button
                            onClick={() => handleDeleteGeneratedItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <p className="text-base text-white font-medium leading-relaxed">{item.q}</p>
                          <div className="h-px bg-slate-800 w-full" />
                          <p className="text-sm text-slate-500 italic">{item.a}</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {generatedData.length === 0 && !isGenerating && (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-600 space-y-4">
                      <Sparkles size={48} className="opacity-20" />
                      <p>暂无生成数据，在左侧输入种子并点击开始</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`fine-tune-${mode}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: "easeInOut" }}
                className="space-y-16"
              >
                {seeds.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 py-32">
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center">
                      <MessageSquare size={32} />
                    </div>
                    <p className="text-sm font-medium">输入种子语句并点击“生成预览”开始</p>
                  </div>
                ) : (
                  seeds.map((seed, idx) => (
                    <div key={seed.id} className={cn("space-y-6 pb-8 border-b border-slate-800/50 last:border-0", seed.status === 'pending' && "opacity-40 grayscale pointer-events-none")}>
                      <h2 className="text-lg font-bold text-white flex items-center gap-3">
                        <span className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center text-sm">
                          {idx + 1}
                        </span>
                        {seed.text}
                        {seed.rejection?.blocked && (
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                            拒绝 · {seed.rejection.reason || "敏感内容"}
                          </span>
                        )}
                        {seed.status === 'processing' && <Loader2 size={16} className="animate-spin text-indigo-400" />}
                        <button
                          onClick={() => processSeed(seed, buildGenerationRequest([seed]))}
                          disabled={
                            seed.status === "processing" ||
                            (mode === "instruct" && !normalizeInstructionSampleForEdit(seed.instruct, seed.text).instruction.trim())
                          }
                          title={
                            mode === "instruct" && !normalizeInstructionSampleForEdit(seed.instruct, seed.text).instruction.trim()
                              ? "请先填写用户问题 Instruction"
                              : "重新生成"
                          }
                          className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </h2>

                      <div className="grid grid-cols-3 gap-6 min-h-[500px]">
                        {/* Card 1: Analysis */}
                        <Card
                          title="句子解析"
                          step={1}
                          headerRight={seed.expansionStatus === 'processing' ? <Loader2 size={14} className="animate-spin text-indigo-400" /> : null}
                        >
                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">意图描述</label>
                              <input
                                type="text"
                                value={seed.analysis?.intent || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'intent', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">主体</label>
                              {(seed.expansions.subject || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.subject || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-subject-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'subject', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.subject.includes(item)
                                          ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.subject || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'subject', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">动作</label>
                              {(seed.expansions.action || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.action || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-action-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'action', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.action.includes(item)
                                          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.action || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'action', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">对象</label>
                              {(seed.expansions.object || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.object || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-object-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'object', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.object.includes(item)
                                          ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.object || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'object', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">修饰词</label>
                              {(seed.expansions.modifiers || []).length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {(seed.expansions.modifiers || []).map((item, itemIndex) => (
                                    <button
                                      key={`${seed.id}-modifiers-${itemIndex}`}
                                      onClick={() => handleToggleExpansion(seed.id, 'modifiers', item)}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
                                        seed.selectedExpansions.modifiers.includes(item)
                                          ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40"
                                          : "bg-slate-800 text-slate-500 hover:text-slate-300"
                                      )}
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                type="text"
                                value={seed.analysis?.modifiers || ""}
                                onChange={(e) => handleUpdateSeedField(seed.id, 'analysis', 'modifiers', e.target.value)}
                                placeholder="等待生成..."
                                className="w-full bg-[#161621] border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-indigo-500 outline-none transition-all"
                              />
                            </div>
                            <div className="flex gap-2 pt-2">
                              <button
                                onClick={() => handleExpandSeed(seed.id)}
                                className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-indigo-700 transition-all"
                              >
                                <Sparkles size={12} /> AI扩写
                              </button>
                              <button
                                onClick={() => handleRegenerateParaphrase(seed.id)}
                                disabled={seed.paraphraseStatus === 'processing'}
                                className="flex-1 border border-slate-700 text-slate-400 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {seed.paraphraseStatus === 'processing'
                                  ? <><Loader2 size={12} className="animate-spin" /> 生成中...</>
                                  : <><RotateCcw size={12} /> 重新生成仿写</>
                                }
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-500">先点 AI 扩写拿候选词，再点选需要启用的词条，最后重新生成仿写。</p>
                          </div>
                        </Card>

                        {/* Card 2: Paraphrase */}
                        <Card
                          title={`仿写句子（${seed.paraphrases?.length || 0}条）`}
                          step={2}
                          headerRight={(
                            <div className="flex items-center gap-3">
                              {seed.dirty && (
                                <button
                                  onClick={() => handleRegenerateParaphrase(seed.id)}
                                  disabled={seed.paraphraseStatus === 'processing'}
                                  title="上游已变化，点击重新生成仿写"
                                  className="rounded-md p-1 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <RefreshCw size={13} />
                                </button>
                              )}
                              {seed.paraphraseStatus === 'processing' && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                              <button
                                onClick={() => handleCopyParaphrases(seed.id)}
                                disabled={!seed.paraphrases?.length}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          )}
                        >
                          <div className="space-y-4 flex flex-col h-full">
                            <div className="space-y-2">
                              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">风格微调 (您想怎样调整仿写句子)</label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder="例如：语气要正式"
                                  className="flex-1 bg-[#161621] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none"
                                  value={seed.styleAdjustmentDraft || ""}
                                  onChange={(e) => handleUpdateSeedStyleDraft(seed.id, e.target.value)}
                                />
                                <button
                                  onClick={() => handleRegenerateParaphrase(seed.id, seed.styleAdjustmentDraft)}
                                  disabled={seed.paraphraseStatus === 'processing'}
                                  className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                                >
                                  附加
                                </button>
                              </div>
                              {(seed.styleAdjustmentHistory?.length || 0) > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {seed.styleAdjustmentHistory?.map((item, historyIndex) => (
                                    <button
                                      key={`${seed.id}-style-${historyIndex}`}
                                      onClick={() => handleRegenerateParaphrase(seed.id, item)}
                                      className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-all"
                                    >
                                      {item}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {seed.copyMessage && <p className="text-[11px] text-emerald-400">{seed.copyMessage}</p>}
                              <p className="text-[11px] text-slate-500">注：绿色句子侧重收敛，紫色句子侧重泛化。</p>
                            </div>

                            <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                              {(seed.paraphrases?.length || 0) === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-600 text-[11px]">等待解析完成...</div>
                              ) : (
                                seed.paraphrases?.map((p, i) => (
                                  <div key={i} className={cn(
                                    "p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all",
                                    p.type === 'convergence' ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10" : "border-violet-500/30 bg-violet-500/5 text-violet-300 hover:bg-violet-500/10"
                                  )}>
                                    {p.text}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </Card>

                        {/* Card 3: QA or Instruct Preview */}
                        <Card
                          title="训练样本预览"
                          step={3}
                          className={mode === 'single' && !effectiveFineTuneMultiTurn ? "h-fit" : undefined}
                        >
                          {mode === 'single' && !effectiveFineTuneMultiTurn ? (
                            <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-4 text-center">
                              <p className="text-xs text-slate-500">当前为问答单轮生成。开启多轮或切换指令微调后可编辑训练样本字段。</p>
                            </div>
                          ) : (
                            <div className="space-y-6 flex flex-col h-full">
                              <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-1">
                              {mode === 'instruct' ? (
                                  <>
                                    {effectiveFineTuneMultiTurn && (
                                      <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                        <div className="text-[11px] font-bold text-slate-500">上一轮上下文</div>
                                        <div className="space-y-2">
                                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">上一轮用户问题</span>
                                          <input
                                            type="text"
                                            value={seed.qa?.history?.[0]?.content || ""}
                                            onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'q1', e.target.value)}
                                            className="w-full bg-[#161621] border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">上一轮助手回答</span>
                                          <textarea
                                            value={seed.qa?.history?.[1]?.content || ""}
                                            onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'a1', e.target.value)}
                                            className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-violet-500 transition-all resize-none"
                                            rows={2}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    {effectiveFineTuneMultiTurn && <div className="h-px bg-slate-800/70" />}
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-300">
                                          助手角色 <span className="ml-2 font-mono text-slate-500">System</span>
                                        </span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.instruct?.system || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'system', e.target.value)}
                                        placeholder="模型角色/系统约束，对应 LLaMA-Factory system"
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-300">
                                          用户问题 <span className="ml-2 font-mono font-bold text-slate-400">Instruction</span>
                                        </span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.instruct?.instruction || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'instruction', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-sky-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-300">
                                          <span className="font-mono text-slate-400">Input</span> <span className="ml-2 text-slate-300">约束背景</span>
                                        </span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.instruct?.input || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'input', e.target.value)}
                                        placeholder="可选；放额外背景、约束或参考内容，没有就留空"
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-slate-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-300">
                                          期望输出 <span className="ml-2 font-mono text-slate-500">Output</span>
                                        </span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.instruct?.output || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'instruct', 'output', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={4}
                                      />
                                    </div>
                                    {getMissingInstructionFields(normalizeInstructionSampleForEdit(seed.instruct, seed.text)).length > 0 && (
                                      <p className="text-[11px] text-amber-300">缺失字段：{getMissingInstructionFields(normalizeInstructionSampleForEdit(seed.instruct, seed.text)).join(", ")}</p>
                                    )}
                                    {effectiveFineTuneMultiTurn && getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).length > 0 && (
                                      <p className="text-[11px] text-amber-300">多轮字段缺失：{getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).join(", ")}</p>
                                    )}
                                  </>
                              ) : (
                                  <>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">上一轮用户问题</span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <input
                                        type="text"
                                        value={seed.qa?.history?.[0]?.content || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'q1', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg px-2 py-1 text-xs text-indigo-300 outline-none focus:border-indigo-500 transition-all"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">上一轮助手回答</span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.qa.history?.[1]?.content || ""}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'a1', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={2}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">当前轮 Query</span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <input
                                        type="text"
                                        value={seed.qa.currentQuery}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'q2', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg px-2 py-1 text-xs text-sky-300 outline-none focus:border-indigo-500 transition-all"
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">当前轮回答</span>
                                        <button className="text-[11px] text-indigo-400 flex items-center gap-1"><Edit3 size={10} /> 编辑</button>
                                      </div>
                                      <textarea
                                        value={seed.qa.response}
                                        onChange={(e) => handleUpdateSeedField(seed.id, 'qa', 'a2', e.target.value)}
                                        className="w-full bg-[#161621] border border-slate-700 rounded-lg p-2 text-xs text-emerald-300 outline-none focus:border-indigo-500 transition-all resize-none"
                                        rows={3}
                                      />
                                    </div>
                                    {getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).length > 0 && (
                                      <p className="text-[11px] text-amber-300">上一轮 1Q1A 是当前 query 的配套上下文，缺失：{getMissingMultiTurnFields(normalizeMultiTurnSample(seed.qa, seed.text)).join(", ")}</p>
                                    )}
                                  </>
                              )}
                              </div>

                              <div className="flex gap-2 pt-4 border-t border-slate-800">
                                <button
                                  onClick={() => handleRegenerateTrainingSample(seed.id)}
                                  disabled={
                                    seed.status === "processing" ||
                                    (mode === "instruct" && !normalizeInstructionSampleForEdit(seed.instruct, seed.text).instruction.trim())
                                  }
                                  className="flex-1 border border-slate-700 text-slate-400 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {seed.status === "processing" ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                  重新生成
                                </button>
                                <button className="flex-1 bg-green-600 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                                  <Check size={14} /> 确认使用
                                </button>
                              </div>
                              {mode === "instruct" && !normalizeInstructionSampleForEdit(seed.instruct, seed.text).instruction.trim() && (
                                <p className="text-[11px] text-amber-300">请先填写用户问题 <span className="font-mono font-bold">Instruction</span>，再重新生成。</p>
                              )}
                            </div>
                          )}
                        </Card>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Sidebar: Generation Controls */}
        <aside className="w-72 border-l border-slate-800 bg-[#1A1A27] flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-orange-500 flex items-center justify-center text-[11px] font-black">4</div>
              生成控制
            </h2>
          </div>
          {fineTuneProgressHud}

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">当前种子数量: {seeds.length}个</span>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">扩写倍数</label>
                  <span className="text-sm font-bold text-indigo-400">{expansionRatio}倍</span>
                </div>
                <input
                  type="range"
                  min={MIN_EXPANSION_RATIO}
                  max={MAX_EXPANSION_RATIO}
                  step="10"
                  value={expansionRatio}
                  onChange={(e) => setExpansionRatio(clampExpansionRatio(parseInt(e.target.value)))}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                  <span>{MIN_EXPANSION_RATIO}倍</span>
                  <span>100倍</span>
                </div>
                <input
                  type="number"
                  min={MIN_EXPANSION_RATIO}
                  max={MAX_EXPANSION_RATIO}
                  value={expansionRatio}
                  onChange={(e) => setExpansionRatio(clampExpansionRatio(parseInt(e.target.value)))}
                  className="w-full rounded-lg border border-slate-700 bg-[#11111a] px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
                />
                <p className="text-sm text-slate-400">预计生成数量: <span className="text-white font-bold">{seeds.length * expansionRatio}条</span></p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">温度</label>
                  <span className="text-sm font-bold text-amber-400">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.01"
                  value={temperature}
                  onChange={(e) => setTemperature(Math.min(2, Math.max(0, Number(e.target.value))))}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <p className="text-sm text-slate-400">低温更稳定，高温更多样。</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleGenerateCorpus}
                  disabled={!canRunFineTune}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all",
                    !canRunFineTune
                      ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                      : isGenerating
                        ? "bg-indigo-600/80 text-white border border-indigo-500/30"
                        : "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  )}
                >
                  {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {isGenerating ? "生成中" : "开始扩写"}
                </button>
                <button className="px-3 bg-slate-800 text-slate-400 rounded-xl hover:text-white">暂停</button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>模式: {mode === 'quick' ? '批量任务' : mode === 'instruct' ? '指令微调' : mode === 'multi' ? '多轮问答' : '单句模式'}</span>
                <span>{isGenerating ? '生成中' : '待生成'}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExport('json')}
                  disabled={isExporting || generatedData.length === 0}
                  className="bg-slate-800/50 border border-slate-700 py-2 rounded-lg text-[11px] font-bold text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 size={12} className="animate-spin" /> : <FileJson size={12} />} JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  disabled={isExporting || generatedData.length === 0}
                  className="bg-slate-800/50 border border-slate-700 py-2 rounded-lg text-[11px] font-bold text-slate-300 hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} CSV
                </button>
              </div>

              <button
                onClick={() => handleExport('csv')}
                disabled={isExporting || generatedData.length === 0}
                className="w-full bg-slate-800 border border-slate-700 py-2 rounded-lg text-[11px] font-bold text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} 导出 CSV
              </button>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">已生成: {generatedData.length}条</h3>
                <button
                  onClick={handleClearGenerated}
                  className="text-[11px] text-red-400/70 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={10} /> 清空
                </button>
              </div>
              <div className="space-y-3">
                {generatedData.map(item => (
                  <div key={item.id} className="bg-[#161621] border border-slate-800 rounded-xl p-3 space-y-2 group relative">
                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[11px] font-bold uppercase",
                        item.type === 'single' ? "bg-sky-500/10 text-sky-300" :
                        item.type === 'multi' ? "bg-violet-500/10 text-violet-300" :
                        "bg-emerald-500/10 text-emerald-300"
                      )}>
                        {item.type === 'single' ? '单句' : item.type === 'multi' ? '对话' : '指令'}
                      </span>
                      <button
                        onClick={() => handleDeleteGeneratedItem(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                    {item.type === "instruct" ? (
                      <div className="space-y-1.5">
                        {(item.conversations?.length || item.history?.length || 0) > 0 && (
                          <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                            <p className="text-[11px] text-slate-500 font-bold">上一轮上下文</p>
                            {(item.conversations?.slice(0, 2) || [
                              { from: "human", value: item.history?.[0]?.content || "" },
                              { from: "gpt", value: item.history?.[1]?.content || "" },
                            ]).map((turn, index) => (
                              <p key={`${item.id}-history-${index}`} className="rounded bg-slate-950/30 px-2 py-1 text-[11px] text-slate-300">
                                {turn.from === "human" ? "Q" : "A"}: {turn.value}
                              </p>
                            ))}
                          </div>
                        )}
                        {(item.conversations?.length || item.history?.length || 0) > 0 && <div className="h-px bg-slate-800/70" />}
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-300">助手角色 <span className="ml-2 font-mono text-slate-500">System</span></p>
                          <textarea
                            value={item.system || ""}
                            onChange={(e) => handleEditGeneratedItem(item.id, "system", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-slate-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={1}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-300">用户问题 <span className="ml-2 font-mono font-bold text-slate-400">Instruction</span></p>
                          <textarea
                            value={item.instruction || ""}
                            onChange={(e) => handleEditGeneratedItem(item.id, "instruction", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-sky-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={2}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-300"><span className="font-mono text-slate-400">Input</span> <span className="ml-2">约束背景</span></p>
                          <textarea
                            value={item.input || ""}
                            onChange={(e) => handleEditGeneratedItem(item.id, "input", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-slate-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={1}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-300">期望输出 <span className="ml-2 font-mono text-slate-500">Output</span></p>
                          <textarea
                            value={item.output || item.a}
                            onChange={(e) => handleEditGeneratedItem(item.id, "output", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-emerald-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={2}
                          />
                        </div>
                      </div>
                    ) : item.type === "multi" ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-500 font-bold uppercase">上一轮上下文</p>
                        <p className="rounded bg-slate-950/30 px-2 py-1 text-[11px] text-indigo-300">
                          Q: {item.history?.[0]?.content || item.conversations?.[0]?.value || ""}
                        </p>
                        <p className="rounded bg-slate-950/30 px-2 py-1 text-[11px] text-emerald-300">
                          A: {item.history?.[1]?.content || item.conversations?.[1]?.value || ""}
                        </p>
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-slate-500 font-bold uppercase">当前 Query</p>
                          <textarea
                            value={item.currentQuery || item.q}
                            onChange={(e) => handleEditGeneratedItem(item.id, "currentQuery", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-sky-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={1}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-slate-500 font-bold uppercase">当前回答</p>
                          <textarea
                            value={item.response || item.a}
                            onChange={(e) => handleEditGeneratedItem(item.id, "response", e.target.value)}
                            className="w-full bg-transparent text-[11px] text-emerald-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={2}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-slate-500 font-bold uppercase">提问</p>
                          <textarea
                            value={item.q}
                            onChange={(e) => handleEditGeneratedItem(item.id, 'q', e.target.value)}
                            className="w-full bg-transparent text-[11px] text-sky-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={1}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-slate-500 font-bold uppercase">回答</p>
                          <textarea
                            value={item.a}
                            onChange={(e) => handleEditGeneratedItem(item.id, 'a', e.target.value)}
                            className="w-full bg-transparent text-[11px] text-emerald-300 leading-relaxed outline-none resize-none focus:bg-slate-800/30 rounded px-1"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {generatedData.length === 0 && (
                  <div className="py-8 text-center text-[11px] text-slate-600">
                    暂无生成数据
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
                </>
              )}
            </motion.div>
    )}
  </AnimatePresence>

      {/* Toast 通知 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              "px-4 py-2.5 rounded-lg text-xs font-medium shadow-lg pointer-events-auto",
              toast.type === 'error'
                ? "bg-red-500/90 text-white"
                : "bg-slate-700 text-slate-200"
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
</main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2D2D3F;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3D3D5F;
        }

        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 12px;
          width: 12px;
          border-radius: 50%;
          background: #6366F1;
          cursor: pointer;
          border: 2px solid #1A1A27;
        }
      `}} />
    </div>
  );
}
