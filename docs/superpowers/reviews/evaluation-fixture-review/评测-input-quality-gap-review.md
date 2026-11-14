# Evaluation Input Quality Gap Review

## 结论

当前清洗后的 fixture 能防止短碎片和明显错误 target 造成虚假繁荣，但还不能代表真实平台使用场景。

真实场景通常是：

- 用户上传一个文件。
- 用户会补一句或几句业务背景。
- 文件里常常没有 `failure_note`、`expected_behavior`、`target_agent` 这类标注字段。
- 平台需要先判断文件是什么、缺什么、该不该追问，再做 badcase 归因和资产建议。

当前 eval 还偏“已标注评测证据解析”，不是完整的“低质量输入下的评测增强 Agent”。

## 现状量化

统计对象：`fixtures/evaluation/migration_badcase_full.jsonl`

| 指标 | 数量 |
| --- | ---: |
| 总样本 | 535 |
| 有 `failure_note` | 535 |
| 有 `expected_behavior` | 535 |
| 有 `retrieved_contexts` | 535 |
| 有 `messages` | 122 |
| `messages` 内含 assistant 历史 | 7 |

按维度看：

| 维度 | 样本 | 有多轮 messages | 有 assistant 历史 |
| --- | ---: | ---: | ---: |
| `migration_domain_error` | 24 | 0 | 0 |
| `migration_weak_answer` | 210 | 0 | 0 |
| `migration_negative_complaint` | 23 | 0 | 0 |
| `migration_explicit_negative_emotion` | 38 | 0 | 0 |
| `migration_multiturn_context` | 122 | 122 | 7 |
| `chat_eval_execution_failure` | 118 | 0 | 0 |

## 问题拆解

### 1. 单轮样本过多

`domain_error`、`weak_answer`、`complaint`、`explicit_negative_emotion` 现在基本都是单轮 query + answer。

这只能验收：

- 字段映射是否正确。
- 规则能否从标注文本命中 signal。
- 资产包 schema 是否稳定。

不能充分验收：

- 上下文承接。
- 指代恢复。
- 用户真实任务背景。
- 多轮交互后的 badcase 归因。

### 2. 标注字段泄漏

`failure_note` 和 `expected_behavior` 现在 100% 存在。模型或规则可以从这些字段直接得到失败类型。

这会高估：

- signal recall。
- strategy match。
- cluster root cause 的可信度。

更真实的情况是用户上传运营日志、导出的问答记录或客服工单，文件里只有 query、answer、时间、会话、模型、工具调用，甚至字段名也不标准。

### 3. 平台入口缺少强制 intake context

当前 UI 左侧有“任务背景与生成策略”输入框，但它是解析后的策略补充，不是上传解析前的必填上下文。

后端 `/api/evaluation/tasks/:taskId/parse` 当前只接收：

- `sourceFile`
- `rows`

不接收：

- 业务背景
- 产品/Agent 说明
- 评测目标
- 输入文件的含义解释
- 用户补充对话

所以当前链路没有真正验收“上传文件 + 简短交流”的使用方式。

## 应补的评测层

### A. Context Intake Eval

目标：验收平台能把用户的简短背景说明纳入解析和建议。

输入形态：

- `rows`
- `task_brief`
- `conversation_context`

验收点：

- 解析结论引用业务背景。
- cluster 的 root cause 不只来自文件字段。
- 数据建议能遵守用户补充约束。
- 当背景不足时能生成明确追问，而不是硬分析。

### B. Unlabeled Evidence Eval

目标：验收没有 `failure_note`、`expected_behavior`、`target_agent` 时，平台能不能自己归因。

输入形态：

- 只保留 `query/user_input`
- `actual_output/answer`
- 可选 `tool_calls`
- 可选 `messages`
- 去掉所有显式失败标注

验收点：

- `unknown_failure` 不应暴涨。
- 核心维度 recall 要单独计分，阈值应低于标注集但必须稳定。
- 输出里必须标注推断置信度和缺失字段。
- 低置信度 case 应进入人工复核或追问队列。

### C. Multiturn Context Eval

目标：验收上下文能力，而不是把单轮风险行伪装成多轮。

输入形态：

- 从 parquet/sessionizer 回源生成完整窗口。
- `messages` 必须包含 user/assistant 历史。
- 当前轮 query 允许短，但必须依赖前文。

验收点：

- memory/coreference/context pollution 能被识别。
- 资产包导出 sharegpt history。
- provenance 能追到 source session/window。

## 产品入口调整建议

评测模式应从“上传文件后解析”改成“两段式 intake”：

1. 用户上传文件。
2. 平台要求或强提示用户补充：
   - 这个文件是什么来源？
   - 你想评测哪个 Agent/业务域？
   - 哪些失败最重要？
   - 是否已有人工标注？
   - 期望输出是 regression、训练候选还是 badcase 报告？

如果用户不填，平台也可以继续，但应明确进入 `low_context_mode`，并降低置信度、提高追问/人工复核占比。

## 验收口径调整

现有 full eval 不能再单独作为封版结论。后续至少拆成三类结果：

| Eval | 输入质量 | 用途 |
| --- | --- | --- |
| `labeled_full` | 有失败标注 | 验收 schema、字段映射、资产包稳定性 |
| `unlabeled_regression` | 无失败标注 | 验收平台自主归因能力 |
| `context_intake` | 文件 + 用户背景 | 验收真实交互入口 |
| `multiturn_full` | 完整上下文窗口 | 验收上下文/指代/污染 |

模块完成不能只看 `labeled_full passed`。必须同时满足：

- `context_intake` 能把用户背景写入 evidence context 和资产生成策略。
- `unlabeled_regression` 能产出合理 signal，并给出置信度/缺失字段。
- `multiturn_full` 中带 assistant 历史的样本占比足够高。
- 低置信度样本不会硬编资产，而是进入追问/人工复核。

