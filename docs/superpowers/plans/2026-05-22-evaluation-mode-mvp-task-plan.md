# CorpusFlow 评测模式 MVP 任务与方案

日期：2026-05-22

状态：M1 / M2 第一条纵向链路已落地，已完成 Opus 产品与算法外部评审，并补充公开 eval / badcase 聚类调研

关联文档：

- `docs/superpowers/specs/2026-05-21-复赛评测模式需求与里程碑.md`
- `docs/superpowers/specs/2026-05-21-evaluation-mode-prd.md`
- `docs/superpowers/prototypes/2026-05-21-evaluation-mode-wireframe-prototype.html`

外部调研参考：

- OpenAI Evals、DeepEval、Ragas、Promptfoo。
- Langfuse、LangSmith、Phoenix、MLflow GenAI。
- OpenTelemetry GenAI Semantic Conventions、OpenInference。
- Hamel Husain / Shreya Shankar 的 eval error analysis 实践。
- Reddit / X / Discord 公开讨论中关于 LLM eval 字段、schema 校验、error taxonomy 和指标收敛的经验。

## 1. 当前判断

复赛前的最高 POI 不是继续磨 HTML，也不是先把算法做复杂，而是把评测模式做成一个可运行的前后端闭环：

```text
上传失败证据
-> 解析并给出一句话结论
-> 生成根因假设与修复策略
-> 用户采纳 / 拒绝 / 编辑策略
-> 生成预览样例
-> 确认生成数据资产包
-> 下载并可在后续任务中继续调优
```

第一版本建议先完成前后端产品链路，算法以规则、样例数据、LLM 单点调用或 mock 形式接入。等状态机、数据对象和页面闭环稳定后，再替换为更强的 badcase 聚类、embedding、长文本 / 多轮抽取算法。

Opus 外部评审后，本方案增加两条收敛原则：

1. 复赛前必须保留任务持久化，但只做到“任务可恢复、状态不丢、可继续打开”。完整 `run/event` 版本记忆放到 P1。
2. 资产包按“核心真实产物”和“演示辅助产物”拆开。P0 必须让核心文件真实可用，辅助文件可以先结构化展示或占位。

## 2. 产品边界

### 2.1 它是什么

评测模式是一个 failure-to-dataset 工作流：

```text
把 badcase、评测失败表、用户反馈、trace 摘要
转成可复核、可追溯、可导出的回归评测与训练候选数据资产。
```

### 2.2 它不是什么

复赛版本不做：

- 完整 Eval Runner。
- LLM Judge。
- CI Gate。
- 训练平台。
- Langfuse / Phoenix / Opik adapter。
- CLI / SDK。
- 复杂 trace reconstruction。

这些可以作为复赛后的开源路线叙事，但不进入当前 MVP 主路径。

## 3. 与现有能力的关系

### 3.1 与批量任务的区别

批量任务的用户输入是明确的生成任务：

```text
我有一批 seed，希望按模板批量生成 QA / instruct / 多轮数据。
```

评测模式的用户输入是失败证据：

```text
我有一批 badcase / eval failure，不确定问题集中在哪，也不知道下一轮该补哪些数据。
```

因此，评测模式不能只是“批量生成换皮”。它必须多一个诊断与策略层：

```text
失败证据 -> 问题族 / 根因假设 -> 生产策略 -> 批量生成执行器
```

### 3.2 与精调生成的区别

精调生成面向单条或少量高价值样本，核心是把种子扩展成训练样本。

评测模式面向一组失败证据，核心是从失败分布抽象出下一轮数据生产任务。它输出的不是单一训练样本，而是一个资产包：

- `eval_cases.jsonl`
- `training_candidates.jsonl`
- `negative_cases.jsonl`
- `quality_report.json`
- `provenance.json`

P0 不要求五个文件都达到同等工程成熟度。第一版核心真实产物优先级是：

1. `training_candidates.jsonl` 或 `eval_cases.jsonl` 至少一个必须真实可下载、字段稳定、能说明用途。
2. `provenance.json` 必须能说明每条资产来自哪些 badcase / 根因 / 策略。
3. `negative_cases.jsonl`、`quality_report.json` 可先作为演示辅助产物，但 UI 数字不能与实际导出矛盾。

### 3.3 与算法服务的关系

算法服务不是第一阶段的前置阻塞项。第一阶段只要求接口稳定、结果结构稳定、演示链路稳定。

但 4.2 和 4.3 不能只停留在 JSON 对象。它们需要两个稳定算法抽象，P0 可以 mock / 规则 / 单点 LLM，P1 再增强内部实现：

```text
Normalizer
  raw row / raw snippet
  -> EvalEvidenceCase

Clusterer
  EvalEvidenceCase[]
  -> ProblemCluster[]
```

每个抽象内部都按同一原则实现：

```text
规则候选
-> LLM 增强
-> schema 校验
-> 可降级结果
```

复赛 P0 不建议先上 embedding。几十条到几百条 badcase 的演示量级下，规则预分桶 + LLM 归一化 / 命名更稳，也更容易解释。embedding、长文本 trace、多轮对话抽取放到 P1。

算法增强应作为第二阶段接入：

- embedding / 聚类。
- 长文本 badcase 抽取。
- Chat 多轮对话结构抽取。
- 根因命名与策略生成。
- 数据资产质量评估。

## 4. MVP 主路径

### 4.1 上传与解析

用户上传 CSV / XLSX / JSON 后，系统创建一个 `evaluation_task`，进入解析阶段。

解析完成后必须给一句话结论，不要写成长报告。示例：

```text
这是一个 chatbot 调优后的评测结果，问题集中在多轮上下文承接、工具调用边界和复合约束遗漏。
```

这句话的作用是让用户立刻知道系统读懂了文件，而不是只看见字段映射。

### 4.2 标准化 Evidence Case

这一层的目标不是要求用户按固定表格上传，而是识别“这份材料里哪些内容分别承担什么证据角色”，再统一转成 `EvalEvidenceCase`。算法抽象是：

```text
Normalizer(rawEvidence, taskContext) -> EvalEvidenceCase[]
```

外部 eval 工具的字段设计有明显共性：

- OpenAI Evals 以 `input` 为基础，按 eval template 增加 `ideal` 或其他 prompt 所需字段。
- DeepEval 的最小单元围绕 `input`、`actual_output`，再按指标补 `expected_output`、`context`、`retrieval_context`、`tools_called`、`expected_tools`、cost / time。
- Ragas 把单轮 RAG 样本抽象为 `user_input`、`response`、`retrieved_contexts`、`reference`、`rubric`；多轮样本则是消息序列、参考答案、参考工具调用和主题。
- Promptfoo 的输出强调 test variables、prompt、model output、pass / score、assertion result、reason、latency、token usage。
- Langfuse / Phoenix / MLflow / OpenTelemetry / OpenInference 更偏 trace 和 observability：trace / session / observation、input / output、score、comment、tool call、retrieval、token、latency、metadata。

这些字段名称不同，但可以抽象为 9 类证据角色：

| 角色 | 含义 | 常见原始字段 |
| --- | --- | --- |
| `identity` | 样本、任务、运行、版本身份 | id, eval_id, run_id, trace_id, session_id, version |
| `input` | 用户请求、prompt 变量、消息历史 | input, user_input, prompt, question, messages, history |
| `actual` | 模型或系统真实输出 | actual_output, output, response, completion, answer |
| `expected` | 期望输出或参考答案 | expected_output, ideal, reference, ground_truth, expectations |
| `context` | 检索、引用、记忆、业务上下文 | context, retrieved_contexts, reference_contexts, documents, memory |
| `tooling` | 工具调用和外部动作 | tools_called, expected_tools, tool_calls, tool_results, action |
| `judgment` | 评测结果和理由 | pass, success, score, label, gradingResult, reason, comment |
| `runtime` | 运行成本和错误 | latency, token_usage, cost, model, prompt_version, error |
| `annotation` | 人工反馈和修复线索 | feedback, failure_note, repair_hint, severity, tags |

P0 的处理链路：

```text
文件形态识别
-> 字段角色候选识别
-> 候选 case 抽取
-> 证据完整度评估
-> LLM 归一化为 Evidence Case
-> schema 校验与降级
```

规则层先给出可解释候选：

- 哪些列或文本片段像输入、实际输出、期望输出。
- 哪些像检索上下文、工具调用、评测分数、人工反馈。
- 是否存在 passed / failed、score、reason、latency、token、model、prompt version。
- 原始行号、文件名、文本位置、trace / session / span id。

LLM 层只做归一化与补齐，不直接改写事实。输入是单条候选 case 和原始行，输出必须是结构化 JSON。不要让模型一次处理整份文件并自由发挥，否则失败时无法定位，也无法稳定重试。

解析结果统一转成 `EvalEvidenceCase`。前端可以展示简化视图，但内部结构不能被 `input / expected / actual / failureNote` 四字段绑死：

```json
{
  "id": "case_001",
  "taskId": "eval_task_001",
  "sourceCaseId": "row_12",
  "caseType": "chatbot_eval_failure",
  "interaction": {
    "input": "那附近有没有快充？",
    "messages": [
      {"role": "user", "content": "导航去环球港"},
      {"role": "assistant", "content": "已为你规划路线"},
      {"role": "user", "content": "那附近有没有快充？"}
    ],
    "actualOutput": "请告诉我你的目的地"
  },
  "expectation": {
    "expectedOutput": "继承上一轮目的地并查询附近快充",
    "rubrics": ["多轮承接", "地点指代", "工具查询"]
  },
  "context": {
    "retrievedContexts": [],
    "memory": {"destination": "环球港"}
  },
  "execution": {
    "model": "demo-model",
    "promptVersion": "route-agent-v3",
    "toolsCalled": [],
    "latencyMs": 1840,
    "tokenUsage": {"input": 512, "output": 48},
    "status": "completed"
  },
  "judgments": [
    {
      "name": "context_retention",
      "pass": false,
      "score": 0,
      "reason": "上一轮目的地没有被继承",
      "source": "human"
    }
  ],
  "annotation": {
    "failureNote": "上一轮目的地丢失",
    "repairHint": "补充带地点指代的多轮样本",
    "severity": "high",
    "tags": ["multiturn", "memory"]
  },
  "metadata": {
    "domain": "vehicle_agent",
    "sourceFile": "vehicle_agent_badcases_finals.csv"
  },
  "provenance": {
    "sourceRowId": "12",
    "traceId": "trace_demo_12",
    "sessionId": "session_demo_02",
    "sourceTextRange": null,
    "extractionMode": "llm",
    "fieldMapping": {
      "interaction.input": "用户输入",
      "interaction.actualOutput": "模型输出",
      "expectation.expectedOutput": "预期行为",
      "judgments.0.reason": "失败原因"
    },
    "roleConfidence": {
      "input": 0.96,
      "actual": 0.93,
      "expected": 0.82,
      "judgment": 0.88
    }
  },
  "completeness": "A",
  "confidence": 0.86,
  "degraded": false
}
```

证据完整度按能力表达，不按“合不合格”表达：

| 等级 | 能力边界 |
| --- | --- |
| A | 有 input、actual、expected / judgment，可进入根因诊断和数据生产 |
| B | 有 input、actual、部分 judgment，可做弱诊断，需要人工确认 expected |
| C | 只有 input / 场景 / 反馈，可整理成生产任务，但不能确认真实失败 |
| D | 缺关键证据，只生成补证据建议，不进入根因诊断 |

P0 允许字段不完美，但必须保留原始行与推断字段的 provenance，避免用户无法追溯。`extractionMode` 只能是 `rule`、`llm` 或 `mock`，用于区分真实算法产物和演示 fixture。

Normalizer 的验收不是“字段都填满”，而是：

```text
任意输入材料
-> 能识别证据角色
-> 能说明哪些字段可靠、哪些字段缺失
-> 能把下游根因诊断需要的最小证据抽出来
-> 不因为字段名不同而失败
```

降级规则：

- LLM 超时或返回非法 JSON 时，直接使用规则候选生成 Evidence Case。
- `confidence` 降到低置信区间，并标记 `degraded: true`。
- UI 不报技术错误，只提示“部分字段由规则推断，建议人工确认”。
- 不足以诊断的 case 仍保留，但标记完整度，后续只参与整理或补证据，不进入强根因判断。

### 4.3 根因诊断

这一层的目标是把一组 Evidence Case 变成可让用户判断的“问题族假设”和“数据生产策略”。算法抽象是：

```text
Clusterer(EvalEvidenceCase[], taskContext, taskMemory) -> ProblemCluster[]
```

调研后的核心判断：bad case 聚类不是先考模型“能不能猜根因”，而是先做 error analysis。最佳实践更接近：

```text
读真实失败
-> 标注失败信号
-> 形成 failure taxonomy
-> 聚合重复模式
-> 量化分布
-> 人工确认
-> 把稳定问题族转成 evaluator / regression set / training data
```

公开实践里反复出现的经验：

- 不要先设计一堆通用指标。先从真实 trace / badcase 里做 error analysis，让失败分类从数据中长出来。
- 不要用一个大分数解释所有问题。更稳定的做法是拆成若干 failure-mode detectors，例如“错工具”“漏上下文”“幻觉”“格式错误”“拒识过度”。
- 指标和标签要少而互斥，避免十几个相互重叠的维度同时出现，导致用户无法判断优先级。
- 聚类是组织证据，不是判定真理。UMAP / 热力图适合帮助用户看分布，但不能作为 case 归属的唯一依据。
- LLM 适合做摘要、命名、候选标签和策略建议；分类归属、数量统计、导出数量必须由系统计算。

P0 的处理链路：

```text
筛选失败证据
-> 为每个 Evidence Case 抽取 failure signals
-> 按确定性字段做初始切片
-> 每个切片内做轻量合并 / 去重
-> LLM 基于代表 case 命名和解释
-> 用户 merge / split / accept / reject
-> 生成数据生产策略
```

P1 的处理链路：

```text
role-aware case text
-> embedding
-> HDBSCAN / 层次聚类
-> UMAP 只做可视化
-> LLM cluster summarization
-> 人工确认 taxonomy
-> 跨 run 对比 failure distribution
```

用于聚类的特征不能只取 `input`。应构造 role-aware case text，并保留结构化特征：

```text
用户输入 + 实际输出 + 期望/参考 + 失败理由
+ 检索上下文摘要
+ 工具调用差异
+ score / pass / assertion reason
+ domain / feature / model / prompt version
```

规则预分桶优先使用确定性信号：

- `caseType`。
- domain / category / feature。
- passed / failed / score bucket。
- `judgments[].reason` 和 `annotation.failureNote`。
- expected / actual 差异摘要。
- retrieval / tool / memory / safety / format 等 failure signal。
- model / prompt version / trace source，用于发现版本相关问题。

P0 不让 LLM 决定 `caseCount`，也不让 LLM 直接决定有哪些 case 属于某个 cluster。`caseCount`、`representativeCaseIds`、资产包数量都由系统从 cases 数组派生，避免模型编数字。

LLM 层只负责三件事：

- 给候选问题族命名。
- 总结共性失败模式和根因假设。
- 从策略模板中选择或轻度填充生产策略。

系统基于 Evidence Case 生成 `ProblemCluster`：

```json
{
  "id": "C02",
  "name": "多轮上下文承接失败",
  "caseCount": 8,
  "representativeCaseIds": ["case_001", "case_014", "case_022"],
  "failureSignals": ["memory_missing", "coreference_failed", "tool_not_called"],
  "basis": {
    "clusterMethod": "rule_bucket_llm_label",
    "primaryRoles": ["interaction.messages", "interaction.actualOutput", "expectation.expectedOutput", "judgments.reason"],
    "slices": {
      "domain": "vehicle_agent",
      "feature": "route_planning",
      "scoreBucket": "failed"
    }
  },
  "summary": "没有继承上一轮目的地、车辆状态或用户偏好。",
  "rootCauseHypothesis": "缺少 history + current query 长上下文样本。",
  "recommendedStrategy": {
    "assetType": "training_candidates",
    "count": 44,
    "schema": "sharegpt_history",
    "strategyTemplate": "multiturn_context_repair"
  },
  "quality": {
    "confidence": 0.78,
    "purity": "medium",
    "needsHumanReview": true
  },
  "status": "accepted",
  "degraded": false
}
```

产品文案只说“根因假设”，不说“真实根因已确定”。

聚类验收标准：

- 每个 cluster 能打开代表 badcase，用户能验证系统为什么这么分。
- 每个 cluster 有明确下游动作：生成训练数据、生成回归 eval、补证据、暂不处理。
- 大 cluster 要能 split，小 cluster / outlier 要能保留为长尾，不强行并入。
- 跨 run 时优先看 failure distribution 是否变化，而不是只看总分。
- map / heatmap 只表达分布和密度，不承担真实诊断结论。

降级规则：

- LLM 命名失败时，使用规则桶名称，如“多轮相关失败”“工具调用相关失败”。
- LLM 策略生成失败时，使用固定策略模板，不阻断预览和导出。
- 低置信 cluster 可以展示，但默认不自动纳入生产任务，等待用户采纳。
- 无法形成稳定问题族时，不强行聚类，输出“补证据 / 人工标注优先”的建议。

### 4.4 人工 loop

用户可以对每个根因执行：

- 采纳。
- 拒绝。
- 编辑生产策略。
- 查看关联 badcase。

拒绝不删除根因卡，只改变下游生产任务。编辑不做自由文本大段改写，只编辑以下四类结构化参数：

- 解法抽象。
- 产物类型。
- 生成数量。
- 字段 / schema 模板。

### 4.5 生成预览

用户点击生成预览后，系统基于当前采纳状态和策略生成少量样例。

预览必须回答三件事：

- 这批数据来自哪些根因。
- 会生成什么文件。
- 样例字段是否符合下游使用。

用户确认后才进入资产包生成。

### 4.6 资产包生成

资产包由当前任务的根因状态和策略决定：

```json
{
  "taskId": "eval_task_001",
  "runId": "run_003",
  "files": {
    "eval_cases.jsonl": 56,
    "training_candidates.jsonl": 84,
    "negative_cases.jsonl": 20,
    "quality_report.json": 1,
    "provenance.json": 1
  }
}
```

第一版可以不做真实 zip，但 UI 和 API 要按资产包心智组织。

P0 资产包不追求文件数量多，优先保证一条核心产物链路真实：

```text
采纳的根因策略
-> 生成样例
-> 进入 eval_cases.jsonl 或 training_candidates.jsonl
-> provenance.json 记录来源
-> 下载内容与 UI 数字一致
```

## 5. 可继续调优

这是评测模式的关键能力。用户不是一次性上传、一次性生成，而是会反复调优同一个产品或同一个模型版本。

### 5.1 任务持久化

P0 先实现最小持久化：

```text
evaluation_task
  - id
  - name
  - source_file
  - parse_status
  - one_sentence_conclusion
  - latest_snapshot
  - created_at
  - updated_at
```

`latest_snapshot` 保存当前 Evidence Case、根因状态、生产策略、预览结果和资产包摘要。它的目标不是完美审计，而是确保刷新页面、重新打开任务、继续演示时状态不丢。

P1 再扩展为完整版本记忆：

```text
evaluation_task
  - id
  - name
  - source_file
  - parse_status
  - one_sentence_conclusion
  - created_at
  - updated_at

evaluation_run
  - id
  - task_id
  - version
  - input_snapshot
  - cluster_snapshot
  - decision_snapshot
  - strategy_snapshot
  - asset_package_snapshot
  - created_at

evaluation_event
  - id
  - task_id
  - run_id
  - actor
  - event_type
  - payload
  - created_at
```

### 5.2 继续调优入口

用户从历史任务进入时，系统应展示：

- 上次的一句话结论。
- 上次根因分布。
- 上次采纳 / 拒绝状态。
- 上次生成资产包。
- 本轮新增失败证据与上轮的差异。

### 5.3 记忆边界

“记忆”不是无限聊天上下文，而是任务级结构化记忆：

- 记住用户曾经采纳 / 拒绝哪些根因。
- 记住生成数量和 schema 偏好。
- 记住业务背景补充。
- 记住每轮资产包与来源。

后续算法可以引用这些记忆做策略建议。P0 只需要先保证最近一次任务状态可恢复；P1 再做跨 run 对比和差异建议。

## 6. 前后端任务拆解

### 6.1 前端 P0

1. 新增评测模式路由或入口。
2. 将当前 HTML 原型迁移为 React 页面。
3. 实现左侧操作区：
   - 上传 / 使用复赛样例。
   - 解析状态。
   - 方案调整指令。
   - 数据生产任务。
   - 预览与确认生成。
4. 实现右侧根因诊断：
   - 一句话结论。
   - badcase 分布图。
   - 根因卡列表。
   - cases drawer。
   - 采纳 / 拒绝 / 编辑。
   - 底部分页。
5. 实现预览弹窗和资产包确认弹窗。
6. 接入 mock API，保证无算法服务也能完成主演示。

### 6.2 后端 P0

1. 新增 `evaluation_task` 创建接口。
2. 新增文件上传 / 复赛样例载入接口。
3. 新增解析结果接口：
   - 字段映射。
   - Evidence Case。
   - 一句话结论。
4. 新增根因诊断结果接口。
5. 新增根因决策接口：
   - accept。
   - reject。
   - update_strategy。
6. 新增预览生成接口。
7. 新增资产包生成与下载接口。
8. P0 持久化 `evaluation_task.latest_snapshot`，保证任务刷新和重新打开不丢状态。
9. P1 再补 `evaluation_run` / `evaluation_event`，支持多轮版本记忆。

### 6.3 算法 P0 / P1

P0 不追求复杂模型效果，但必须把算法接口定下来。后端和前端只依赖契约，不依赖算法内部实现。

P0 算法任务：

1. `infer_evidence_roles`：把原始列名 / trace 字段 / 文本片段映射到 9 类证据角色。
2. `normalize_evidence_cases`：规则候选 + 可选 LLM 归一化，输出 `EvalEvidenceCase[]`。
3. `summarize_evidence`：基于 Evidence Case 输出一句话结论。
4. `extract_failure_signals`：从 judgment / annotation / expected-actual diff / tool / retrieval 中抽取 failure signals。
5. `cluster_evidence_cases`：确定性切片 + 可选 LLM 命名，输出 `ProblemCluster[]`。
6. `select_asset_strategy`：基于 cluster 和策略模板输出生产策略。
7. `validate_algorithm_output`：JSON schema 校验、角色置信度、完整度、降级标记。
8. `replay_golden_cases`：5-10 条金标准回放集，改 prompt 或规则后跑一遍。

P1 算法任务：

1. `parse_long_trace`：从长文本 / trace / 工单中抽取多条候选 case。
2. `extract_multiturn_context`：Chat 多轮对话结构抽取。
3. `cluster_badcases_semantic`：role-aware embedding / HDBSCAN / 层次聚类。
4. `maintain_failure_taxonomy`：跨 run 维护可合并、可拆分的问题族 taxonomy。
5. `derive_root_cause_hypotheses`：结合跨 run 记忆生成更稳定根因假设。
6. `generate_dataset_assets`：生成 eval / train / negative 数据。
7. `score_asset_quality`：质量报告与风险提示。

P1 算法替换时，必须保持 P0 数据契约不变。允许替换 Normalizer / Clusterer 内部实现，不允许破坏 `EvalEvidenceCase`、`ProblemCluster`、`EvalAssetPackage` 的字段语义。

## 7. 里程碑

### M1：契约与 mock 闭环

目标：不依赖算法服务，前后端能跑完整任务状态。

交付：

- `evaluation_task` 数据结构。
- `latest_snapshot` 状态快照。
- mock 复赛样例。
- 解析结论。
- `Normalizer` mock / 规则实现。
- `Clusterer` mock / 规则实现。
- 9 类证据角色映射。
- failure signals 抽取。
- 根因诊断 mock。
- 根因决策状态。
- 预览与资产包 mock。

验收：

- 从上传到下载可以完整走完。
- 刷新页面后任务状态不丢。
- 拒绝 / 采纳能影响资产包数字。
- `caseCount`、预览数量、下载数量三处一致。
- 换列名、换字段顺序、从 trace 导入时不破坏主链路。

### M2：React 工作台落地

目标：把 HTML 原型迁移到真实 React 页面。

交付：

- 左侧操作区。
- 右侧根因诊断。
- badcase map。
- drawer / modal。
- 任务进度与下载状态。

验收：

- 演示主路径少于 4 个动作。
- 页面与现有批量任务交互心智一致。
- 复赛样例稳定可演示。

### M3：后端持久化与导出

目标：让任务从“最近状态可恢复”升级为“多轮版本可追溯”。

交付：

- `evaluation_run` 持久化。
- `evaluation_event` 持久化。
- 历史任务列表。
- 继续调优入口。
- 资产包导出。

验收：

- 用户能打开上一轮任务继续调整。
- 能看到上轮结论、上轮策略、上轮资产包。
- 下载文件内容和 UI 数字一致。

### M4：算法增强

目标：用真实算法逐步替换 mock，不破坏前端和后端契约。

交付：

- `Normalizer`：异构材料到 Evidence Case。
- `Clusterer`：Evidence Case 到 ProblemCluster。
- 一句话结论。
- 证据角色识别和 failure taxonomy。
- 根因假设与策略模板选择。
- 长文本 / 多轮样例抽取。
- 资产生成质量报告。

验收：

- 算法失败时能回退到规则结果或复赛样例。
- 算法结果结构与 mock 契约一致。
- 长文本和多轮样例至少覆盖一个稳定场景。
- 金标准回放集通过人工抽查，无明显字段错位、数字错位和策略错配。

### M5：复赛材料

目标：准备 PPT 和现场演示证据。

交付：

- 演示脚本。
- 截图。
- 录屏。
- 质量报告样例。
- Render + Cloudflare 链路说明。
- 大事业叙事一页。

验收：

- 10 分钟内能讲清输入、诊断、生产、导出。
- 现场网络失败时有兜底路径。

## 8. 风险与对策

| 风险 | 表现 | 对策 |
| --- | --- | --- |
| 评测模式变成批量生成换皮 | 只有生成，没有诊断和策略 | 必须保留一句话结论、根因假设、生产策略 |
| 继续调优做不起来 | 刷新或下轮任务丢上下文 | P0 做 latest_snapshot，P1 做 run/event |
| 算法拖慢第一版 | 聚类和抽取不稳定 | P0 用 mock / 规则，P1 替换算法 |
| 证据角色抽象失败 | 换字段名、换工具导出格式就无法识别 | 先映射 9 类证据角色，再归一化 Evidence Case |
| LLM 一把梭不可控 | 字段错位、根因乱编、失败无法定位 | Normalizer / Clusterer 拆开，强制 schema 输出 |
| LLM 编数字 | cluster 数量、资产包数量和 UI 不一致 | 数字全部由系统从 cases / assets 派生 |
| 聚类被误当真实根因 | 用户以为系统已经证明根因 | 文案只说根因假设，case drawer 必须展示证据 |
| embedding 过早引入 | 部署复杂、少量样本聚类抖动 | P0 规则预分桶，P1 再接 semantic cluster |
| 生成资产不可解释 | 用户不知道数据从哪来 | `provenance.json` 必须进入资产包 |
| 编辑策略过度自由 | 用户变成手写 prompt | 编辑只允许结构化参数 |
| 复赛现场不稳 | 网络、模型、冷启动失败 | 内置样例与预生成资产包兜底 |
| 双用户耦合 | 评委要看懂，工程师要能用，范围被拉大 | 复赛优先评委可理解链路，工程能力只保关键闭环 |

## 9. 下一步建议

当前最合适的执行顺序：

1. 定 9 类证据角色和 `EvalEvidenceCase / ProblemCluster / EvalAssetPackage` P0 契约。
2. 定 `Normalizer / Clusterer` 接口、角色置信度、完整度和降级字段。
3. 做复赛样例和 5-10 条金标准回放集，覆盖表格、trace、多轮、工具调用、人工反馈。
4. 用 mock 数据把 React 页面接起来。
5. 做任务恢复和最近状态继续调优。
6. 准备 PPT / 录屏 / 部署兜底。
7. 接入最小算法接口。
8. 复赛后补 `run/event` 版本记忆、failure taxonomy 演进和更强算法。

不要先投入复杂算法，也不要继续扩 UI。第一版要证明的是：

```text
失败证据真的能在 CorpusFlow 里变成可复核、可继续调优、可导出的数据资产。
```

## 10. Opus 外部评审

本方案已通过 `opus-review-gate` 调用 Opus 做产品决策评审和 4.2 / 4.3 算法方案评审。评审结论摘要：

- 方向成立，failure-to-dataset 的定位确实补上批量任务和精调之间缺失的“诊断与策略层”。
- 先做前后端闭环、算法后置是合理路径；当前最大风险不是算法不够强，而是 MVP 范围仍偏大。
- 文档把“复赛评委看懂”和“工程师长期可用”两个用户目标压在一起，容易做成两边都不够。复赛前应优先保证评委能看懂输入、诊断、生产、导出这条链路。
- “一句话结论”是好设计，但不能把它当自证指标。应让非开发者看完后能在 30 秒内复述这批失败集中在哪。
- “继续调优”是关键方向，但复赛前不一定要完整 `task/run/event` 审计。P0 做最近任务状态可恢复，P1 再做多轮版本记忆。
- 资产包五个文件会显得专业，但 P0 不应平均用力。先保证一个核心数据文件和 `provenance.json` 真实可用，其余文件可作为演示辅助。
- 4.2 / 4.3 的算法抽象应收敛成 `Normalizer` 和 `Clusterer`，而不是把感知、聚类、命名、策略生成都交给一次 LLM 调用。
- 复赛 P0 不建议先上 embedding；少量 badcase 用规则预分桶 + LLM 命名更稳，embedding 放到 P1。
- LLM 在 P0 的角色是归一化、命名和策略模板填充，不应承诺“真实根因决策泛化”。
- `caseCount`、代表 case、资产包数量不能由 LLM 生成，必须由系统从结构化数据派生。

我的取舍：

- 采纳“范围收敛”建议：P0 改为 `evaluation_task.latest_snapshot`，完整 `run/event` 后移。
- 保留“可继续调优”作为产品关键，但 P0 验收只要求最近任务恢复，不要求跨轮差异分析。
- 保留资产包心智，但明确核心真实产物优先，避免为了凑文件数量拖慢主链路。
- 采纳算法抽象建议：文档新增 `Normalizer / Clusterer`，P0 规则候选 + LLM 增强 + schema 校验 + 降级，P1 再接 embedding、长文本和多轮抽取。
- 收敛 LLM 叙事：P0 不说模型能判断真实根因，只说系统给出可复核的根因假设和生产策略。
- 不采纳“只做 PPT 演示”的隐含路径。即使复赛优先评委，前后端闭环仍必须真实可跑，否则产品理由会被问穿。

## 11. 外部调研依据

本轮调研只采用公开可访问资料。GitHub、X、Reddit 和 Discord 的公开内容可以用于观察社区共识，但私域 Discord 消息不可检索，因此不伪装成已覆盖私域讨论。

### 11.1 Eval 字段共性

- OpenAI Evals：JSONL 中每个对象是一条 eval 数据；模板都期望 `input`，基础 eval 使用 `ideal`，model-graded eval 按 prompt 需要扩展字段。参考：`https://github.com/openai/evals/blob/main/docs/build-eval.md`
- DeepEval：`LLMTestCase` 围绕 `input`、`actual_output`，并按指标使用 `expected_output`、`context`、`retrieval_context`、`tools_called`、`expected_tools`、`token_cost`、`completion_time`。参考：`https://deepeval.com/docs/evaluation-test-cases`
- Ragas：单轮样本包含 `user_input`、`response`、`retrieved_contexts`、`reference`、`rubric`；多轮样本包含消息序列、参考答案、参考工具调用和主题。参考：`https://docs.ragas.io/en/v0.2.10/references/evaluation_schema/`
- Promptfoo：结果导出包含 test variables、prompt、model output、pass / score、`gradingResult`、assertion component results、reason、latency、token usage。参考：`https://www.promptfoo.dev/docs/configuration/outputs/`
- Langfuse：score 是统一评价对象，包含 name、value、dataType、source、comment，并能关联 trace、observation、session、dataset run。参考：`https://langfuse.com/docs/evaluation/scores/data-model`
- MLflow GenAI：scorer 接收 `inputs`、`outputs`、`expectations`、`trace`、`session`，覆盖单轮和会话级评测。参考：`https://mlflow.org/docs/latest/api_reference/python_api/mlflow.genai.html`
- OpenTelemetry / OpenInference：LLM observability 需要表达 messages、tool calls、token usage、retriever、reranker、tool、agent、evaluator 等语义对象。参考：`https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/`、`https://arize-ai.github.io/openinference/spec/semantic_conventions.html`

### 11.2 Bad Case 聚类经验

- Langfuse error analysis：先读真实 traces，用开放编码形成应用自己的 failure taxonomy，再把类别转成 evaluator / dataset / experiment。参考：`https://langfuse.com/academy/monitoring/error-analysis`
- Hamel Husain：先做 error analysis，再写 tests；理解真实 failure modes 后再用 synthetic data 扩展覆盖。参考：`https://hamel.dev/notes/llm/officehours/erroranalysis.html`
- Phoenix embedding analysis：embedding cluster 和 UMAP 适合发现 drift、低性能区域和分布结构，但 cluster 需要能点开看原始样本。参考：`https://arizeai-433a7140.mintlify.app/docs/phoenix/cookbook/retrieval-and-inferences/embeddings-analysis`
- OpenAI embeddings：embedding 可用于 classification、clustering、topic modeling、semantic search，但只是语义特征，不替代人工确认。参考：`https://openai.com/index/introducing-text-and-code-embeddings/`
- Reddit 公开讨论的共识：schema 校验应先于 scoring；复杂 eval 更适合拆成 failure-mode detectors，而不是压成单一总分；LLM judge 适合 first pass，关键场景仍需 human review 和 rule-based checks。参考：`https://www.reddit.com/r/LLMDevs/comments/1pikyo2/anyone_here_wrap_evals_with_a_strict_json_schema/`、`https://www.reddit.com/r/LLMDevs/comments/1pik8tg/whats_the_most_difficult_eval_youve_built/`
- X 公开讨论中也能看到 criteria drift 这个问题：用户需要标准来评价输出，但评价 bad / good 输出本身又会反过来改变标准。参考：`https://x.com/sh_reya/status/1782425962246033436`
- Discord 工程博客的指标经验：指标越多，误报和解释成本越高；应保留少量高质量、互相区分的指标。这个原则用于约束 failure signal / cluster label 数量。参考：`https://discord.com/blog/measure-less-to-learn-more-using-fewer-higher-quality-metrics-to-capture-what-matters`

## 12. 开发检查点 1

日期：2026-05-22

已完成：

- 评测模式 React 入口与工作台：`首页 -> 评测增强 -> 使用复赛样例 / 上传证据 -> 根因诊断 -> 预览 -> 生成资产包 -> 下载文件`。
- 前端两栏心智：左侧操作区承载导入、方案调整、生产任务、预览与下载；右侧承载一句话结论、badcase 分布、根因聚合、case drawer 和策略编辑。
- P0 数据契约：`EvalEvidenceCase`、`ProblemCluster`、`EvalAssetPackage`。
- P0 规则实现：9 类证据角色识别、Evidence Case 归一化、failure signal 抽取、规则分桶聚类、资产包派生。
- Express API：评测任务创建、复赛样例载入、上传解析、根因采纳 / 拒绝 / 策略编辑、预览、生成资产包、文件下载。
- P0 持久化：复用现有 `workspace_taskId.json` 保存 `latest_snapshot`，刷新和重开任务不丢。
- 测试：新增 `tests/evaluation-mode.test.ts` 覆盖字段角色泛化、异构列名归一化、采纳 / 拒绝影响资产包数量、JSONL / provenance 导出一致性。

验证：

- `node --import tsx --test tests/*.test.ts`：45 tests passed。
- `npm run lint`：passed。
- `npm run build:server`：passed。
- `npm run build`：passed，存在 Vite 大 chunk 提醒，来自已有 ExcelJS 依赖。
- Playwright 主路径验证：本地 `http://localhost:3000` 可进入评测增强，复赛样例可生成诊断，预览可打开资产包，生成后 `training_candidates.jsonl` 下载接口返回 200 且内容包含 `instruction`。

下一检查点：

- 把上传真实 CSV / JSON / XLSX 的演示样例固定成 5-10 条 golden cases。
- 补历史任务列表里的评测摘要展示，减少“打开诊断”的空态感。
- 若比赛演示优先，下一步做 PPT 所需截图 / 脚本 / 录屏；若工程优先，下一步接算法服务的 `Normalizer / Clusterer` 最小 API。
