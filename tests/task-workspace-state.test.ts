import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStableSeedId,
  clearQuickWorkspaceResults,
  createEmptyQuickWorkspaceState,
  createGenerationSnapshot,
  getQuickProgressPercent,
  reconcileSeedPreview,
} from "../src/utils/taskWorkspaceState";
import {
  WORKSPACE_MODE_CONTRACTS,
  getFineTuneModeContract,
  getMissingContractRequirements,
  getQuickModeContract,
} from "../src/utils/workspaceModeContract";
import {
  createEmptyInstructionSample,
  createEmptyMultiTurnSample,
  getMissingInstructionFields,
  getMissingMultiTurnFields,
  toLlamaFactoryAlpacaRecord,
  toMultiTurnConversations,
} from "../src/utils/fineTuneDataContract";
import {
  getFineTuneOutputKind,
  getQuickOutputKinds,
  resolveFineTuneMode,
  resolveQuickRequestType,
  resolveQuickResultType,
} from "../src/utils/generationModeConfig";

type TestSeed = {
  id: string;
  text: string;
  status: "pending" | "processing" | "completed";
  marker?: string;
};

test("reconcileSeedPreview preserves unchanged seed objects and only creates new entries for added lines", () => {
  const previousSeeds: TestSeed[] = [
    { id: "seed-a", text: "第一条", status: "completed" as const, marker: "keep-a" },
    { id: "seed-b", text: "第二条", status: "completed" as const, marker: "keep-b" },
  ];

  const { seeds, changedIds } = reconcileSeedPreview(previousSeeds, "第一条\n第二条\n第三条", ({ id, text }) => ({
    id,
    text,
    status: "pending" as const,
    marker: "new",
  }));

  assert.equal(seeds[0], previousSeeds[0]);
  assert.equal(seeds[1], previousSeeds[1]);
  assert.equal(seeds[2]?.text, "第三条");
  assert.notEqual(seeds[2], previousSeeds[0]);
  assert.deepEqual(changedIds, [seeds[2]!.id]);
});

test("reconcileSeedPreview reuses the existing card id when a line changes in place", () => {
  const previousSeeds: TestSeed[] = [
    { id: "seed-a", text: "旧句子", status: "completed" as const, marker: "keep-a" },
  ];

  const { seeds, changedIds } = reconcileSeedPreview(previousSeeds, "新句子", ({ id, text }) => ({
    id,
    text,
    status: "pending" as const,
    marker: "new",
  }));

  assert.equal(seeds[0]?.id, "seed-a");
  assert.equal(seeds[0]?.text, "新句子");
  assert.equal(seeds[0]?.status, "pending");
  assert.deepEqual(changedIds, ["seed-a"]);
});

test("buildStableSeedId is deterministic for the same text and occurrence", () => {
  assert.equal(buildStableSeedId("帮我打开后备箱", 0), buildStableSeedId("帮我打开后备箱", 0));
  assert.notEqual(buildStableSeedId("帮我打开后备箱", 0), buildStableSeedId("帮我打开后备箱", 1));
});

test("createGenerationSnapshot deep clones seeds so later edits do not leak into the request", () => {
  const seed = { id: "seed-a", text: "第一条", nested: { value: 1 } };
  const snapshot = createGenerationSnapshot({
    taskId: "task-1",
    mode: "single",
    multiTurnEnabled: false,
    expansionRatio: 22,
    temperature: 0.78,
    overallRequirement: "自然",
    multiTurnContext: "",
    styleAdjustment: "",
    seeds: [seed],
  });

  seed.text = "第二条";
  seed.nested.value = 2;

  assert.equal(snapshot.seeds[0]?.text, "第一条");
  assert.equal(snapshot.seeds[0]?.nested.value, 1);
});

test("createEmptyQuickWorkspaceState and clearQuickWorkspaceResults keep clear scoped to the active task", () => {
  const initial = createEmptyQuickWorkspaceState();
  const populated = {
    ...initial,
    quickImportStatus: "ready" as const,
    quickGeneratedItems: [{ id: "item-1", type: "single" as const, q: "Q", a: "A" }],
    quickRunStats: {
      seeds_count: 1,
      total_generated: 1,
      total_retained: 1,
      pass_rate: 1,
    },
  };

  const cleared = clearQuickWorkspaceResults(populated);

  assert.equal(cleared.quickImportStatus, "ready");
  assert.equal(cleared.quickRunStatus, "idle");
  assert.equal(cleared.quickRunStats, null);
  assert.equal(cleared.quickRunProgress, null);
  assert.deepEqual(cleared.quickGeneratedItems, []);
});

test("quick progress starts low and advances by completed seeds instead of rendering full immediately", () => {
  assert.equal(
    getQuickProgressPercent({
      runStatus: "running",
      progress: null,
      retainedCount: 0,
      expectedCount: 25,
    }),
    6,
  );

  assert.equal(
    getQuickProgressPercent({
      runStatus: "running",
      progress: { total: 5, done: 2 },
      retainedCount: 10,
      expectedCount: 25,
    }),
    40,
  );

  assert.equal(
    getQuickProgressPercent({
      runStatus: "done",
      progress: { total: 5, done: 5 },
      retainedCount: 25,
      expectedCount: 25,
    }),
    100,
  );
});

test("workspace mode contracts isolate quick, fine tune, and evaluation outputs", () => {
  assert.equal(getFineTuneModeContract("multi").preview, "multiPreview");
  assert.equal(getFineTuneModeContract("instruct").output, "generatedCorpus");
  assert.equal(getQuickModeContract("qa").output, "quickGenerated");
  assert.equal(getQuickModeContract("instruct").preview, "importPreview");
  assert.equal(WORKSPACE_MODE_CONTRACTS.evaluation.output, "evalReport");
});

test("workspace contracts expose missing requirements without mode-specific if chains", () => {
  assert.deepEqual(
    getMissingContractRequirements(getQuickModeContract("instruct"), {
      importedRows: ["帮我打开后盖"],
      instruction: "",
    }),
    ["instruction"],
  );

  assert.deepEqual(
    getMissingContractRequirements(getQuickModeContract("instruct"), {
      importedRows: ["帮我打开后盖"],
      instruction: "请改写",
    }),
    [],
  );
});

test("fine-tune mode resolves from output kind plus multi-turn switch", () => {
  assert.equal(resolveFineTuneMode("qa", false), "single");
  assert.equal(resolveFineTuneMode("qa", true), "multi");
  assert.equal(resolveFineTuneMode("instruct", false), "instruct");
  assert.equal(resolveFineTuneMode("instruct", true), "instruct");
  assert.equal(getFineTuneOutputKind("multi"), "qa");
  assert.equal(getFineTuneOutputKind("instruct"), "instruct");
});

test("quick generation keeps output type separate from the multi-turn switch", () => {
  assert.equal(resolveQuickRequestType("qa", false), "qa");
  assert.equal(resolveQuickRequestType("qa", true), "multi");
  assert.equal(resolveQuickRequestType("instruct", true), "instruct");
  assert.equal(resolveQuickResultType("qa", false), "single");
  assert.equal(resolveQuickResultType("qa", true), "multi");
  assert.equal(resolveQuickResultType("instruct", true), "instruct");
});

test("quick generation supports only qa and instruction fine-tune output kinds", () => {
  assert.deepEqual(getQuickOutputKinds(), ["qa", "instruct"]);
});

test("fine-tune instruction contract checks instruction input and output fields", () => {
  const empty = createEmptyInstructionSample("帮我查一下胎压");

  assert.deepEqual(empty, {
    system: "",
    instruction: "帮我查一下胎压",
    input: "",
    output: "",
  });
  assert.deepEqual(getMissingInstructionFields(empty), ["output"]);
  assert.deepEqual(
    getMissingInstructionFields({
      system: "你是车机助手，直接回答用户问题",
      instruction: "帮我查一下胎压",
      input: "",
      output: "好的，我来帮你查看当前胎压。",
    }),
    [],
  );
});

test("fine-tune instruction normalization keeps current query in instruction and leaves input for supplemental material", () => {
  assert.deepEqual(
    createEmptyInstructionSample("我叫范德彪，我爱吃红烧肉"),
    {
      system: "",
      instruction: "我叫范德彪，我爱吃红烧肉",
      input: "",
      output: "",
    },
  );

  assert.deepEqual(
    toLlamaFactoryAlpacaRecord({
      system: "你是车载语音助手，负责响应用户的各类需求",
      instruction: "我叫范德彪，我爱吃红烧肉",
      input: "",
      output: "好的，我已了解你的姓名和饮食偏好。",
    }),
    {
      system: "你是车载语音助手，负责响应用户的各类需求",
      instruction: "我叫范德彪，我爱吃红烧肉",
      input: "",
      output: "好的，我已了解你的姓名和饮食偏好。",
    },
  );
});

test("fine-tune instruction contract exports LLaMA-Factory alpaca records", () => {
  assert.deepEqual(
    toLlamaFactoryAlpacaRecord({
      system: "你是车机助手，直接回答用户问题",
      instruction: "帮我查一下胎压",
      input: "车辆已启动",
      output: "好的，我来帮你查看当前胎压。",
    }),
    {
      system: "你是车机助手，直接回答用户问题",
      instruction: "帮我查一下胎压",
      input: "车辆已启动",
      output: "好的，我来帮你查看当前胎压。",
    },
  );
});

test("fine-tune multi-turn contract treats current query as the target turn", () => {
  const empty = createEmptyMultiTurnSample("那现在该怎么处理");

  assert.equal(empty.currentQuery, "那现在该怎么处理");
  assert.deepEqual(getMissingMultiTurnFields(empty), ["history[0].content", "history[1].content", "response"]);

  const sample = {
    ...empty,
    history: [
      { role: "user" as const, content: "我的车胎压有点低" },
      { role: "assistant" as const, content: "建议先确认胎压数值和是否有漏气提示。" },
    ],
    response: "请先靠边停车检查胎压，如果持续偏低，建议联系维修服务。",
  };

  assert.deepEqual(getMissingMultiTurnFields(sample), []);
  assert.deepEqual(toMultiTurnConversations(sample), [
    { from: "human", value: "我的车胎压有点低" },
    { from: "gpt", value: "建议先确认胎压数值和是否有漏气提示。" },
    { from: "human", value: "那现在该怎么处理" },
    { from: "gpt", value: "请先靠边停车检查胎压，如果持续偏低，建议联系维修服务。" },
  ]);
});
