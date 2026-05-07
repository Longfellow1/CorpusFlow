export type WorkspaceTaskKind = "fineTune" | "quick" | "evaluation";
export type WorkspaceRunStatus = "idle" | "running" | "paused" | "stopping" | "done";
export type FineTuneModeId = "single" | "multi" | "instruct";
export type QuickModeId = "quick_qa" | "quick_multi" | "quick_instruct";
export type WorkspaceModeId =
  | FineTuneModeId
  | QuickModeId
  | "evaluation";

export type WorkspaceModeContract = {
  mode: WorkspaceModeId;
  taskKind: WorkspaceTaskKind;
  input: "seeds" | "importedRows" | "evalDataset";
  preview?: "singlePreview" | "multiPreview" | "instructPreview" | "importPreview" | "evalPlanPreview";
  output: "generatedCorpus" | "quickGenerated" | "evalReport";
  required: string[];
  actions: {
    preview: boolean;
    run: boolean;
    pause: boolean;
    resume: boolean;
    stop: boolean;
    export: boolean;
  };
};

export type WorkspaceRequirementValues = Partial<Record<string, unknown>>;

export const WORKSPACE_MODE_CONTRACTS: Record<WorkspaceModeId, WorkspaceModeContract> = {
  single: {
    mode: "single",
    taskKind: "fineTune",
    input: "seeds",
    preview: "singlePreview",
    output: "generatedCorpus",
    required: ["seeds"],
    actions: { preview: true, run: true, pause: false, resume: false, stop: true, export: true },
  },
  multi: {
    mode: "multi",
    taskKind: "fineTune",
    input: "seeds",
    preview: "multiPreview",
    output: "generatedCorpus",
    required: ["seeds"],
    actions: { preview: true, run: true, pause: false, resume: false, stop: true, export: true },
  },
  instruct: {
    mode: "instruct",
    taskKind: "fineTune",
    input: "seeds",
    preview: "instructPreview",
    output: "generatedCorpus",
    required: ["seeds"],
    actions: { preview: true, run: true, pause: false, resume: false, stop: true, export: true },
  },
  quick_qa: {
    mode: "quick_qa",
    taskKind: "quick",
    input: "importedRows",
    preview: "importPreview",
    output: "quickGenerated",
    required: ["importedRows"],
    actions: { preview: false, run: true, pause: true, resume: true, stop: true, export: true },
  },
  quick_multi: {
    mode: "quick_multi",
    taskKind: "quick",
    input: "importedRows",
    preview: "importPreview",
    output: "quickGenerated",
    required: ["importedRows"],
    actions: { preview: false, run: true, pause: true, resume: true, stop: true, export: true },
  },
  quick_instruct: {
    mode: "quick_instruct",
    taskKind: "quick",
    input: "importedRows",
    preview: "importPreview",
    output: "quickGenerated",
    required: ["importedRows", "instruction"],
    actions: { preview: false, run: true, pause: true, resume: true, stop: true, export: true },
  },
  evaluation: {
    mode: "evaluation",
    taskKind: "evaluation",
    input: "evalDataset",
    preview: "evalPlanPreview",
    output: "evalReport",
    required: ["evalDataset"],
    actions: { preview: true, run: true, pause: true, resume: true, stop: true, export: true },
  },
};

export function getQuickModeContract(kind: "qa" | "multi" | "instruct") {
  return WORKSPACE_MODE_CONTRACTS[`quick_${kind}` as const];
}

export function getFineTuneModeContract(mode: FineTuneModeId) {
  return WORKSPACE_MODE_CONTRACTS[mode];
}

function hasRequirementValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

export function getMissingContractRequirements(
  contract: WorkspaceModeContract,
  values: WorkspaceRequirementValues,
) {
  return contract.required.filter((name) => !hasRequirementValue(values[name]));
}
