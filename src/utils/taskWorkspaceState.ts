import type { QuickTaskRow } from "./quickTaskImport";
import type { WorkspaceRunStatus } from "./workspaceModeContract";

export type SeedLike = {
  id: string;
  text: string;
};

export type GenerationSnapshot<TSeed> = {
  taskId: string;
  mode: "single" | "multi" | "instruct" | "quick";
  multiTurnEnabled: boolean;
  expansionRatio: number;
  temperature: number;
  overallRequirement: string;
  multiTurnContext: string;
  styleAdjustment: string;
  seeds: TSeed[];
};

export type QuickGeneratedItem = {
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

export type QuickRunStats = {
  seeds_count: number;
  total_generated: number;
  total_retained: number;
  pass_rate: number;
};

export type QuickWorkspaceState = {
  quickImportStatus: "idle" | "parsing" | "ready" | "error";
  quickImportError: string;
  quickFile: { name: string; size: string } | null;
  quickTaskKind: "qa" | "instruct" | "multi";
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
  quickRunStatus: WorkspaceRunStatus;
  quickRunStats: QuickRunStats | null;
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
    stats: QuickRunStats;
  }>;
  quickGeneratedItems: QuickGeneratedItem[];
  quickControlExpanded: boolean;
  quickInstructionTemplate: string;
  quickDiversity: number;
  quickGenerationIntent: string;
};

function normalizeSeedText(text: string) {
  return text.trim();
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function buildStableSeedId(text: string, occurrence: number) {
  return `seed-${hashText(normalizeSeedText(text))}-${occurrence}`;
}

export function splitSeedInput(seedInput: string) {
  return seedInput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function reconcileSeedPreview<T extends SeedLike>(
  previousSeeds: T[],
  seedInput: string,
  createSeed: (args: { id: string; text: string; index: number }) => T,
) {
  const lines = splitSeedInput(seedInput);
  const previousByText = new Map<string, T[]>();
  const previousByIndex = new Map<number, T>();

  previousSeeds.forEach((seed, index) => {
    const normalizedText = normalizeSeedText(seed.text);
    const bucket = previousByText.get(normalizedText) || [];
    bucket.push(seed);
    previousByText.set(normalizedText, bucket);
    previousByIndex.set(index, seed);
  });

  const textCounts = new Map<string, number>();
  const usedSeeds = new Set<string>();

  const seeds = lines.map((text, index) => {
    const normalizedText = normalizeSeedText(text);
    const occurrence = textCounts.get(normalizedText) || 0;
    textCounts.set(normalizedText, occurrence + 1);

    const bucket = previousByText.get(normalizedText) || [];
    const matchedByText = bucket.find((seed) => !usedSeeds.has(seed.id));
    if (matchedByText) {
      usedSeeds.add(matchedByText.id);
      return matchedByText;
    }

    const previousAtIndex = previousByIndex.get(index);
    if (previousAtIndex && !usedSeeds.has(previousAtIndex.id)) {
      usedSeeds.add(previousAtIndex.id);
      return createSeed({
        id: previousAtIndex.id,
        text,
        index,
      });
    }

    return createSeed({
      id: buildStableSeedId(text, occurrence),
      text,
      index,
    });
  });

  const changedIds = new Set<string>();
  lines.forEach((text, index) => {
    const current = seeds[index];
    const previous = previousSeeds[index];
    if (!previous || previous.id !== current.id || normalizeSeedText(previous.text) !== normalizeSeedText(text)) {
      changedIds.add(current.id);
    }
  });

  return {
    seeds,
    changedIds: [...changedIds],
    lines,
  };
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createGenerationSnapshot<TSeed>(
  payload: GenerationSnapshot<TSeed>,
): GenerationSnapshot<TSeed> {
  return cloneValue(payload);
}

export function createEmptyQuickWorkspaceState(): QuickWorkspaceState {
  return {
    quickImportStatus: "idle",
    quickImportError: "",
    quickFile: null,
    quickTaskKind: "qa",
    quickMultiTurnEnabled: false,
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
    quickTargetPerSeed: 5,
    quickFilterStrength: "medium",
    quickConcurrency: 4,
    quickRunStatus: "idle",
    quickRunStats: null,
    quickRunProgress: null,
    quickCachedBatches: [],
    quickGeneratedItems: [],
    quickControlExpanded: false,
    quickInstructionTemplate: "",
    quickDiversity: 5,
    quickGenerationIntent: "",
  };
}

export function clearQuickWorkspaceResults(state: QuickWorkspaceState): QuickWorkspaceState {
  return {
    ...state,
    quickRunStatus: "idle",
    quickRunStats: null,
    quickRunProgress: null,
    quickCachedBatches: [],
    quickGeneratedItems: [],
  };
}

export function getFineTuneProgressPercent(args: {
  stage: "idle" | "preparing" | "generating";
  completed: number;
  total: number;
}) {
  if (args.stage === "idle" || args.total <= 0) return 0;
  if (args.stage === "generating") return 92;
  return Math.min(90, Math.round((args.completed / args.total) * 100));
}

export function getQuickProgressPercent(args: {
  runStatus: WorkspaceRunStatus;
  progress?: { total: number; done: number } | null;
  retainedCount: number;
  expectedCount: number;
}) {
  if (args.runStatus === "done") return 100;

  const total = args.progress?.total ?? 0;
  const done = args.progress?.done ?? 0;
  if (total > 0) {
    if (args.runStatus === "running" || args.runStatus === "stopping") {
      return Math.max(6, Math.min(96, Math.round((done / total) * 100)));
    }
    return Math.min(100, Math.round((done / total) * 100));
  }

  if (args.expectedCount > 0 && args.retainedCount > 0) {
    return Math.min(96, Math.round((args.retainedCount / args.expectedCount) * 100));
  }

  return args.runStatus === "running" || args.runStatus === "stopping" ? 6 : 0;
}
