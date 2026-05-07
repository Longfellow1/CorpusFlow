export type InstructionSample = {
  system?: string;
  instruction: string;
  input: string;
  output: string;
  query?: string;
  instruct?: string;
};

export const DEFAULT_INSTRUCTION_SYSTEM_PROMPT = "你是AI助手，负责帮助用户解决例如查询、操作、交流等各类问题";

export type MultiTurnHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type MultiTurnSample = {
  history: MultiTurnHistoryItem[];
  currentQuery: string;
  response: string;
  q1?: string;
  a1?: string;
  q2?: string;
  a2?: string;
};

export function createEmptyInstructionSample(instruction = ""): InstructionSample {
  return {
    system: "",
    instruction,
    input: "",
    output: "",
  };
}

export function createEmptyMultiTurnSample(currentQuery = ""): MultiTurnSample {
  return {
    history: [
      { role: "user", content: "" },
      { role: "assistant", content: "" },
    ],
    currentQuery,
    response: "",
  };
}

export function normalizeInstructionSample(
  sample: Partial<InstructionSample> | null | undefined,
  fallbackInstruction = "",
): InstructionSample {
  return {
    system: sample?.system || "",
    instruction: sample?.instruction || sample?.query || fallbackInstruction,
    input: sample?.input || "",
    output: sample?.output || sample?.instruct || "",
    query: sample?.query,
    instruct: sample?.instruct,
  };
}

export function normalizeInstructionSampleForEdit(
  sample: Partial<InstructionSample> | null | undefined,
  fallbackInstruction = "",
): InstructionSample {
  const hasInstruction = Boolean(sample) && Object.prototype.hasOwnProperty.call(sample, "instruction");
  return {
    ...normalizeInstructionSample(sample, hasInstruction ? "" : fallbackInstruction),
    instruction: hasInstruction ? sample?.instruction || "" : sample?.instruction || sample?.query || fallbackInstruction,
  };
}

export function applyDefaultInstructionSystemPrompt(sample: InstructionSample): InstructionSample {
  return {
    ...sample,
    system: sample.system?.trim() ? sample.system : DEFAULT_INSTRUCTION_SYSTEM_PROMPT,
  };
}

export function normalizeMultiTurnSample(
  sample: Partial<MultiTurnSample> | null | undefined,
  fallbackCurrentQuery = "",
): MultiTurnSample {
  const history = sample?.history || [
    { role: "user" as const, content: sample?.q1 || "" },
    { role: "assistant" as const, content: sample?.a1 || "" },
  ];

  return {
    history: [
      {
        role: "user",
        content: history[0]?.content || sample?.q1 || "",
      },
      {
        role: "assistant",
        content: history[1]?.content || sample?.a1 || "",
      },
    ],
    currentQuery: sample?.currentQuery || sample?.q2 || fallbackCurrentQuery,
    response: sample?.response || sample?.a2 || "",
    q1: sample?.q1,
    a1: sample?.a1,
    q2: sample?.q2,
    a2: sample?.a2,
  };
}

export function getMissingInstructionFields(sample: InstructionSample) {
  return (["instruction", "output"] as const).filter((field) => !sample[field]?.trim());
}

export function toLlamaFactoryAlpacaRecord(sample: InstructionSample) {
  return {
    instruction: sample.instruction,
    input: sample.input,
    output: sample.output,
    ...(sample.system?.trim() ? { system: sample.system } : {}),
  };
}

export function getMissingMultiTurnFields(sample: MultiTurnSample) {
  const missing: string[] = [];
  if (!sample.history[0]?.content.trim()) missing.push("history[0].content");
  if (!sample.history[1]?.content.trim()) missing.push("history[1].content");
  if (!sample.currentQuery.trim()) missing.push("currentQuery");
  if (!sample.response.trim()) missing.push("response");
  return missing;
}

export function toMultiTurnConversations(sample: MultiTurnSample) {
  return [
    { from: "human", value: sample.history[0]?.content || "" },
    { from: "gpt", value: sample.history[1]?.content || "" },
    { from: "human", value: sample.currentQuery },
    { from: "gpt", value: sample.response },
  ];
}
