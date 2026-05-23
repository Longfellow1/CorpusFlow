# CorpusFlow Evaluation Mode PRD

日期：2026-05-21

状态：Draft，复赛后中长期方向

## 1. 产品判决

### 1.1 判决

Verdict: `REFRAME / 重新定义`

评测模式不应被定义为：

```text
表格上传 + 短句扩写 + 固定工作台流程
```

它应被定义为：

```text
面向 LLM / Agent 应用团队的 failure-to-dataset agent：
把线上 badcase、trace、日志、用户反馈和评测失败，转成可复核、可导出的训练与回归评测数据资产。
```

CorpusFlow 不做完整评测平台，不做 LLM Judge，不做 CI Gate，不做训练框架。它做的是评测、观测、反馈系统之后，训练和回归评测之前的中间层。

### 1.2 Opus Review Gate 摘要

本 PRD 经过 `opus-review-gate` 外部评审。评审结论要点：

- 当前方向成立，但真实证据仍是 L0-L1，不能用完整平台级投入押注未验证假设。
- B/C 用户应作为 A 用户场景的下游消费者，不应与 A 并列拉散产品。
- `agentic` 叙事有轻微技术炫技风险，PRD 应落到有状态管线、人工审阅和可验证输出。
- 最小切入应是一个 schema、一个真实上游导入、一个可用导出，而不是一次性承诺完整 agent 平台。
- 成功指标应看端到端可用数据集产出、重复使用、provenance 完整性和人审通过率，而不是生成数量、支持格式数或 GitHub star。

本 PRD 采纳该评审：开源 P0 不做大而全平台，先验证 failure evidence -> dataset asset 这条核心链路是否成立。

### 1.3 当前适用范围

本 PRD 定义的是 CorpusFlow 评测模式的中长期产品方向和复赛后的开源路线，不直接作为 NEXTAI 复赛执行清单。

复赛阶段以这份文档为准：

```text
docs/superpowers/specs/2026-05-21-复赛评测模式需求与里程碑.md
```

两条路线的关系：

| 阶段 | 优先交付 | 暂不做 |
| --- | --- | --- |
| 复赛 P0 | 可演示工作台：失败证据 -> 理解报告 -> 一键资产包 -> 展示资产包 | CLI、adapter、完整 review queue |
| 开源 P0 | 工程接入能力：evidence bundle / trace export -> DatasetAsset -> review/export | 完整 eval runner、LLM Judge、训练平台 |

因此，本文中的 CLI、Langfuse adapter、长上下文 reconstruction、review queue 都属于复赛后的开源 P0 候选能力；复赛前只保留它们的叙事影子，不进入开发主路径。

## 2. 背景

开源 LLM / Agent 生态已经有大量工具覆盖相邻环节：

```text
Eval Runner: promptfoo / DeepEval / OpenAI Evals / Ragas
Observability: Langfuse / Phoenix / Opik / Weave
Human Labeling: Label Studio / Argilla
Training: LLaMA-Factory / Axolotl / OpenPipe
```

这些工具能发现失败、记录 trace、做标注或启动训练，但中间仍有一个高频手工环节：

```text
失败证据
-> 人工读日志和表格
-> 归类 badcase
-> 补 expected behavior
-> 写 eval points
-> 构造 regression / SFT / negative 数据
-> 保留来源和修改记录
-> 导出到下游工具
```

CorpusFlow 的开源生态位是：

```text
the missing data layer between evals, observability, feedback, and fine-tuning
```

中文表达：

```text
评测失败、线上反馈和 Agent trace 到下一轮训练/回归数据之间的开源数据回流层。
```

## 3. 目标用户

### 3.1 优先用户 A：LLM / Agent 应用团队

他们已经有线上或离线失败证据：

- Agent trace。
- LLM 调用日志。
- 用户反馈。
- 人工 badcase 文档。
- promptfoo / DeepEval 等评测结果。
- Langfuse / Phoenix / Opik 等观测平台导出。

触发时刻：

```text
一次评测或线上观察结束后，团队发现一批失败样本，需要把它们变成下一轮可用的回归评测数据或修复训练数据。
```

核心诉求：

- 不想先整理成固定表格模板。
- 不想只生成短 query 变体。
- 需要系统理解长上下文、trace 和失败证据。
- 需要保留 provenance，知道每条数据来自哪里、为什么生成、谁确认过。
- 希望通过 CLI/API 接入已有工程流，而不是被迫进入一个重工作台。

### 3.2 次级用户 B：数据 / 算法团队

他们消费 A 场景产出的 failure-derived 数据资产，用于：

- SFT / DPO / preference 数据候选。
- 长文本和多轮训练样本。
- gold / silver candidate 复核。
- 模型修复实验。

B 是下游消费者，不是 P0 的主设计锚点。

### 3.3 第三用户 C：测试 / 评测团队

他们消费 A 场景产出的 regression 数据资产，用于：

- 回归评测集补齐。
- 边界样本和负例补齐。
- 失败类型覆盖分析。

C 是重要输出对象，但不是 P0 的主输入场景。

## 4. 当前风险

### 4.1 短句造句器风险

现有 CorpusFlow 能做 query 拆解、仿写、扩写和 SFT 包装，但体验容易显得像短句造句器。真实 failure evidence 往往包含长对话、日志、工具调用、检索上下文和人工备注，不能靠短句 paraphrase 承担。

### 4.2 固定工作台风险

现有产品形态偏 UI 工作台和既定 workflow。开源用户更常见的接入方式是 CLI、API、SDK、CI 脚本和 notebook。工作台应成为人工审阅面，而不是唯一入口。

### 4.3 表格契约风险

如果用户必须提供 `query / expected / actual / passed` 等字段，产品会退化成表格整理工具。内部可以有标准 schema，外部入口必须允许 messy evidence。

### 4.4 范围膨胀风险

如果评测模式继续扩张为 runner、judge、报告中心、CI Gate 或训练平台，会直接进入拥挤赛道，失去 CorpusFlow 的独特生态位。

## 5. 产品定义

### 5.1 一句话定义

```text
CorpusFlow Evaluation Mode turns messy LLM/Agent failure evidence into reviewable, provenance-preserving regression and training datasets.
```

中文：

```text
CorpusFlow 评测模式把混乱的 LLM / Agent 失败证据，转成可复核、可追溯、可导出的回归评测与训练数据资产。
```

### 5.2 核心工作流

```text
Evidence Ingestion
-> Context Reconstruction
-> Case Extraction
-> Failure Pattern Mining
-> Repair Dataset Planning
-> Asset Generation
-> Human Review
-> Export
```

注意：这是产品能力地图，不是 P0 一次性全部做完的范围。

### 5.3 产品边界

做：

- 摄取失败证据。
- 重建长上下文和关键失败片段。
- 抽取标准 EvidenceCase。
- 识别 failure signals 和 failure pattern。
- 生成 regression / SFT candidate / negative / review queue。
- 保留 provenance 和人工修改记录。
- 导出到下游工具链。

不做：

- 不运行完整评测任务。
- 不做 LLM Judge 平台。
- 不做发布 Gate。
- 不做模型训练。
- 不自动证明真实根因。
- 不承诺无人工确认的 gold 数据。

## 6. 开源 P0 范围

开源 P0 目标不是做完整 agent 平台，而是验证：

```text
一个真实失败证据输入
-> CorpusFlow 能抽取并生成有 provenance 的修复数据候选
-> 用户愿意把结果带入自己的下游流程
```

### 6.1 开源 P0 输入

必须支持：

- Generic evidence bundle：本地目录或 JSONL，每条包含原始文本、来源、可选 metadata。
- CSV / TSV：兼容当前表格导入能力，但不能把表格作为唯一入口。
- Markdown / plain text：支持用户粘贴或导入人工 badcase 文档。

优先支持一个真实生态 adapter：

- Langfuse trace export JSON。

暂不支持：

- 全量 Phoenix / Opik / promptfoo / DeepEval adapter。
- 复杂二进制日志解析。
- 在线连接第三方平台账号。

### 6.2 开源 P0 内部对象

#### EvidenceSource

```json
{
  "sourceId": "src_001",
  "sourceType": "langfuse_trace | csv | jsonl | markdown | text",
  "fileName": "langfuse-export.json",
  "importedAt": "2026-05-21T00:00:00.000Z",
  "metadata": {}
}
```

#### EvidenceCase

```json
{
  "caseId": "case_001",
  "sourceId": "src_001",
  "sourceLocation": "trace:abc123/span:4",
  "content": {
    "userIntent": "用户想让 Agent 基于订单延迟和客服反馈判断排查路径",
    "context": "相关 trace、检索内容、工具调用摘要",
    "query": "线上告警显示订单服务 P95 延迟升高...",
    "expectedBehavior": "拆解性能告警、用户反馈和排查路径，给出指标优先级",
    "actualBehavior": "建议先重启订单服务",
    "failureNote": "诊断过浅，未建立指标排查路径"
  },
  "readiness": {
    "level": "A | B | C | D",
    "missing": [],
    "limitations": []
  },
  "provenance": {
    "rawEvidenceRef": "src_001#trace:abc123/span:4",
    "extractionMethod": "model_assisted",
    "humanReviewed": false
  }
}
```

#### FailurePattern

```json
{
  "patternId": "pattern_001",
  "caseIds": ["case_001"],
  "pattern": "Semantic | Context | Retrieval | Routing | Parameter | SystemBoundary | Evaluation",
  "subType": "diagnosis_shallow",
  "failureSignals": [
    "只给出操作建议，没有拆解指标",
    "忽略客服反馈和性能告警之间的关联",
    "没有说明数据库、缓存、下游回调的判断路径"
  ],
  "confidence": 0.82,
  "requiresHumanReview": true
}
```

#### DatasetAsset

```json
{
  "assetId": "asset_001",
  "sourceCaseId": "case_001",
  "patternId": "pattern_001",
  "assetIntent": "regression | training_candidate | negative | gold_candidate | silver_candidate",
  "format": "eval_case",
  "instruction": "线上告警显示订单服务 P95 延迟升高...",
  "expectedBehavior": "按指标优先级排查数据库、缓存和下游支付回调...",
  "evalPoints": [
    "是否识别性能告警与用户反馈的关系",
    "是否给出指标排查优先级",
    "是否区分数据库、缓存和下游回调风险"
  ],
  "provenance": {
    "sourceCaseId": "case_001",
    "generationRecipe": "repair_diagnosis_depth",
    "modelGenerated": true,
    "humanStatus": "needs_review"
  }
}
```

### 6.3 开源 P0 功能需求

#### FR1. 证据导入

- 用户可以通过 CLI 或 UI 导入 evidence bundle。
- 系统保留原始证据，不覆盖、不丢弃。
- 系统识别来源类型，并建立 `EvidenceSource`。
- 表格字段不合规时，不直接阻断，而是进入弱解析路径。

#### FR2. 长上下文重建

- 系统从原始证据中提取用户意图、关键上下文、工具调用摘要、模型实际行为和人工备注。
- 对长文本或 trace，系统输出摘要时必须保留原始引用位置。
- 系统明确区分“原始证据中出现的事实”和“模型推断”。

#### FR3. Case 抽取与 readiness

- 系统将证据转成 `EvidenceCase`。
- 每个 case 有 readiness：A/B/C/D。
- D 级不能直接生成 gold/regression，只能进入补证据或 review queue。
- 缺 expected / actual / score 时，系统说明影响，而不是要求用户重传模板。

#### FR4. Failure Pattern 识别

- 系统为 case 提取 failure signals。
- P0 只做轻量 pattern 分类，不做复杂无监督聚类平台。
- 模型输出必须包含置信度、证据引用和是否需要人工复核。

#### FR5. Repair Dataset Planning

- 系统根据 failure pattern 推荐数据资产类型。
- P0 支持三种资产：
  - `regression`
  - `training_candidate`
  - `needs_review`
- 每条资产必须保留 `assetIntent`，避免训练数据和评测数据混淆。

#### FR6. Asset Generation

- 系统基于 EvidenceCase 和 FailurePattern 生成 DatasetAsset。
- 生成结果必须包含 expected behavior 和 eval points。
- 对 training candidate，必须标记为候选，不自动进入 gold。
- 对长文本场景，生成结果必须保留任务上下文，不把长证据压扁成短 query。

#### FR7. Human Review

- 用户可以接受、拒绝、编辑 DatasetAsset。
- 修改后保留原始生成版本和修改版本。
- P0 可先用简单 review queue，不要求复杂多人协作。

#### FR8. Export

P0 必须导出：

```text
eval_cases.jsonl
training_candidates.jsonl
review_queue.jsonl
provenance.json
quality_report.json
```

导出必须能回答：

- 数据来自哪个原始证据？
- 为什么被生成？
- 属于哪个 failure pattern？
- 用于训练、回归还是人工复核？
- 是否经过人工确认？

## 7. 复赛后交付形态

### 7.1 开源路线：CLI 优先

以下是复赛后的开源产品路线，不进入复赛 P0。复赛当前优先可演示工作台，因为评委需要在 10 分钟内直接看懂价值链路。

开源用户的第一入口应是 CLI：

```bash
corpusflow ingest ./evidence
corpusflow diagnose ./corpusflow-project
corpusflow build-dataset ./corpusflow-project --target regression,training_candidate
corpusflow export ./corpusflow-project --format jsonl
```

CLI 目标：

- 让工程团队可以在本地、CI、notebook 或脚本中运行。
- 验证核心链路，不被 UI 工程拖慢。
- 为后续 API 和 UI 共享同一套 schema。

### 7.2 API / SDK

P1 提供：

- `POST /api/evidence/import`
- `POST /api/evidence/diagnose`
- `POST /api/datasets/build`
- `POST /api/datasets/export`

### 7.3 Workbench

复赛阶段 Workbench 是主演示面；开源长期路线中，Workbench 更适合作为审阅面，而不是唯一入口：

- 查看 EvidenceCase。
- 查看 failure signals。
- 查看 DatasetAsset。
- 做人工复核和编辑。
- 导出资产包。

不把用户锁进固定 8 步流程。

## 8. UX 原则

### 8.1 系统适应材料

错误文案不应是：

```text
缺少 expected 字段，请重新上传。
```

应是：

```text
当前证据包含用户问题和模型回答，但缺少明确期望行为。
系统可以生成 silver candidate，并标记为 needs_review；人工确认后才能进入 regression。
```

### 8.2 人审是高价值确认

用户不应被要求逐条从零填写。系统先给判断，用户只确认：

- case 是否抽取正确。
- failure signals 是否成立。
- asset intent 是否正确。
- 生成样本是否可用。

### 8.3 不制造造句感

生成不是“换几个说法”，而是围绕失败机制补数据：

```text
原始失败：Agent 诊断过浅
生成目标：补充需要分层排查、指标优先级、边界判断的 regression / training candidate
```

## 9. 开源成功指标

### 9.1 开源 P0 成功指标

- 至少 3 类证据输入可以跑通：Langfuse export、CSV、Markdown/text。
- 每条 DatasetAsset 都有完整 provenance。
- 80% 以上生成资产能进入 review queue，而不是解析失败。
- 人工复核通过率达到 50% 以上。
- 用户能在 10 分钟内从示例 evidence 导出 `eval_cases.jsonl` 和 `training_candidates.jsonl`。

### 9.2 反向指标

- 用户大量手工重写 expected behavior：说明 context reconstruction 失败。
- 用户导入后无法理解 assetIntent：说明输出契约失败。
- 用户只用 CSV，不用 trace/text：说明通用证据摄取没有成立。
- 生成数量很高但复核通过率低：说明产品退化成造句器。

### 9.3 不采用的虚荣指标

- 生成样本总数。
- 支持 adapter 数量。
- GitHub stars。
- 自动化步骤数量。

## 10. P1 / P2 范围

### P1

- promptfoo / DeepEval report adapter。
- Phoenix / Opik export adapter。
- Argilla / Label Studio review export。
- LLaMA-Factory / ShareGPT / OpenAI Evals 格式导出。
- 多 case cluster 和 pattern-level repair recipe。
- UI review surface 完整化。

### P2

- 长期项目 memory。
- 跨版本失败分布比较。
- 数据资产去重与冲突检测。
- 团队协作和 review assignment。
- 插件式 adapter SDK。

### 长期不做

- 完整 eval runner。
- LLM Judge 平台。
- CI 发布门禁。
- 训练调度和模型部署。

## 11. 复赛后开放问题

1. 开源 P0 第一个真实上游 adapter 是否选 Langfuse，还是 promptfoo / DeepEval 更适合验证 failure-to-dataset？
2. 第一版 CLI 是否必须进入现有 React/Express/FastAPI 架构，还是先独立为 `packages/core`？
3. 长上下文 reconstruction 的最小可验收标准是什么？
4. human review 是先做本地 JSON 编辑流，还是直接进入 UI review queue？
5. 开源 README 的主叙事是否从 “data production workbench” 改为 “failure-to-dataset agent”？

## 12. 复赛后第一里程碑建议

复赛结束后，第一里程碑只做一个端到端 tracer bullet：

```text
Langfuse export JSON
-> EvidenceCase
-> FailurePattern
-> DatasetAsset
-> review_queue.jsonl
-> eval_cases.jsonl / training_candidates.jsonl
-> provenance.json
```

验收方式：

- 用一份包含长 trace、工具调用和失败输出的样例数据跑通。
- 不要求用户修改字段名。
- 导出的每条数据能追溯到原始 trace 位置。
- 用户可以明确判断哪些样本可进 regression，哪些只能进 review。

只有这条链路被真实用户验证后，才继续扩展 adapter、UI 和复杂 recipe。
