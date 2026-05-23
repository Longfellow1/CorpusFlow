export type EvidenceRole =
  | "identity"
  | "input"
  | "actual"
  | "expected"
  | "context"
  | "tooling"
  | "judgment"
  | "runtime"
  | "annotation";

export type EvidenceCompleteness = "A" | "B" | "C" | "D";
export type ExtractionMode = "rule" | "llm" | "mock";
export type ClusterDecisionStatus = "accepted" | "rejected" | "pending";
export type EvalAssetType = "eval_cases" | "training_candidates" | "negative_cases";

export type EvidenceFieldMapping = Partial<Record<string, string>>;
export type RoleConfidence = Partial<Record<EvidenceRole, number>>;

export type EvalEvidenceCase = {
  id: string;
  taskId: string;
  sourceCaseId: string;
  caseType: string;
  interaction: {
    input: string;
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    actualOutput: string;
  };
  expectation: {
    expectedOutput: string;
    rubrics: string[];
  };
  context: {
    retrievedContexts: string[];
    memory: Record<string, unknown>;
  };
  execution: {
    model: string;
    promptVersion: string;
    toolsCalled: string[];
    latencyMs: number | null;
    tokenUsage: { input: number; output: number } | null;
    status: string;
  };
  judgments: Array<{
    name: string;
    pass: boolean | null;
    score: number | null;
    reason: string;
    source: "human" | "eval" | "rule";
  }>;
  annotation: {
    failureNote: string;
    repairHint: string;
    severity: "low" | "medium" | "high";
    tags: string[];
  };
  metadata: {
    domain: string;
    sourceFile: string;
  };
  provenance: {
    sourceRowId: string;
    traceId: string;
    sessionId: string;
    sourceTextRange: null;
    extractionMode: ExtractionMode;
    fieldMapping: EvidenceFieldMapping;
    roleConfidence: RoleConfidence;
  };
  completeness: EvidenceCompleteness;
  confidence: number;
  degraded: boolean;
};

export type FailureSignal =
  | "memory_missing"
  | "coreference_failed"
  | "tool_not_called"
  | "wrong_tool"
  | "constraint_missing"
  | "weak_answer"
  | "safety_boundary"
  | "format_error"
  | "retrieval_miss"
  | "unknown_failure";

export type ProblemCluster = {
  id: string;
  name: string;
  caseCount: number;
  representativeCaseIds: string[];
  failureSignals: FailureSignal[];
  basis: {
    clusterMethod: "rule_bucket" | "rule_bucket_llm_label";
    primaryRoles: string[];
    slices: Record<string, string>;
  };
  summary: string;
  rootCauseHypothesis: string;
  recommendedStrategy: {
    assetType: EvalAssetType;
    count: number;
    schema: "alpaca" | "sharegpt_history" | "eval_case_jsonl";
    strategyTemplate: string;
    solution: string;
  };
  quality: {
    confidence: number;
    purity: "low" | "medium" | "high";
    needsHumanReview: boolean;
  };
  status: ClusterDecisionStatus;
  degraded: boolean;
};

export type EvalAssetRecord = {
  id: string;
  clusterId: string;
  sourceCaseId: string;
  assetType: EvalAssetType;
  expansion: {
    mode: "strategy_batch_expansion";
    generator: "batch_strategy_expander_v0";
    llmInference: false;
    strategyTemplate: string;
    variant: string;
    variantIndex: number;
  };
  instruction: string;
  input: string;
  output: string;
  system?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  expected?: string;
  tags: string[];
};

export type EvalAssetPackage = {
  taskId: string;
  runId: string;
  files: Record<string, number>;
  assets: {
    evalCases: EvalAssetRecord[];
    trainingCandidates: EvalAssetRecord[];
    negativeCases: EvalAssetRecord[];
    qualityReport: Record<string, unknown>;
    provenance: Array<{
      assetId: string;
      sourceCaseId: string;
      sourceRowId: string;
      problemCluster: string;
      assetType: EvalAssetType;
      generatedAt: string;
    }>;
  };
};

const BATCH_EXPANSION_VARIANTS = [
  {
    name: "source_replay",
    prefix: "",
    note: "原始失败证据重放，保留 source case 的业务边界。",
  },
  {
    name: "colloquial_voice",
    prefix: "车主口语表达：",
    note: "把同类失败改写为更自然的座舱语音口语。",
  },
  {
    name: "constraint_rich",
    prefix: "带额外约束的车载请求：",
    note: "增加时间、地点、座位、排序或安全边界等约束。",
  },
  {
    name: "cross_domain_followup",
    prefix: "跨域追问：",
    note: "模拟导航、媒体、POI、车控之间的连续追问。",
  },
  {
    name: "negative_boundary",
    prefix: "边界表达：",
    note: "覆盖 Action/Non_Action、工具路由和业务质检边界。",
  },
  {
    name: "regression_probe",
    prefix: "回归探针：",
    note: "用于下一轮回归评测的稳定检查样本。",
  },
] as const;

function getBatchExpansionVariant(assetIndex: number) {
  return BATCH_EXPANSION_VARIANTS[assetIndex % BATCH_EXPANSION_VARIANTS.length];
}

function expandInstruction(baseInstruction: string, assetIndex: number) {
  const variant = getBatchExpansionVariant(assetIndex);
  if (!variant.prefix) return baseInstruction;
  return `${variant.prefix}${baseInstruction}`;
}

export type EvaluationSnapshot = {
  taskId: string;
  sourceFile: string;
  parseStatus: "idle" | "parsing" | "ready" | "error";
  oneSentenceConclusion: string;
  fieldRoles: Array<{
    role: EvidenceRole;
    header: string;
    confidence: number;
  }>;
  stats: {
    rawCount: number;
    evidenceCount: number;
    failedCount: number;
    suspectedCount: number;
    rejectedCount: number;
    completeness: Record<EvidenceCompleteness, number>;
    fieldRoleSuccessRate: number;
  };
  cases: EvalEvidenceCase[];
  clusters: ProblemCluster[];
  preview: EvalAssetPackage | null;
  package: EvalAssetPackage | null;
  updatedAt: string;
};

type RawEvidenceRow = Record<string, unknown>;

const ROLE_ALIASES: Record<EvidenceRole, string[]> = {
  identity: [
    "id",
    "caseid",
    "case_id",
    "evalid",
    "eval_id",
    "runid",
    "run_id",
    "traceid",
    "trace_id",
    "sessionid",
    "session_id",
    "spanid",
    "span_id",
    "version",
    "样本id",
    "用例id",
  ],
  input: [
    "input",
    "userinput",
    "user_input",
    "query",
    "question",
    "prompt",
    "instruction",
    "messages",
    "history",
    "conversation",
    "用户输入",
    "用户问题",
    "问题",
    "消息",
    "对话",
  ],
  actual: [
    "actual",
    "actualoutput",
    "actual_output",
    "output",
    "response",
    "completion",
    "answer",
    "assistant",
    "modeloutput",
    "model_output",
    "模型输出",
    "实际回答",
    "实际输出",
    "回答",
  ],
  expected: [
    "expected",
    "expectedoutput",
    "expected_output",
    "ideal",
    "reference",
    "groundtruth",
    "ground_truth",
    "label",
    "target",
    "预期",
    "期望输出",
    "参考答案",
    "标准答案",
    "期望行为",
  ],
  context: [
    "context",
    "retrievedcontexts",
    "retrieved_contexts",
    "referencecontexts",
    "reference_contexts",
    "documents",
    "document",
    "memory",
    "knowledge",
    "上下文",
    "检索上下文",
    "材料",
    "记忆",
  ],
  tooling: [
    "tool",
    "tools",
    "toolcalls",
    "tool_calls",
    "toolscalled",
    "tools_called",
    "expectedtools",
    "expected_tools",
    "toolresults",
    "tool_results",
    "action",
    "工具",
    "工具调用",
    "动作",
  ],
  judgment: [
    "pass",
    "passed",
    "success",
    "score",
    "label",
    "grade",
    "gradingresult",
    "grading_result",
    "assertion",
    "assertionresult",
    "assertion_result",
    "reason",
    "comment",
    "通过",
    "是否通过",
    "分数",
    "评测结果",
    "失败原因",
  ],
  runtime: [
    "latency",
    "latencyms",
    "latency_ms",
    "duration",
    "tokens",
    "tokenusage",
    "token_usage",
    "cost",
    "model",
    "promptversion",
    "prompt_version",
    "error",
    "status",
    "耗时",
    "模型",
    "版本",
    "错误",
  ],
  annotation: [
    "feedback",
    "failurenote",
    "failure_note",
    "repairhint",
    "repair_hint",
    "severity",
    "tag",
    "tags",
    "note",
    "备注",
    "人工反馈",
    "修复建议",
    "问题备注",
  ],
};

const ROLE_ORDER: EvidenceRole[] = [
  "identity",
  "input",
  "actual",
  "expected",
  "context",
  "tooling",
  "judgment",
  "runtime",
  "annotation",
];

const SIGNAL_CONFIG: Record<FailureSignal, {
  name: string;
  summary: string;
  hypothesis: string;
  assetType: EvalAssetType;
  schema: ProblemCluster["recommendedStrategy"]["schema"];
  strategyTemplate: string;
  solution: string;
  keywords: string[];
}> = {
  memory_missing: {
    name: "多轮上下文承接失败",
    summary: "没有稳定继承上一轮地点、状态、偏好或约束。",
    hypothesis: "缺少 history + current query 的长上下文修复样本。",
    assetType: "training_candidates",
    schema: "sharegpt_history",
    strategyTemplate: "multiturn_context_repair",
    solution: "补充带上一轮信息、指代词和当前任务的多轮训练候选。",
    keywords: ["多轮", "上下文", "history", "memory", "记忆", "上一轮", "承接", "指代", "coreference", "忘记"],
  },
  coreference_failed: {
    name: "指代解析失败",
    summary: "未能把“那里、附近、这个”等指代映射到已知上下文。",
    hypothesis: "缺少指代消解与上下文绑定样本。",
    assetType: "training_candidates",
    schema: "sharegpt_history",
    strategyTemplate: "coreference_repair",
    solution: "生成含隐式地点、对象、时间指代的多轮样本。",
    keywords: ["指代", "那里", "附近", "这个", "那个", "coreference"],
  },
  tool_not_called: {
    name: "应调用工具但未调用",
    summary: "系统给出文本回答，但没有触发必要工具或外部动作。",
    hypothesis: "工具调用边界样本不足，模型倾向用语言回答替代动作。",
    assetType: "eval_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "tool_call_boundary_eval",
    solution: "补充需要调用工具的回归评测用例，并标明 expected tool。",
    keywords: ["未调用", "没调用", "tool_not_called", "tool not called", "工具", "action missing", "查询", "导航", "检索"],
  },
  wrong_tool: {
    name: "工具选择错误",
    summary: "工具类型、参数或落域不匹配当前请求。",
    hypothesis: "工具路由边界与参数约束样本不足。",
    assetType: "eval_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "tool_routing_eval",
    solution: "生成不同工具边界和相近意图的回归评测用例。",
    keywords: ["错工具", "wrong tool", "工具选择", "落域", "路由", "参数错误", "domain"],
  },
  constraint_missing: {
    name: "复合约束遗漏",
    summary: "回答只满足部分约束，遗漏时间、范围、数量、排序或禁止条件。",
    hypothesis: "长指令和多约束样本覆盖不足。",
    assetType: "training_candidates",
    schema: "alpaca",
    strategyTemplate: "multi_constraint_repair",
    solution: "生成包含多个显式约束的指令微调候选。",
    keywords: ["约束", "遗漏", "漏", "复合", "限制", "条件", "排序", "数量", "只满足", "constraint"],
  },
  weak_answer: {
    name: "弱答或空泛回答",
    summary: "回答缺少可执行信息，或用泛泛话术替代具体结果。",
    hypothesis: "缺少高信息量回答标准与对照样本。",
    assetType: "training_candidates",
    schema: "alpaca",
    strategyTemplate: "specific_answer_repair",
    solution: "补充具体、可执行、带必要解释的标准回答样本。",
    keywords: ["空泛", "泛化", "弱答", "不具体", "无帮助", "不知道", "含糊", "vague", "generic"],
  },
  safety_boundary: {
    name: "安全拒识边界不稳",
    summary: "对敏感、灰区或正常请求的拒答边界不稳定。",
    hypothesis: "安全边界正负样本和解释样本不足。",
    assetType: "negative_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "safety_boundary_eval",
    solution: "补充拒识、正常放行和安全替代回答的边界样本。",
    keywords: ["安全", "拒识", "拒答", "敏感", "违规", "越狱", "unsafe", "safety", "blocked"],
  },
  format_error: {
    name: "格式或结构错误",
    summary: "输出格式、字段、JSON 结构或 schema 不符合要求。",
    hypothesis: "结构化输出约束和失败回归样本不足。",
    assetType: "eval_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "format_schema_eval",
    solution: "补充 schema 约束、反例和格式校验评测用例。",
    keywords: ["格式", "schema", "json", "字段", "结构", "解析失败", "format"],
  },
  retrieval_miss: {
    name: "检索证据缺失",
    summary: "回答没有使用可用上下文，或检索内容不足以支撑回答。",
    hypothesis: "检索召回、上下文利用和引用约束样本不足。",
    assetType: "eval_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "retrieval_grounding_eval",
    solution: "生成含 retrieved_contexts、reference 和 grounding 检查的评测样本。",
    keywords: ["检索", "retrieval", "context", "引用", "材料", "知识库", "grounding"],
  },
  unknown_failure: {
    name: "待人工确认的长尾失败",
    summary: "证据不足以稳定归类，需要补充标注或业务背景。",
    hypothesis: "当前证据缺少明确 judgment、expected 或 failure note。",
    assetType: "eval_cases",
    schema: "eval_case_jsonl",
    strategyTemplate: "human_review_queue",
    solution: "先整理为人工复核队列，补齐期望输出和失败理由。",
    keywords: [],
  },
};

function vehicleIntentBadcase(args: {
  id: string;
  input: string;
  actual: string;
  expected: string;
  reason: string;
  context?: string;
  toolCalls?: string;
  sessionId?: string;
  latencyMs?: number;
}): RawEvidenceRow {
  return {
    case_id: args.id,
    user_input: args.input,
    actual_output: args.actual,
    expected_behavior: args.expected,
    pass: "false",
    failure_reason: args.reason,
    failure_note: args.reason,
    retrieved_contexts: args.context || "",
    tool_calls: args.toolCalls || "[]",
    trace_id: `trace-${args.id}`,
    session_id: args.sessionId || `session-${args.id.slice(4, 7)}`,
    model: "cabin-intent-arbiter-demo",
    prompt_version: "intent-arbitration-prd-0909",
    latency_ms: args.latencyMs ?? 180,
    domain: "vehicle_agent",
  };
}

export const EVALUATION_DEMO_ROWS: RawEvidenceRow[] = [
  vehicleIntentBadcase({
    id: "arb-001",
    input: "自动前大灯是什么意思，我需要打开吗？",
    actual: "已为你打开自动前大灯。",
    expected: "识别为 Non_Action，落域到安全用车问答，解释自动前大灯功能和适用场景，不执行车控。",
    reason: "车控误纳，Action/Non_Action 性质标签误判，落域错误到传统车控。",
    context: "PRD痛点：传统技能优先导致解释类 query 被截断，非动作类指令应进入意图识别流程。",
    toolCalls: "[{\"service\":\"vehicle_light_control\",\"action\":\"open_auto_headlight\"}]",
    sessionId: "session-control-misfire-01",
    latencyMs: 82,
  }),
  vehicleIntentBadcase({
    id: "arb-002",
    input: "儿童锁是干嘛的，开着会影响后排下车吗？",
    actual: "已开启儿童锁。",
    expected: "识别为 Non_Action，落域到安全用车/车控说明问答，解释儿童锁影响，不执行开关动作。",
    reason: "车控误纳，实体识别过于粗暴，将功能解释问句落域错误为车门车控。",
    context: "车控域包含车门、车窗、安全带等传统技能，解释类问法需要被性质标签降权。",
    toolCalls: "[{\"service\":\"door_control\",\"action\":\"child_lock_on\"}]",
    sessionId: "session-control-misfire-01",
    latencyMs: 76,
  }),
  vehicleIntentBadcase({
    id: "arb-003",
    input: "方向盘加热费电吗，冬天要不要一直开？",
    actual: "已打开方向盘加热。",
    expected: "识别为 Non_Action，落域到用车知识问答，说明能耗和建议使用方式，不执行方向盘加热。",
    reason: "车控误纳，落域错误；咨询类 query 被传统车控技能截断。",
    context: "PRD目标：提升自然语义落域正确率，避免非动作类指令直接闭环。",
    toolCalls: "[{\"service\":\"steering_wheel_control\",\"action\":\"heat_on\"}]",
    sessionId: "session-control-misfire-02",
    latencyMs: 91,
  }),
  vehicleIntentBadcase({
    id: "arb-004",
    input: "后视镜自动折叠是停车以后自己收起来吗？",
    actual: "已为你折叠后视镜。",
    expected: "识别为 Non_Action，解释后视镜自动折叠触发条件，不执行折叠动作。",
    reason: "车控误纳，动作/非动作分类失败，落域错误到后视镜控制。",
    context: "融合标签仲裁规则：当性质标签为 Non_Action 时，降权或忽略 Action 类候选服务。",
    toolCalls: "[{\"service\":\"mirror_control\",\"action\":\"fold\"}]",
    sessionId: "session-control-misfire-02",
    latencyMs: 88,
  }),
  vehicleIntentBadcase({
    id: "arb-005",
    input: "氛围灯的迎宾模式是什么意思？",
    actual: "已打开迎宾模式氛围灯。",
    expected: "识别为 Non_Action，落域到车辆功能说明，解释迎宾模式，不执行氛围灯设置。",
    reason: "车控误纳，候选服务优先级压过意图推理，落域错误。",
    context: "传统技能优先命中导致 Query 无法释放到下游 LLM 意图识别。",
    toolCalls: "[{\"service\":\"ambient_light_control\",\"action\":\"welcome_mode_on\"}]",
    sessionId: "session-control-misfire-03",
    latencyMs: 93,
  }),
  vehicleIntentBadcase({
    id: "arb-006",
    input: "底盘升降有什么用，跑高速要调高还是调低？",
    actual: "已将底盘调高。",
    expected: "识别为 Non_Action，解释底盘升降和高速场景建议，不执行底盘动作。",
    reason: "车控误纳，落域错误；问答意图被车控动作覆盖。",
    context: "车控域包含底盘升降，解释类问题需要进入意图识别而非传统技能闭环。",
    toolCalls: "[{\"service\":\"chassis_control\",\"action\":\"raise\"}]",
    sessionId: "session-control-misfire-03",
    latencyMs: 96,
  }),
  vehicleIntentBadcase({
    id: "arb-007",
    input: "低速提示音是给行人听的吗？",
    actual: "已关闭低速提示音。",
    expected: "识别为 Non_Action，落域到安全用车问答，解释低速提示音用途，不执行关闭。",
    reason: "车控误纳，安全解释问句落域错误到低速音控制。",
    context: "PRD要求指令质检作为业务安全防线，确保最终下发符合业务预期。",
    toolCalls: "[{\"service\":\"low_speed_sound\",\"action\":\"off\"}]",
    sessionId: "session-control-misfire-04",
    latencyMs: 101,
  }),
  vehicleIntentBadcase({
    id: "arb-008",
    input: "HUD抬头显示箭头有什么好处？",
    actual: "已开启 HUD 转向提示显示。",
    expected: "识别为 Non_Action，说明 HUD 抬头显示价值，不执行 HUD 设置。",
    reason: "车控误纳，落域错误到 HUD 设置；性质标签没有压制 Action 候选。",
    context: "融合标签判定需要在双命中+Non_Action 时选择智能体问答而非传统技能。",
    toolCalls: "[{\"service\":\"hud_control\",\"action\":\"navigation_on\"}]",
    sessionId: "session-control-misfire-04",
    latencyMs: 84,
  }),
  vehicleIntentBadcase({
    id: "arb-009",
    input: "自动泊车会不会自己刹停？",
    actual: "已开启自动泊车。",
    expected: "识别为 Non_Action，落域到辅助驾驶说明，解释自动泊车能力边界，不执行泊车动作。",
    reason: "车控误纳，落域错误；能力咨询被传统辅助驾驶技能截断。",
    context: "PRD痛点：用户意图未被正确识别和下发，影响基础体验流畅性。",
    toolCalls: "[{\"service\":\"adas_control\",\"action\":\"auto_parking_on\"}]",
    sessionId: "session-control-misfire-05",
    latencyMs: 109,
  }),
  vehicleIntentBadcase({
    id: "arb-010",
    input: "座椅通风和空调吹风有什么区别？",
    actual: "已打开主驾座椅通风。",
    expected: "识别为 Non_Action，比较座椅通风与空调出风差异，不执行座椅动作。",
    reason: "车控误纳，落域错误；解释类 query 被判成 Action。",
    context: "动作/非动作二分类准确率是 PRD 核心指标之一。",
    toolCalls: "[{\"service\":\"seat_control\",\"action\":\"ventilation_on\"}]",
    sessionId: "session-control-misfire-05",
    latencyMs: 87,
  }),
  vehicleIntentBadcase({
    id: "arb-011",
    input: "给我播放一个粉色小猪的节目",
    actual: "我可以和你聊聊粉色小猪。",
    expected: "落域到儿童节目/媒体播放服务，调用节目播放能力，搜索并播放相关节目。",
    reason: "PK仲裁失效，应调用节目播放服务但未调用；传统技能域与大模型域都能响应时仲裁结果不合理。",
    context: "PRD示例：给我播放一个粉色小猪的节目，后置仲裁无法有效落域。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-01",
    latencyMs: 214,
  }),
  vehicleIntentBadcase({
    id: "arb-012",
    input: "播放小朋友听的西游记故事",
    actual: "西游记是中国古典四大名著之一。",
    expected: "落域到媒体/儿童故事播放服务，调用内容搜索并播放儿童版西游记故事。",
    reason: "PK仲裁失效，应调用节目播放工具但未调用；内容播放意图被闲聊覆盖。",
    context: "高频失效域：节目播放类。最终应输出 Query+意图标签给下游。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-01",
    latencyMs: 225,
  }),
  vehicleIntentBadcase({
    id: "arb-013",
    input: "帮我搜附近还营业的洗车店",
    actual: "你可以在地图里搜索洗车店。",
    expected: "落域到 POI 搜索服务，调用附近搜索并按营业状态过滤。",
    reason: "PK仲裁失效，应调用POI查询工具但未调用；只给文本建议。",
    context: "高频失效域：POI搜索类。仲裁PK结果应生成唯一最优落域并下发。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-02",
    latencyMs: 238,
  }),
  vehicleIntentBadcase({
    id: "arb-014",
    input: "找个评分高的充电站，别太远",
    actual: "附近可能有一些充电站。",
    expected: "落域到充电/POI搜索服务，调用附近充电站查询并带评分、距离约束。",
    reason: "PK仲裁失效，应调用POI或充电查询工具但未调用；复合约束没有进入服务参数。",
    context: "综合候选服务、优先级List与性质标签后，应选择可执行服务单元。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-02",
    latencyMs: 242,
  }),
  vehicleIntentBadcase({
    id: "arb-015",
    input: "查一下今天上海外牌高架限行",
    actual: "今天出行请注意安全。",
    expected: "落域到限行/用车查询服务，调用检索并返回限行时间、范围和依据。",
    reason: "PK仲裁失效，应调用限行查询或检索工具但未调用；被泛化回答覆盖。",
    context: "意图识别模块需命中安全用车/出行查询粗标签，并输出给下游。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-03",
    latencyMs: 251,
  }),
  vehicleIntentBadcase({
    id: "arb-016",
    input: "看看今天有什么汽车新闻",
    actual: "汽车行业最近发展很快。",
    expected: "落域到新闻服务，调用新闻检索并播报汽车新闻摘要。",
    reason: "PK仲裁失效，应调用新闻检索工具但未调用；新闻类意图被闲聊覆盖。",
    context: "高频失效域：新闻类。意图分类准确率是保障精准分流的核心。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-03",
    latencyMs: 231,
  }),
  vehicleIntentBadcase({
    id: "arb-017",
    input: "导航去最近的三甲医院急诊",
    actual: "如果身体不适请及时就医。",
    expected: "落域到导航/POI服务，查询最近三甲医院急诊并发起导航确认。",
    reason: "PK仲裁失效，应调用导航和POI查询工具但未调用；医疗咨询域抢占了可执行意图。",
    context: "同一类意图在不同场景中语义定义不同，人工规则难以区分。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-04",
    latencyMs: 246,
  }),
  vehicleIntentBadcase({
    id: "arb-018",
    input: "帮我搜一下附近的亲子餐厅，价格别太贵",
    actual: "亲子餐厅通常适合带孩子用餐。",
    expected: "落域到美食/POI搜索服务，调用附近搜索并带亲子、价格约束。",
    reason: "PK仲裁失效，应调用美食POI工具但未调用；智能体问答覆盖了服务落域。",
    context: "快速命中未覆盖时，LLM推理应输出意图标签，仲裁PK应下发到对应服务。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-04",
    latencyMs: 227,
  }),
  vehicleIntentBadcase({
    id: "arb-019",
    input: "播放我收藏里的白噪音",
    actual: "白噪音有助于放松。",
    expected: "落域到媒体播放服务，查询收藏列表并播放白噪音。",
    reason: "PK仲裁失效，应调用媒体播放工具但未调用；播放动作被非执行回答吞掉。",
    context: "仲裁PK执行成功率目标要求最终指令完成下发。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-05",
    latencyMs: 218,
  }),
  vehicleIntentBadcase({
    id: "arb-020",
    input: "帮我找附近有停车场的商场",
    actual: "很多商场都配有停车场。",
    expected: "落域到POI搜索服务，调用商场搜索并过滤停车场条件。",
    reason: "PK仲裁失效，应调用POI查询工具但未调用；查询类指令没有下发。",
    context: "PRD要求最终输出 Query+意图标签 给到下游，生成唯一匹配结果。",
    toolCalls: "[]",
    sessionId: "session-pk-miss-05",
    latencyMs: 239,
  }),
  vehicleIntentBadcase({
    id: "arb-021",
    input: "user: 帮我导航到环球港\nassistant: 已开始导航到环球港\nuser: 那附近有没有能停车的咖啡店？",
    actual: "请告诉我你想查询哪个地点附近的咖啡店。",
    expected: "承接上一轮目的地环球港，落域到POI搜索，查询附近可停车咖啡店。",
    reason: "跨域追问导致上一轮上下文丢失，未承接历史目的地。",
    context: "PRD痛点：跨域继承情况不支持，用户追问可能涉及跨域，导致PK规则失效。",
    toolCalls: "[]",
    sessionId: "session-context-loss-01",
    latencyMs: 260,
  }),
  vehicleIntentBadcase({
    id: "arb-022",
    input: "user: 播放儿童故事\nassistant: 正在播放儿童故事\nuser: 换成粉色小猪那个",
    actual: "你想换成什么内容？",
    expected: "承接上一轮节目播放场景，将“那个”解析为粉色小猪相关儿童节目并调用播放。",
    reason: "多轮上下文承接失败，指代解析失败，跨域追问没有继承媒体播放意图。",
    context: "PK仲裁失效的原因之一：同一类意图用户追问可能涉及跨域，规则直接失效。",
    toolCalls: "[]",
    sessionId: "session-context-loss-01",
    latencyMs: 272,
  }),
  vehicleIntentBadcase({
    id: "arb-023",
    input: "user: 空调调到24度\nassistant: 已将空调调到24度\nuser: 后排也一样",
    actual: "请问你想设置后排什么功能？",
    expected: "承接上一轮空调温度设置，把后排空调也设置到24度。",
    reason: "多轮上下文承接失败，上一轮动作和参数丢失。",
    context: "落域模块目标包含提升上下文能力，当前没有把历史状态注入仲裁决策。",
    toolCalls: "[]",
    sessionId: "session-context-loss-02",
    latencyMs: 198,
  }),
  vehicleIntentBadcase({
    id: "arb-024",
    input: "user: 查一下外滩附近的停车场\nassistant: 找到几个停车场\nuser: 选最近的那个带我去",
    actual: "你想去哪里？",
    expected: "承接上一轮POI候选，选择最近停车场并发起导航。",
    reason: "多轮上下文承接失败，候选列表和指代“那个”丢失。",
    context: "仲裁决策链条应记录候选服务和最终胜出者，当前跨轮候选没有保留。",
    toolCalls: "[]",
    sessionId: "session-context-loss-02",
    latencyMs: 264,
  }),
  vehicleIntentBadcase({
    id: "arb-025",
    input: "user: 帮我搜附近川菜馆\nassistant: 找到3家川菜馆\nuser: 第二家评分怎么样？",
    actual: "请告诉我餐厅名称。",
    expected: "承接上一轮搜索结果，查询第二家餐厅评分。",
    reason: "多轮上下文承接失败，上一轮POI列表未进入当前意图解析。",
    context: "高频POI搜索类在追问中需要支持跨域继承。",
    toolCalls: "[]",
    sessionId: "session-context-loss-03",
    latencyMs: 248,
  }),
  vehicleIntentBadcase({
    id: "arb-026",
    input: "user: 打开座椅通风\nassistant: 已打开主驾座椅通风\nuser: 副驾也打开",
    actual: "请问要打开副驾什么功能？",
    expected: "承接上一轮车控功能，将副驾座椅通风打开。",
    reason: "多轮上下文承接失败，历史车控服务和槽位没有继承。",
    context: "车控域功能多，追问中需要保留上一轮 service_id、service_type 与参数。",
    toolCalls: "[]",
    sessionId: "session-context-loss-03",
    latencyMs: 181,
  }),
  vehicleIntentBadcase({
    id: "arb-027",
    input: "user: 播放今天的财经新闻\nassistant: 正在播放财经新闻\nuser: 换成汽车相关的",
    actual: "汽车相关可以包含保养、车型、新闻等，你想了解哪类？",
    expected: "承接上一轮新闻播放场景，切换到汽车新闻并继续播报。",
    reason: "多轮上下文承接失败，跨域追问没有继承新闻类播放意图。",
    context: "PRD提到新闻类是PK仲裁失效高频域，追问跨域会让规则失效。",
    toolCalls: "[]",
    sessionId: "session-context-loss-04",
    latencyMs: 236,
  }),
  vehicleIntentBadcase({
    id: "arb-028",
    input: "user: 导航到公司\nassistant: 已为你规划到公司的路线\nuser: 避开高架重新走",
    actual: "请告诉我要避开哪条高架。",
    expected: "承接上一轮路线，重新规划到公司且设置避开高架。",
    reason: "多轮上下文承接失败，上一轮导航目标和路线约束丢失。",
    context: "上下文能力是PRD目标之一，当前仲裁没有继承上一轮目标。",
    toolCalls: "[]",
    sessionId: "session-context-loss-04",
    latencyMs: 244,
  }),
  vehicleIntentBadcase({
    id: "arb-029",
    input: "user: 帮我搜附近的加油站\nassistant: 已找到附近加油站\nuser: 有没有能洗车的？",
    actual: "请问你想找哪个城市的洗车店？",
    expected: "承接上一轮附近加油站结果，筛选带洗车服务的加油站。",
    reason: "多轮上下文承接失败，附近范围和加油站候选没有继承。",
    context: "POI搜索追问涉及跨域补充条件，需保留历史检索上下文。",
    toolCalls: "[]",
    sessionId: "session-context-loss-05",
    latencyMs: 252,
  }),
  vehicleIntentBadcase({
    id: "arb-030",
    input: "user: 打开香氛\nassistant: 已打开海洋香氛\nuser: 换淡一点",
    actual: "请告诉我你想调整什么淡一点。",
    expected: "承接上一轮香氛服务，降低当前香氛浓度。",
    reason: "多轮上下文承接失败，上一轮车控服务和程度修饰没有继承。",
    context: "车控域包含香氛；自然语义追问需要继承历史 service 和 slot。",
    toolCalls: "[]",
    sessionId: "session-context-loss-05",
    latencyMs: 176,
  }),
];

function cleanHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_./:-]+/g, "");
}

function toStringCell(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeRows(rows: RawEvidenceRow[]) {
  return rows.map((row) => (
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, toStringCell(value)]),
    ) as Record<string, string>
  )).filter((row) => Object.values(row).some((value) => value.trim()));
}

function findHeader(headers: string[], aliases: string[]) {
  const normalized = headers.map((header) => ({ raw: header, key: cleanHeader(header) }));
  const aliasSet = new Set(aliases.map(cleanHeader));
  const direct = normalized.find((header) => aliasSet.has(header.key));
  if (direct) return { header: direct.raw, confidence: 0.96 };

  const partial = normalized.find((header) => (
    [...aliasSet].some((alias) => alias.length > 3 && (header.key.includes(alias) || alias.includes(header.key)))
  ));
  if (partial) return { header: partial.raw, confidence: 0.72 };
  return null;
}

function resolveRoleHeader(raw: Record<string, string>, role: EvidenceRole, mapping: Record<EvidenceRole, string | undefined>) {
  const header = mapping[role];
  if (header && raw[header]) return { header, confidence: 0.96 };
  return findHeader(Object.keys(raw), ROLE_ALIASES[role]);
}

function getMappedCell(raw: Record<string, string>, role: EvidenceRole, mapping: Record<EvidenceRole, string | undefined>) {
  const match = resolveRoleHeader(raw, role, mapping);
  return match ? raw[match.header] || "" : "";
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "pass", "passed", "success", "1", "yes", "y", "通过", "成功"].includes(normalized)) return true;
  if (["false", "fail", "failed", "failure", "0", "no", "n", "未通过", "失败"].includes(normalized)) return false;
  return null;
}

function parseNumber(value: string): number | null {
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMessages(value: string): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const role = String((item as { role?: unknown; from?: unknown }).role ?? (item as { from?: unknown }).from ?? "user").toLowerCase();
          const content = String((item as { content?: unknown; value?: unknown }).content ?? (item as { value?: unknown }).value ?? "").trim();
          if (!content) return null;
          return {
            role: role.includes("assistant") || role.includes("gpt") ? "assistant" as const : role.includes("system") ? "system" as const : "user" as const,
            content,
          };
        })
        .filter((item): item is { role: "user" | "assistant" | "system"; content: string } => Boolean(item));
    }
  } catch {
    // Fall through to line parser.
  }

  return trimmed
    .split(/\n+/)
    .map((line) => {
      const match = line.match(/^\s*(user|assistant|system|human|gpt|用户|助手|系统)\s*[:：]\s*(.+)$/i);
      if (!match) return { role: "user" as const, content: line.trim() };
      const roleText = match[1].toLowerCase();
      return {
        role: roleText.includes("assistant") || roleText.includes("gpt") || roleText.includes("助手")
          ? "assistant" as const
          : roleText.includes("system") || roleText.includes("系统")
            ? "system" as const
            : "user" as const,
        content: match[2].trim(),
      };
    })
    .filter((turn) => turn.content);
}

function parseStringList(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => toStringCell(item)).filter(Boolean);
    }
  } catch {
    // Fall through to delimiter parser.
  }
  return trimmed.split(/\n|;|；|\|/).map((item) => item.trim()).filter(Boolean);
}

function detectDomain(raw: Record<string, string>) {
  const domainHeader = Object.keys(raw).find((key) => ["domain", "业务域", "场景", "category", "feature"].includes(cleanHeader(key)));
  return domainHeader ? raw[domainHeader] || "general" : "general";
}

export function inferEvidenceRoles(headers: string[]) {
  return ROLE_ORDER
    .map((role) => {
      const match = findHeader(headers, ROLE_ALIASES[role]);
      return match ? { role, header: match.header, confidence: match.confidence } : null;
    })
    .filter((item): item is { role: EvidenceRole; header: string; confidence: number } => Boolean(item));
}

function buildFieldMapping(mapping: Record<EvidenceRole, string | undefined>) {
  const fieldMapping: EvidenceFieldMapping = {};
  if (mapping.input) fieldMapping["interaction.input"] = mapping.input;
  if (mapping.actual) fieldMapping["interaction.actualOutput"] = mapping.actual;
  if (mapping.expected) fieldMapping["expectation.expectedOutput"] = mapping.expected;
  if (mapping.context) fieldMapping["context.retrievedContexts"] = mapping.context;
  if (mapping.tooling) fieldMapping["execution.toolsCalled"] = mapping.tooling;
  if (mapping.judgment) fieldMapping["judgments.0.reason"] = mapping.judgment;
  if (mapping.annotation) fieldMapping["annotation.failureNote"] = mapping.annotation;
  return fieldMapping;
}

function buildRowMapping(raw: Record<string, string>, mapping: Record<EvidenceRole, string | undefined>) {
  return Object.fromEntries(
    ROLE_ORDER.map((role) => [role, resolveRoleHeader(raw, role, mapping)?.header]),
  ) as Record<EvidenceRole, string | undefined>;
}

function buildRowConfidence(raw: Record<string, string>, mapping: Record<EvidenceRole, string | undefined>) {
  return Object.fromEntries(
    ROLE_ORDER
      .map((role) => {
        const match = resolveRoleHeader(raw, role, mapping);
        return match ? [role, match.confidence] as const : null;
      })
      .filter((item): item is readonly [EvidenceRole, number] => Boolean(item)),
  ) as RoleConfidence;
}

function calculateCompleteness(args: {
  input: string;
  actual: string;
  expected: string;
  judgmentText: string;
  annotationText: string;
}): EvidenceCompleteness {
  if (args.input && args.actual && (args.expected || args.judgmentText)) return "A";
  if (args.input && args.actual && (args.annotationText || args.judgmentText)) return "B";
  if (args.input || args.annotationText) return "C";
  return "D";
}

function isFailedCase(pass: boolean | null, score: number | null, judgmentText: string, annotationText: string) {
  if (pass === false) return true;
  if (score !== null && score < 0.5) return true;
  const text = `${judgmentText} ${annotationText}`.toLowerCase();
  return /失败|未通过|fail|incorrect|wrong|badcase|错误|遗漏|拒识|没有|不能/.test(text);
}

export function extractFailureSignals(caseItem: EvalEvidenceCase): FailureSignal[] {
  const text = [
    caseItem.interaction.input,
    caseItem.interaction.actualOutput,
    caseItem.expectation.expectedOutput,
    caseItem.context.retrievedContexts.join("\n"),
    caseItem.execution.toolsCalled.join("\n"),
    caseItem.judgments.map((judgment) => judgment.reason).join("\n"),
    caseItem.annotation.failureNote,
  ].join("\n").toLowerCase();

  const matches = (Object.entries(SIGNAL_CONFIG) as Array<[FailureSignal, typeof SIGNAL_CONFIG[FailureSignal]]>)
    .filter(([signal, config]) => signal !== "unknown_failure" && config.keywords.some((keyword) => text.includes(keyword.toLowerCase())))
    .map(([signal]) => signal);

  const unique = [...new Set(matches)];
  return unique.length > 0 ? unique.slice(0, 3) : ["unknown_failure"];
}

export function normalizeEvidenceRows(args: {
  taskId: string;
  sourceFile: string;
  rows: RawEvidenceRow[];
  extractionMode?: ExtractionMode;
}) {
  const rawRows = normalizeRows(args.rows);
  const headers = [...new Set(rawRows.flatMap((row) => Object.keys(row)))];
  const fieldRoles = inferEvidenceRoles(headers);
  const mapping = Object.fromEntries(fieldRoles.map((item) => [item.role, item.header])) as Record<EvidenceRole, string | undefined>;

  const cases = rawRows.map((raw, index) => {
    const rowMapping = buildRowMapping(raw, mapping);
    const roleConfidence = buildRowConfidence(raw, mapping);
    const fieldMapping = buildFieldMapping(rowMapping);
    const input = getMappedCell(raw, "input", rowMapping);
    const actual = getMappedCell(raw, "actual", rowMapping);
    const expected = getMappedCell(raw, "expected", rowMapping);
    const context = getMappedCell(raw, "context", rowMapping);
    const tooling = getMappedCell(raw, "tooling", rowMapping);
    const judgment = getMappedCell(raw, "judgment", rowMapping);
    const annotation = getMappedCell(raw, "annotation", rowMapping);
    const runtime = getMappedCell(raw, "runtime", rowMapping);
    const identity = getMappedCell(raw, "identity", rowMapping);
    const pass = parseBoolean(judgment);
    const score = pass === null ? parseNumber(judgment) : null;
    const failed = isFailedCase(pass, score, judgment, annotation);
    const messages = parseMessages(input);
    const lastUserMessage = [...messages].reverse().find((turn) => turn.role === "user")?.content;
    const completeness = calculateCompleteness({
      input: input || lastUserMessage || "",
      actual,
      expected,
      judgmentText: judgment,
      annotationText: annotation,
    });
    const confidenceValues = Object.values(roleConfidence).filter((value): value is number => typeof value === "number");
    const confidence = confidenceValues.length > 0
      ? Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(2))
      : 0.35;
    const traceHeader = Object.keys(raw).find((key) => cleanHeader(key) === "traceid");
    const sessionHeader = Object.keys(raw).find((key) => cleanHeader(key) === "sessionid");
    const modelHeader = Object.keys(raw).find((key) => cleanHeader(key) === "model" || cleanHeader(key) === "模型");
    const promptHeader = Object.keys(raw).find((key) => cleanHeader(key) === "promptversion" || cleanHeader(key) === "版本");
    const severityHeader = Object.keys(raw).find((key) => cleanHeader(key) === "severity");
    const latency = parseNumber(runtime || raw.latency_ms || raw.latency || "");

    const caseItem: EvalEvidenceCase = {
      id: `case_${String(index + 1).padStart(3, "0")}`,
      taskId: args.taskId,
      sourceCaseId: identity || `row_${index + 1}`,
      caseType: failed ? "eval_failure" : "eval_observation",
      interaction: {
        input: input || lastUserMessage || "",
        messages,
        actualOutput: actual,
      },
      expectation: {
        expectedOutput: expected,
        rubrics: parseStringList(raw.rubric || raw.rubrics || raw.tags || ""),
      },
      context: {
        retrievedContexts: parseStringList(context),
        memory: {},
      },
      execution: {
        model: modelHeader ? raw[modelHeader] : "",
        promptVersion: promptHeader ? raw[promptHeader] : "",
        toolsCalled: parseStringList(tooling),
        latencyMs: latency,
        tokenUsage: null,
        status: failed ? "failed" : "completed",
      },
      judgments: [{
        name: "source_judgment",
        pass,
        score,
        reason: judgment || annotation,
        source: judgment ? "eval" : annotation ? "human" : "rule",
      }],
      annotation: {
        failureNote: annotation || judgment,
        repairHint: "",
        severity: severityHeader && ["low", "medium", "high"].includes(raw[severityHeader])
          ? raw[severityHeader] as "low" | "medium" | "high"
          : failed ? "high" : "medium",
        tags: [],
      },
      metadata: {
        domain: detectDomain(raw),
        sourceFile: args.sourceFile,
      },
      provenance: {
        sourceRowId: String(index + 1),
        traceId: traceHeader ? raw[traceHeader] : "",
        sessionId: sessionHeader ? raw[sessionHeader] : "",
        sourceTextRange: null,
        extractionMode: args.extractionMode || "rule",
        fieldMapping,
        roleConfidence,
      },
      completeness,
      confidence,
      degraded: completeness === "C" || completeness === "D" || confidence < 0.6,
    };

    const signals = extractFailureSignals(caseItem);
    caseItem.annotation.tags = signals;
    caseItem.annotation.repairHint = SIGNAL_CONFIG[signals[0]].solution;
    return caseItem;
  });

  return {
    fieldRoles,
    cases,
    rawCount: rawRows.length,
  };
}

function getClusterSignal(caseItem: EvalEvidenceCase): FailureSignal {
  const signals = extractFailureSignals(caseItem);
  if (signals.includes("memory_missing")) return "memory_missing";
  if (signals.includes("tool_not_called")) return "tool_not_called";
  if (signals.includes("wrong_tool")) return "wrong_tool";
  if (signals.includes("format_error")) return "format_error";
  if (signals.includes("safety_boundary")) return "safety_boundary";
  if (signals.includes("constraint_missing")) return "constraint_missing";
  return signals[0] || "unknown_failure";
}

function strategyCount(caseCount: number, signal: FailureSignal) {
  const multiplier = signal === "memory_missing" || signal === "constraint_missing" ? 6 : 4;
  return Math.max(6, caseCount * multiplier);
}

export function clusterEvidenceCases(cases: EvalEvidenceCase[]): ProblemCluster[] {
  const failedCases = cases.filter((caseItem) => (
    caseItem.completeness !== "D" && isFailedCase(
      caseItem.judgments[0]?.pass ?? null,
      caseItem.judgments[0]?.score ?? null,
      caseItem.judgments.map((judgment) => judgment.reason).join(" "),
      caseItem.annotation.failureNote,
    )
  ));
  const grouped = failedCases.reduce<Record<FailureSignal, EvalEvidenceCase[]>>((acc, caseItem) => {
    const signal = getClusterSignal(caseItem);
    return {
      ...acc,
      [signal]: [...(acc[signal] || []), caseItem],
    };
  }, {} as Record<FailureSignal, EvalEvidenceCase[]>);

  return Object.entries(grouped)
    .sort((left, right) => right[1].length - left[1].length)
    .map(([signalKey, signalCases], index) => {
      const signal = signalKey as FailureSignal;
      const config = SIGNAL_CONFIG[signal];
      const confidence = Number((signalCases.reduce((sum, item) => sum + item.confidence, 0) / signalCases.length).toFixed(2));
      const count = strategyCount(signalCases.length, signal);
      return {
        id: `C${String(index + 1).padStart(2, "0")}`,
        name: config.name,
        caseCount: signalCases.length,
        representativeCaseIds: signalCases.slice(0, 3).map((item) => item.id),
        failureSignals: [...new Set(signalCases.flatMap((item) => extractFailureSignals(item)))].slice(0, 4),
        basis: {
          clusterMethod: "rule_bucket",
          primaryRoles: [
            "interaction.input",
            "interaction.actualOutput",
            "expectation.expectedOutput",
            "judgments.reason",
          ],
          slices: {
            domain: signalCases[0]?.metadata.domain || "general",
            scoreBucket: "failed",
          },
        },
        summary: config.summary,
        rootCauseHypothesis: config.hypothesis,
        recommendedStrategy: {
          assetType: config.assetType,
          count,
          schema: config.schema,
          strategyTemplate: config.strategyTemplate,
          solution: config.solution,
        },
        quality: {
          confidence,
          purity: signalCases.length >= 3 ? "high" : signalCases.length === 2 ? "medium" : "low",
          needsHumanReview: confidence < 0.8 || signalCases.length < 2,
        },
        status: "accepted",
        degraded: signalCases.some((item) => item.degraded),
      } satisfies ProblemCluster;
    });
}

export function summarizeEvidence(cases: EvalEvidenceCase[], clusters: ProblemCluster[]) {
  if (cases.length === 0) return "尚未识别到可用评测证据。";
  const topNames = clusters.slice(0, 3).map((cluster) => cluster.name);
  if (topNames.length === 0) {
    return `这是一个评测证据文件，共 ${cases.length} 条记录，当前缺少明确失败信号，需要补充 expected 或失败原因。`;
  }
  const domain = cases.find((item) => item.metadata.domain && item.metadata.domain !== "general")?.metadata.domain;
  return `这是一个${domain ? ` ${domain} ` : " "}评测结果，问题集中在${topNames.join("、")}。`;
}

export function createEvaluationSnapshotFromRows(args: {
  taskId: string;
  sourceFile: string;
  rows: RawEvidenceRow[];
  extractionMode?: ExtractionMode;
  now?: string;
}): EvaluationSnapshot {
  const normalized = normalizeEvidenceRows(args);
  const clusters = clusterEvidenceCases(normalized.cases);
  const completeness: Record<EvidenceCompleteness, number> = { A: 0, B: 0, C: 0, D: 0 };
  normalized.cases.forEach((caseItem) => {
    completeness[caseItem.completeness] += 1;
  });
  const failedCount = normalized.cases.filter((caseItem) => (
    isFailedCase(
      caseItem.judgments[0]?.pass ?? null,
      caseItem.judgments[0]?.score ?? null,
      caseItem.judgments.map((judgment) => judgment.reason).join(" "),
      caseItem.annotation.failureNote,
    )
  )).length;
  const suspectedCount = normalized.cases.filter((caseItem) => caseItem.completeness === "B" || caseItem.completeness === "C").length;
  const updatedAt = args.now || new Date().toISOString();

  return {
    taskId: args.taskId,
    sourceFile: args.sourceFile,
    parseStatus: "ready",
    oneSentenceConclusion: summarizeEvidence(normalized.cases, clusters),
    fieldRoles: normalized.fieldRoles,
    stats: {
      rawCount: normalized.rawCount,
      evidenceCount: normalized.cases.filter((caseItem) => caseItem.completeness !== "D").length,
      failedCount,
      suspectedCount,
      rejectedCount: normalized.cases.filter((caseItem) => caseItem.annotation.tags.includes("safety_boundary")).length,
      completeness,
      fieldRoleSuccessRate: Number((normalized.fieldRoles.length / ROLE_ORDER.length).toFixed(2)),
    },
    cases: normalized.cases,
    clusters,
    preview: null,
    package: null,
    updatedAt,
  };
}

export function createDemoEvaluationSnapshot(taskId: string, now?: string) {
  return createEvaluationSnapshotFromRows({
    taskId,
    sourceFile: "vehicle_intent_arbiter_badcases_prd0909.csv",
    rows: EVALUATION_DEMO_ROWS,
    extractionMode: "mock",
    now,
  });
}

export function setClusterStatus(snapshot: EvaluationSnapshot, clusterId: string, status: ClusterDecisionStatus): EvaluationSnapshot {
  return {
    ...snapshot,
    clusters: snapshot.clusters.map((cluster) => (
      cluster.id === clusterId ? { ...cluster, status } : cluster
    )),
    preview: null,
    package: null,
    updatedAt: new Date().toISOString(),
  };
}

export function updateClusterStrategy(
  snapshot: EvaluationSnapshot,
  clusterId: string,
  patch: Partial<ProblemCluster["recommendedStrategy"]>,
): EvaluationSnapshot {
  return {
    ...snapshot,
    clusters: snapshot.clusters.map((cluster) => (
      cluster.id === clusterId
        ? {
          ...cluster,
          recommendedStrategy: {
            ...cluster.recommendedStrategy,
            ...patch,
            count: patch.count === undefined
              ? cluster.recommendedStrategy.count
              : Math.max(0, Math.round(patch.count)),
          },
        }
        : cluster
    )),
    preview: null,
    package: null,
    updatedAt: new Date().toISOString(),
  };
}

function pickCasesForCluster(snapshot: EvaluationSnapshot, cluster: ProblemCluster) {
  const representative = new Set(cluster.representativeCaseIds);
  const byRepresentative = snapshot.cases.filter((caseItem) => representative.has(caseItem.id));
  if (byRepresentative.length > 0) return byRepresentative;
  return snapshot.cases.filter((caseItem) => extractFailureSignals(caseItem).some((signal) => cluster.failureSignals.includes(signal)));
}

function buildAssetRecord(args: {
  taskId: string;
  cluster: ProblemCluster;
  caseItem: EvalEvidenceCase;
  assetIndex: number;
  assetType: EvalAssetType;
}): EvalAssetRecord {
  const history = args.caseItem.interaction.messages
    .filter((turn): turn is { role: "user" | "assistant"; content: string } => turn.role !== "system");
  const baseInstruction = args.caseItem.interaction.input || args.caseItem.expectation.expectedOutput || args.caseItem.annotation.failureNote;
  const variant = getBatchExpansionVariant(args.assetIndex);
  const output = args.assetType === "negative_cases"
    ? args.caseItem.interaction.actualOutput || args.caseItem.annotation.failureNote
    : args.caseItem.expectation.expectedOutput || args.caseItem.annotation.repairHint || args.cluster.recommendedStrategy.solution;
  return {
    id: `${args.taskId}_${args.cluster.id}_${args.assetType}_${String(args.assetIndex + 1).padStart(3, "0")}`,
    clusterId: args.cluster.id,
    sourceCaseId: args.caseItem.id,
    assetType: args.assetType,
    expansion: {
      mode: "strategy_batch_expansion",
      generator: "batch_strategy_expander_v0",
      llmInference: false,
      strategyTemplate: args.cluster.recommendedStrategy.strategyTemplate,
      variant: variant.name,
      variantIndex: args.assetIndex % BATCH_EXPANSION_VARIANTS.length,
    },
    instruction: expandInstruction(baseInstruction, args.assetIndex),
    input: [
      args.caseItem.context.retrievedContexts.join("\n"),
      `根因假设：${args.cluster.rootCauseHypothesis}`,
      `修复方向：${args.cluster.recommendedStrategy.solution}`,
      `批量扩展策略：${variant.note}`,
    ].filter(Boolean).join("\n\n"),
    output,
    system: "你是需要稳定遵守上下文、工具边界和输出约束的 AI 助手。",
    history: history.length > 1 ? history : undefined,
    expected: args.caseItem.expectation.expectedOutput || undefined,
    tags: [args.cluster.id, ...args.cluster.failureSignals],
  };
}

export function buildEvalAssetPackage(snapshot: EvaluationSnapshot, options?: { preview?: boolean; now?: string }): EvalAssetPackage {
  const acceptedClusters = snapshot.clusters.filter((cluster) => cluster.status === "accepted" && cluster.recommendedStrategy.count > 0);
  const previewLimit = options?.preview ? 2 : Number.POSITIVE_INFINITY;
  const generatedAt = options?.now || new Date().toISOString();
  const evalCases: EvalAssetRecord[] = [];
  const trainingCandidates: EvalAssetRecord[] = [];
  const negativeCases: EvalAssetRecord[] = [];

  acceptedClusters.forEach((cluster) => {
    const sourceCases = pickCasesForCluster(snapshot, cluster);
    const targetCount = Math.min(cluster.recommendedStrategy.count, previewLimit);
    Array.from({ length: targetCount }).forEach((_, index) => {
      const sourceCase = sourceCases[index % sourceCases.length] || snapshot.cases[index % snapshot.cases.length];
      if (!sourceCase) return;
      const asset = buildAssetRecord({
        taskId: snapshot.taskId,
        cluster,
        caseItem: sourceCase,
        assetIndex: index,
        assetType: cluster.recommendedStrategy.assetType,
      });
      if (asset.assetType === "training_candidates") trainingCandidates.push(asset);
      if (asset.assetType === "eval_cases") evalCases.push(asset);
      if (asset.assetType === "negative_cases") negativeCases.push(asset);
    });
  });

  const provenance = [...evalCases, ...trainingCandidates, ...negativeCases].map((asset) => {
    const sourceCase = snapshot.cases.find((caseItem) => caseItem.id === asset.sourceCaseId);
    return {
      assetId: asset.id,
      sourceCaseId: asset.sourceCaseId,
      sourceRowId: sourceCase?.provenance.sourceRowId || "",
      problemCluster: asset.clusterId,
      assetType: asset.assetType,
      generatedAt,
    };
  });

  const qualityReport = {
    source_file: snapshot.sourceFile,
    raw_count: snapshot.stats.rawCount,
    evidence_count: snapshot.stats.evidenceCount,
    failed_count: snapshot.stats.failedCount,
    cluster_count: acceptedClusters.length,
    generation_mode: "strategy_batch_expansion",
    generator: "batch_strategy_expander_v0",
    llm_inference: false,
    expanded_asset_count: evalCases.length + trainingCandidates.length + negativeCases.length,
    field_role_success_rate: snapshot.stats.fieldRoleSuccessRate,
    accepted_clusters: acceptedClusters.map((cluster) => ({
      id: cluster.id,
      name: cluster.name,
      case_count: cluster.caseCount,
      asset_type: cluster.recommendedStrategy.assetType,
      count: cluster.recommendedStrategy.count,
    })),
  };

  return {
    taskId: snapshot.taskId,
    runId: `run_${Date.parse(generatedAt) || Date.now()}`,
    files: {
      "batch_expanded_assets.jsonl": evalCases.length + trainingCandidates.length + negativeCases.length,
      "eval_cases.jsonl": evalCases.length,
      "training_candidates.jsonl": trainingCandidates.length,
      "negative_cases.jsonl": negativeCases.length,
      "quality_report.json": 1,
      "provenance.json": provenance.length,
    },
    assets: {
      evalCases,
      trainingCandidates,
      negativeCases,
      qualityReport,
      provenance,
    },
  };
}

export function attachPreview(snapshot: EvaluationSnapshot, now?: string): EvaluationSnapshot {
  return {
    ...snapshot,
    preview: buildEvalAssetPackage(snapshot, { preview: true, now }),
    updatedAt: now || new Date().toISOString(),
  };
}

export function attachAssetPackage(snapshot: EvaluationSnapshot, now?: string): EvaluationSnapshot {
  return {
    ...snapshot,
    package: buildEvalAssetPackage(snapshot, { preview: false, now }),
    updatedAt: now || new Date().toISOString(),
  };
}

function toJsonl(records: unknown[]) {
  return records.length > 0 ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

export function serializeEvalAssetFile(assetPackage: EvalAssetPackage, fileName: string) {
  const allAssets = [
    ...assetPackage.assets.trainingCandidates,
    ...assetPackage.assets.evalCases,
    ...assetPackage.assets.negativeCases,
  ];

  switch (fileName) {
    case "batch_expanded_assets.jsonl":
      return toJsonl(allAssets.map((asset) => ({
        asset_type: asset.assetType,
        expansion: {
          mode: asset.expansion.mode,
          generator: asset.expansion.generator,
          llm_inference: asset.expansion.llmInference,
          strategy_template: asset.expansion.strategyTemplate,
          variant: asset.expansion.variant,
        },
        cluster_id: asset.clusterId,
        source_case_id: asset.sourceCaseId,
        system: asset.system,
        instruction: asset.instruction,
        input: asset.input,
        output: asset.output,
        ...(asset.expected ? { expected: asset.expected } : {}),
        ...(asset.history ? { history: asset.history } : {}),
        tags: asset.tags,
      })));
    case "eval_cases.jsonl":
      return toJsonl(assetPackage.assets.evalCases.map((asset) => ({
        id: asset.id,
        input: asset.instruction,
        expected_output: asset.expected || asset.output,
        tags: asset.tags,
      })));
    case "training_candidates.jsonl":
      return toJsonl(assetPackage.assets.trainingCandidates.map((asset) => ({
        system: asset.system,
        instruction: asset.instruction,
        input: asset.input,
        output: asset.output,
        ...(asset.history ? { history: asset.history } : {}),
      })));
    case "negative_cases.jsonl":
      return toJsonl(assetPackage.assets.negativeCases.map((asset) => ({
        input: asset.instruction,
        unsafe_output: asset.output,
        expected_behavior: asset.expected,
        tags: asset.tags,
      })));
    case "quality_report.json":
      return JSON.stringify(assetPackage.assets.qualityReport, null, 2);
    case "provenance.json":
      return JSON.stringify(assetPackage.assets.provenance, null, 2);
    default:
      throw new Error(`未知资产文件：${fileName}`);
  }
}

function parseJsonRows(text: string): RawEvidenceRow[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  if (parsed && typeof parsed === "object") {
    const data = (parsed as { data?: unknown; cases?: unknown; rows?: unknown }).data
      || (parsed as { cases?: unknown }).cases
      || (parsed as { rows?: unknown }).rows;
    if (Array.isArray(data)) return data.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }
  throw new Error("JSON 文件必须是数组，或包含 data/cases/rows 数组");
}

function parseDelimitedRows(text: string, delimiter: "," | "\t"): RawEvidenceRow[] {
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
      if (char === "\r" && next === "\n") index += 1;
      rows.push([...row, current]);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (current || row.length > 0) rows.push([...row, current]);

  const [headers = [], ...dataRows] = rows.filter((cells) => cells.some((cell) => cell.trim()));
  return dataRows.map((cells) => (
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? ""]))
  ));
}

function scoreEvalHeaders(headers: string[]) {
  const normalized = headers.map(cleanHeader);
  return ROLE_ORDER.reduce((score, role) => {
    const aliases = ROLE_ALIASES[role].map(cleanHeader);
    return aliases.some((alias) => normalized.includes(alias)) ? score + 1 : score;
  }, 0);
}

function worksheetToRows(worksheet: import("exceljs").Worksheet): { score: number; rows: RawEvidenceRow[] } {
  const maxHeaderRow = Math.min(worksheet.rowCount, 10);
  let best = {
    rowNumber: 1,
    headers: Array.from({ length: worksheet.columnCount }, (_, index) => worksheet.getRow(1).getCell(index + 1).text.trim()),
    score: 0,
  };

  for (let rowNumber = 1; rowNumber <= maxHeaderRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = Array.from({ length: worksheet.columnCount }, (_, index) => row.getCell(index + 1).text.trim());
    const score = scoreEvalHeaders(headers);
    if (score > best.score) best = { rowNumber, headers, score };
  }

  const rows: RawEvidenceRow[] = [];
  for (let rowNumber = best.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Object.fromEntries(
      best.headers.map((header, index) => [header, row.getCell(index + 1).text.trim()]),
    );
    if (Object.values(values).some(Boolean)) rows.push(values);
  }
  return { score: best.score, rows };
}

async function parseXlsxRows(buffer: ArrayBuffer): Promise<RawEvidenceRow[]> {
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

export async function parseEvaluationEvidenceFile(file: File): Promise<{
  sourceFile: string;
  rows: RawEvidenceRow[];
  headers: string[];
}> {
  const name = file.name.toLowerCase();
  let rows: RawEvidenceRow[] = [];
  if (name.endsWith(".json")) {
    rows = parseJsonRows(await file.text());
  } else if (name.endsWith(".csv") || name.endsWith(".tsv")) {
    rows = parseDelimitedRows(await file.text(), name.endsWith(".tsv") ? "\t" : ",");
  } else if (name.endsWith(".xlsx")) {
    rows = await parseXlsxRows(await file.arrayBuffer());
  } else {
    throw new Error("只支持 xlsx、csv、tsv、json 文件");
  }
  return {
    sourceFile: file.name,
    rows,
    headers: rows.length > 0 ? Object.keys(rows[0]) : [],
  };
}
