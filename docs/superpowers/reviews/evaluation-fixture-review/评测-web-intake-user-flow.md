# Evaluation Mode Web Intake User Flow

日期：2026-05-27

## 产品判断校准

Verdict: `REFRAME / 重新定义`

这次不是把前端 UI 放弃掉、改成 CLI-first。正确判断是：

```text
当前阶段先把 Web UI 梳理成 intake-first 的评测工作台。
CLI 放到下一阶段统一开发，但 Web 和 CLI 必须复用同一套 intake contract。
```

真实用户不是“愿意认真填模板的人”，而是已经有一包 eval / trace / log / CSV / JSON 的 Agent 应用团队。他们卡住的时刻是：评测或线上观察已经发现 badcase，但这些 badcase 还不能直接变成 regression / training / review asset。

他们今天的解法通常是人工看表、翻 trace、补背景、归类失败、手写期望行为、再整理导出。CorpusFlow 的价值不是让他们多填一段说明，而是用最小上下文确认，提升首次分析可信度。

## 当前 UI 问题

现有工作台顺序偏：

```text
上传文件 -> 直接解析/诊断 -> 解析后再补“任务背景与生成策略”
```

问题是背景输入发生得太晚。它现在更像资产生成策略补丁，而不是首次归因分析的输入。

这会导致三个风险：

- 用户上传低背景文件时，系统已经先做了一次黑盒判断。
- 用户不知道平台到底识别了哪些字段、缺了哪些上下文。
- 后续生成的 cluster 和 asset 即使能跑通，也很难让用户信任。

## 目标流程

目标 Web 流程应改成：

```text
创建评测任务
-> 导入 evidence 文件
-> intake 扫描：识别文件、字段、标注、上下文充分性
-> 最小背景确认：只补关键缺口
-> 首次分析：归因、cluster、数据建议
-> 人工复核：接受/拒绝/补充背景/重跑
-> 资产预览与下载
```

### 1. Empty State

用户进入评测增强页时，左侧应聚焦一个主动作：

```text
导入评测失败证据
```

辅助动作可以保留：

- 使用样例
- 选择来源类型
- 查看支持格式

但不要把“任务背景与生成策略”放在空状态下当作大文本框强迫用户填写。真实生产用户多数不会先写背景。

### 2. Evidence Import

用户上传 CSV / JSON / XLSX 后，前端不应立即进入完整诊断，而应先做 intake scan。

intake scan 输出：

- 文件来源推断：eval export、trace export、feedback log、manual sheet、unknown。
- 字段映射：query、answer、expected、failure_note、tool_calls、messages、session_id。
- 标注状态：labeled、partially_labeled、unlabeled。
- 上下文状态：single_turn、multiturn_partial、multiturn_full。
- 风险提示：缺 expected、缺 assistant history、缺 tool call、短 query 过多、字段名不确定。

### 3. Minimal Context Capture

背景补充不应设计成聊天框优先，而应是一个结构化的项目背景卡。

建议字段：

| 字段 | 作用 | 默认行为 |
| --- | --- | --- |
| 被评测对象 | Agent / 产品 / 业务域 | 可从文件名和字段推断，允许用户改 |
| 数据来源 | promptfoo / Langfuse / 自研日志 / 手工表格 / 其他 | 自动识别失败时让用户选择 |
| 本次目标 | regression / training candidate / badcase report | 默认 regression first |
| 重点失败 | wrong tool / weak answer / negative emotion / safety / context | 可多选，默认由样本推断 |
| 标注可信度 | 已人工标注 / 半标注 / 未标注 | 自动识别，用户确认 |
| 简短补充 | 一句话业务背景或约束 | 可选，不应成为阻塞项 |

如果用户完全不补充，仍可继续，但系统必须进入 `low_context_mode`，并在分析结果中显示置信度和缺口。

### 4. First Analysis

首次分析不应只展示 cluster，还要展示分析依据。

每个 cluster 至少包含：

- failure signal
- root cause hypothesis
- evidence examples
- confidence
- basis：来自文件字段、用户背景、系统推断
- missing context
- recommended next action

cluster 状态建议：

| 状态 | 含义 | 行为 |
| --- | --- | --- |
| `confirmed` | 证据和背景足够 | 可生成资产 |
| `provisional` | 大概率成立，但需要抽样复核 | 可预览，生成时带 review 标记 |
| `needs_context` | 缺关键背景 | 不应直接批量生成，应先追问或人工确认 |

### 5. Review And Update

用户看到分析后，应能做三类动作：

- 接受 / 拒绝 cluster。
- 修改重点失败或业务背景后重跑分析。
- 针对某个 cluster 补一句局部说明，而不是只更新全局策略。

当前“任务背景与生成策略”可以保留，但位置应从“解析后补丁”调整为：

- intake 阶段的项目背景卡。
- review 阶段的全局策略修正。
- cluster 层级的局部策略修正。

### 6. Asset Preview And Export

资产包不只导出训练/评测数据，还应导出 intake 和 provenance。

资产包必须包含：

- 标准 asset records。
- `intake_report.json`。
- `context_version`。
- 每条 asset 的 source case、cluster、strategy、confidence。
- 低置信度或 `needs_context` 样本的 review 标记。

## 状态机

```text
empty
-> importing
-> intake_ready
-> needs_context
-> analyzing
-> review
-> preview_ready
-> packaged
```

错误状态：

```text
unsupported_file
schema_uncertain
too_many_low_information_rows
analysis_failed
asset_generation_failed
```

这些错误不能只显示通用失败文案，应指出用户下一步能做什么。

## 后端契约

前端 UI 不要做成纯视觉流程，后端 parse 契约也要同步升级。

### EvaluationIntakeContext

建议新增：

```ts
type EvaluationIntakeContext = {
  sourceKind: "eval_export" | "trace_export" | "feedback_log" | "manual_sheet" | "unknown";
  sourceTool?: string;
  agentProfile?: string;
  businessDomain?: string;
  evaluationGoal: "regression" | "training_candidate" | "badcase_report";
  labelPolicy: "labeled" | "partially_labeled" | "unlabeled";
  prioritySignals: string[];
  outputTargets: string[];
  userBrief?: string;
  fieldMapping?: Record<string, string>;
  contextVersion: string;
};
```

### EvidenceIntakeReport

建议新增：

```ts
type EvidenceIntakeReport = {
  detectedSchema: Record<string, string>;
  fieldCoverage: Record<string, number>;
  labelAvailability: "labeled" | "partially_labeled" | "unlabeled";
  contextQuality: "low" | "medium" | "high";
  missingContext: string[];
  warnings: string[];
  recommendedAction: "continue" | "ask_context" | "review_mapping";
};
```

### Parse Payload

当前：

```ts
{
  sourceFile,
  rows
}
```

目标：

```ts
{
  sourceFile,
  rows,
  intakeContext
}
```

算法侧和 TS fallback 都应使用同一套 intake 字段，避免 Web 和未来 CLI 语义漂移。

## Web 验收标准

前端 UI 做完不等于按钮能点通。这个阶段的验收标准应是：

- 上传后先出现 intake report，而不是直接跳到最终诊断。
- 用户能看见系统识别了什么、缺了什么、哪些字段不确定。
- 用户能用结构化背景卡补充关键上下文。
- 不填背景也能继续，但结果明确标记 `low_context_mode`。
- `intakeContext` 被传到后端并持久化到 snapshot。
- cluster 能显示 basis / confidence / missing context。
- 资产包能导出 intake report 和 context version。
- `context_intake` eval 能证明背景会影响归因和数据建议。
- `unlabeled_regression` eval 能证明没有失败标注时不会只靠 mock 字段。

## CLI 下一阶段关系

CLI 不和 Web 冲突。

Web 当前先验证用户理解路径和人工复核体验。CLI 下一阶段复用同一套契约：

```text
corpusflow eval ingest ./badcases.json \
  --source-tool langfuse \
  --agent "车载语音助手" \
  --goal regression \
  --priority wrong_tool,weak_answer,negative_emotion
```

CLI 负责生产集成效率，Web 负责首次理解、复核和可视化信任建立。二者共享 `EvaluationIntakeContext`、`EvidenceIntakeReport`、snapshot 和 asset schema。

