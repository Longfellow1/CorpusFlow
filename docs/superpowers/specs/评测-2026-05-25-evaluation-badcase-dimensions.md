# 评测模式 Badcase 多维样本扩展方案

## 背景

评测增强不能只验证“链路通不通”，要验收它是否能把 bad case 分析转成可执行的数据资产建议。Chat 项目的多轮 bad case 是一个有效来源，但不能成为唯一真值，否则评测会过拟合 Chat 当前路由器和工具链的失败形态。

本方案把 migration package 的真实车载语音质量信号纳入评测来源，并保留 Chat eval 执行失败作为一个独立来源维度。

## 目标

- 用真实车载语音 query 扩展评测样本，而不是继续依赖录屏里的简单 demo。
- 覆盖弱答、落域错误、负向情绪、投诉、复询/上下文和 Chat 执行失败等多个 badcase 维度。
- 让 `npm run eval:evaluation-agent` 验收“证据理解 → 失败归因 → 数据建议 → 资产包生成”的完整闭环。
- 避免泛词误归因，例如把“导航/查询/工具”误判成 `tool_not_called`，或把普通“安全驾驶”误判成 `safety_boundary`。

## 非目标

- 不把 Chat eval 的失败分布当作唯一标准。
- 不把 migration package 的规则检测结果直接视为人工金标。
- 不在第一版封死全量样本池；正式 fixture 只保留小规模、有代表性的回归样本。

## 数据来源

### Migration Package

来源目录：

- `/Users/Harland/Go/data_analysis/migration_package/results/analysis_20260427_204247`

关键产物：

- `risk_analysis.json`
- `sentiment_analysis.json`
- `complaint_analysis.json`

该分析覆盖 2026-03 真实车载语音数据，共 `2,238,434` 条。主要质量信号：

- `weak_answer`
- `domain_error`
- `complaint`
- `repetition`
- `explicit negative emotion`

注意：`high_risk_sessions_full` 只保留前 1000 个风险样本，适合第一批候选抽样，不等于全量长尾样本池。

### Chat Eval

来源目录：

- `/Users/Harland/Go/Chat/CHAT-0410/eval/reports/mt_migration90_20260515_095956_e4a4c8`

关键产物：

- `badcases_corrected.jsonl`
- `badcases_answer_quality.jsonl`
- `summary_corrected.json`
- `summary_quality_review.json`

Chat eval 只作为 `chat_eval_execution_failure` 维度，用于覆盖 wrong mode、wrong tool、effective query 污染、provider fallback 等执行结果类问题。

## 候选样本池

候选样本落在本地临时目录：

- `tmp/migration-eval-dimensions/combined_eval_rows.jsonl`
- `tmp/migration-eval-dimensions/combined_eval_rows.csv`
- `tmp/migration-eval-dimensions/manifest.json`
- `tmp/migration-eval-dimensions/交接-交接-preview.md`

候选规模：

| 维度 | 数量 | 用途 |
| --- | ---: | --- |
| `migration_weak_answer` | 20 | 弱答/空泛回答，转 SFT 修复候选 |
| `migration_domain_error` | 20 | 落域/能力路由错误，转 eval cases |
| `migration_explicit_negative_emotion` | 20 | 显式负向情绪，验收情绪识别到纠偏建议 |
| `migration_negative_complaint` | 20 | 投诉/抱怨，验收体验失败处理 |
| `migration_repetition_context_candidates` | 12 | 复询候选，需回源补完整多轮 |
| `chat_eval_execution_failure` | 22 | Chat 多轮执行失败，只作为一个来源维度 |

总计 114 条候选。

## 正式 Fixture

正式回归样本：

- `fixtures/evaluation/migration_badcase_dimensions.jsonl`
- `fixtures/evaluation/migration_badcase_regression.jsonl`
- `fixtures/evaluation/migration_badcase_full.jsonl`
- `fixtures/evaluation/migration_multiturn_context.jsonl`

当前规模：

| Fixture | 数量 | 用途 |
| --- | ---: | --- |
| `migration_badcase_dimensions.jsonl` | 34 | smoke 级多维样本 |
| `migration_badcase_regression.jsonl` | 170 | regression 级回归样本 |
| `migration_badcase_full.jsonl` | 535 | full eval 分层样本 |
| `migration_multiturn_context.jsonl` | 122 | 多轮上下文专项样本 |

覆盖：

- 弱答：6 条
- 落域错误：6 条
- 显式负向情绪：6 条
- 投诉/抱怨：6 条
- 复询候选：4 条
- Chat eval 执行失败：6 条

处理原则：

- 保留真实 query 和回答，用于评测语义和归因。
- 脱敏 `session_id`、`trace_id`、`source_message_id`。
- 不把复询候选直接封为完整多轮金标，后续需要回源补前后轮。

### 数据质量门

`scripts/build-evaluation-fixtures.py` 现在不再直接信任 migration package 的 `target_agent` 和风险标签。正式 fixture 进入样本前必须通过质量门：

- 所有 fixture 的 `user_input` 至少包含 4 个中文字符。
- `migration_domain_error` 必须能从 query 自证目标域：
  - `mapU` 需要明确导航/路线/地点信号。
  - `musicX` 需要明确播放、歌曲、音乐、歌词等信号。
  - `app` 只保留明确应用名，例如虎嗅等。
  - 空调/车控必须包含明确控制对象。
- 明确剔除短碎片、ASR 噪声、上下文缺失片段和错误 target，例如 `去still alive没女`、`到这儿`、`导航去不知道去哪`、`播放然后这个窗户`。
- 按维度限制重复 query，避免 `听不懂`、天气类 query 过度放大。
- `migration_badcase_fixture_manifest.json` 记录 `quality_gate` 过滤原因、数量和样例。

最新构建过滤了 356 条候选：其中短中文 query 133 条、弱 `mapU` 意图 158 条、弱音乐意图 23 条、弱 app 意图 17 条。过滤后所有正式 fixture 的短中文 query 数为 0。

## 归因机制调整

新增 failure signal：

- `negative_emotion`

用于识别“负向情绪或投诉处理不足”，让投诉/负向体验从普通 `weak_answer` 和 `unknown_failure` 中分离出来。

收紧 `tool_not_called`：

- 保留：`未调用`、`未触发工具`、`tool_not_called`、`no tool call`、`action missing`
- 移除泛词：`工具`、`查询`、`导航`、`检索`

收紧 `safety_boundary`：

- 保留：`安全边界`、`安全拒识`、`高风险`、`危险动作`、`敏感`、`违规`
- 移除泛词：单独的 `安全`、`拒答`、`拒识`

同步位置：

- `src/utils/evaluationMode.ts`
- `algorithm/src/app.py`

## 验收方式

`npm run eval:evaluation-agent` 现在包含三套 golden：

1. `vehicle-agent-core-badcases`
2. `structured-rag-safety-badcases`
3. `migration-real-vehicle-badcase-dimensions`

第三套使用 `fixtures/evaluation/migration_badcase_dimensions.jsonl`，验收真实车载语音维度是否能被评测增强 Agent 正确归因，并产出对应数据资产建议。

关键预期：

- 落域错误样本必须包含 `wrong_tool`，不能误入 `tool_not_called`。
- 负向情绪/投诉样本首要 signal 为 `negative_emotion`。
- migration fixture 不应出现 `tool_not_called` cluster。
- migration fixture 不应误出现 `safety_boundary` signal。

## 当前验证结果

- `npx tsx --test tests/*.test.ts`：62 pass
- `npm run eval:evaluation-agent -- --tier=full`：passed，5 套 golden，overallScore `0.9941`
- `npm run eval:signal-audit`：passed，current expectedRecall `1`，unknownFailureRate `0`
- `cd algorithm && uv run python -m unittest tests.test_generation_frame`：23 pass
- `npm run lint`：pass
- `npm run build:server`：pass
- `npm run build`：pass，仅 Vite 大 chunk warning

## 风险与后续

1. 复询维度还不是完整多轮金标。
   - 当前 `risk_analysis.json` 只提供风险行，没有上下文窗口。
   - 下一步需要回源 March parquet，通过 Sessionizer 补齐前后轮。

2. Migration `high_risk_sessions_full` 被限制为 1000 条。
   - 第一批 fixture 足够做回归，但不代表长尾覆盖。
   - 后续需要脚本化从 parquet 直接分层抽样。

3. Signal 配置在 TypeScript 和 Python 两处同步。
   - 已加同构测试，但长期应抽成共享配置或生成文件，减少漂移。

4. 当前 fixture 是回归验收集，不是训练/评测全量集。
   - 后续应建立 `smoke / regression / full` 三层样本集。

## DeepSeek 评审

评审时间：2026-05-25

评审方式：使用 `DEEPSEEK_API_KEY` 调用 `deepseek-chat`，把本文档作为输入，让其从 AI eval、数据质量、车载语音 Agent 角度评审。

原始评审输出保存在本地临时文件：

- `tmp/评测-评测-评测-deepseek-evaluation-badcase-dimensions-review.md`

### DeepSeek 总体结论

DeepSeek 认为方案方向正确：

- 不把 Chat badcase 当唯一真值。
- 引入 migration package 真实车载语音质量信号是必要的。
- 收紧 `tool_not_called` / `safety_boundary` 泛词方向正确。
- 三套 golden 的结构合理。
- 脱敏处理应保留。

但它给出“当前不可直接上线”的判定，原因是当前 fixture 更适合 smoke/regression，不足以作为封版级 eval。

### DeepSeek 阻塞问题

1. Fixture 规模过小，可能导致假高分。
   - 当前正式 fixture 只有 34 条，每个维度 4-6 条。
   - DeepSeek 认为这更像回归 smoke，不足以证明泛化能力。
   - 建议扩到至少 200 条，每个维度至少 30 条。

2. 复询/上下文维度无效。
   - 当前复询候选只有单轮风险行，没有前后轮上下文。
   - 无法真正验证多轮上下文理解。
   - 建议补齐上下文前，不把该维度作为封版金标。

3. Signal 收紧缺少召回率对比。
   - 移除 `工具/查询/导航/检索` 和 `安全/拒答/拒识` 可以降低误报，但可能误杀真实 `tool_not_called` 或 `safety_boundary`。
   - 建议补充收紧前后的误报率、召回率对比。

### DeepSeek 高优建议

1. 扩展 fixture 至 200+ 条，并混入对照/负样本。
2. 对同一 badcase 做语义等价改写，验证归因一致性。
3. 把 Chat 执行失败细分为 `wrong_mode`、`wrong_tool`、`provider_fallback`、`effective_query_pollution` 等子类型。

### DeepSeek 中低优建议

1. Signal 配置从 TypeScript / Python 双写改成共享 JSON/YAML。
2. 负向情绪增加强度分级。
3. 从 parquet 建立分层抽样脚本，覆盖长尾。

## 处理判断

我接受 DeepSeek 对“封版级 eval”的风险判断，但不完全接受“立即把 fixture 扩到 200+ 并混入故意错误标签”作为第一优先级。

原因：

- 当前 34 条 fixture 的定位是 regression smoke，用于防止归因规则回退，不应被表述为 full eval。
- 直接混入“故意错误标签”会和当前评测模式的证据输入契约冲突：评测增强 Agent 是从外部证据中提取失败信号，若故意写错 `failure_note/tags`，需要新增“source label distrust / adjudication”机制，否则会把测试目标混乱化。
- 扩到 200+ 前，必须先解决复询上下文回源和分层抽样脚本，否则只是把同一类规则样本放大。

接受并调整的结论：

1. 当前 fixture 只作为 smoke/regression，不作为封版 full eval。
2. 复询候选在补齐多轮上下文前，不计入封版级上下文能力证明。
3. 下一步优先补 signal 收紧前后对比，而不是继续堆样本数。
4. Chat execution failure 需要拆子类型。
5. Signal 配置共享化是后续工程债，应该进下一轮任务。

## 修订后的下一步

1. **信号收紧对比实验**
   - 在候选 114 条和 Chat quality badcase 上分别跑旧规则/新规则。
   - 输出 `tool_not_called`、`safety_boundary`、`wrong_tool`、`negative_emotion` 的分布变化。
   - 判断是否出现明显漏召回。

2. **复询维度回源**
   - 从 March parquet 使用 migration package 的 Sessionizer 回源。
   - 以 `logical_session_id/message_id` 找到前后轮窗口。
   - 生成真正的多轮 fixture，而不是单轮 repetition candidate。

3. **Chat 执行失败子类型**
   - 将 `chat_eval_execution_failure` 拆成：
     - `wrong_mode`
     - `wrong_tool`
     - `provider_fallback_no_answer`
     - `empty_search_result`
     - `effective_query_pollution`
     - `raw_news_dump_not_voice_ready`

4. **Fixture 分层**
   - `smoke`: 30-50 条，CI 快速跑。
   - `regression`: 100-200 条，覆盖主要维度和子类型。
   - `full`: 500+ 条，从 parquet 分层抽样，可离线跑。

5. **共享 signal 配置**
   - 抽出 `evaluationSignals.json` 或 `evaluationSignals.yaml`。
   - TypeScript 和 Python 由同一份配置生成/读取。

## 2026-05-25 M3-M5 落地结果

本轮已把 DeepSeek 标出的三个阻塞点落到可重复命令和固定 fixture。

### 新增数据与脚本

- `scripts/build-evaluation-fixtures.py`
  - 从 migration package 的 `analysis_20260427_204247`、3 月 parquet、Chat eval report 构建评测模式 fixture。
  - 默认脱敏 raw `message_id/session_id/logical_session_id/vehicle_id`，只保留真实 query/answer/context 信号。
- `fixtures/evaluation/migration_badcase_regression.jsonl`
  - 170 条。
  - 维度：落域错误 40、弱答 45、投诉 20、显式负向情绪 20、多轮上下文 20、Chat execution failure 25。
- `fixtures/evaluation/migration_badcase_full.jsonl`
  - 663 条。
  - 维度：落域错误 120、弱答 210、投诉 43、显式负向情绪 45、多轮上下文 125、Chat execution failure 120。
- `fixtures/evaluation/migration_multiturn_context.jsonl`
  - 125 条。
  - 其中 100 条来自 Chat 项目的 migration multi-turn builder，原始来源为 parquet + migration Sessionizer。
  - 另有 25 条来自 migration risk repetition seed 的 parquet 回源窗口。
- `fixtures/evaluation/migration_badcase_fixture_manifest.json`
  - 记录 fixture 行数、维度分布和脱敏状态。
- `scripts/evaluation-signal-audit.ts`
  - 对比旧规则和当前规则的 signal recall、unknown rate、`tool_not_called/safety_boundary` 误报率和子类型分布。

### M3 归因可靠性

`npm run eval:signal-audit` 结果：

- 输入行数：1248。
- 当前规则 expected recall：1.0000。
- 当前 unknown failure rate：0。
- `tool_not_called` 误报率：旧规则 0.6226 -> 当前 0。
- `safety_boundary` 误报率：旧规则 0.0144 -> 当前 0。
- 子类型覆盖：
  - `wrong_tool.domain_mismatch`: 187
  - `wrong_tool.wrong_mode`: 257
  - `memory_missing.effective_query_pollution`: 177
  - `memory_missing.repetition`: 74
  - `weak_answer.provider_or_empty_result`: 91
  - `negative_emotion.complaint`: 123
  - `negative_emotion.explicit_negative`: 56

同时补齐 TS fallback 和 Python 算法侧对 raw Chat eval 字段的识别：

- `wrong_mode`
- `fallback` / `fallback_search` / `unusable`
- `effective_query`
- `answer_quality`
- `tool_status`
- `result_quality`

### M4 多轮/上下文真评测

多轮 fixture 不再只用单轮 repetition risk 行。

当前多轮来源：

- Chat 项目 `build_migration_multiturn_eval_dataset.py` 生成的真实 3-5 轮 session case。
- migration package parquet + `Sessionizer` 回源的 repetition context window。
- full fixture 中 `migration_multiturn_context` 共 125 条。

覆盖的上下文子类型：

- `multi_tool_chain`
- `multi_clarify_resolve`
- `multi_entity_inherit`
- `multi_context_reference`
- `multi_topic_shift`
- `effective_query_pollution`
- repetition/context recovery

边界说明：仍不是完整线上 trace replay。当前验收的是“评测增强模块能从带多轮窗口的失败证据中归因并产出数据建议”，不是对原 Chat runtime 重新执行。

### M5 Regression / Full Eval

`scripts/evaluation-agent-eval.ts` 已支持分层：

- `npm run eval:evaluation-agent`
  - 默认 smoke。
- `npm run eval:evaluation-agent -- --tier=regression`
  - 加载 170 条 regression fixture。
- `npm run eval:evaluation-agent -- --tier=full`
  - 加载 663 条 full fixture。

Full tier 阈值：

- `overallScore >= 0.86`
- `signalRecall >= 0.85`
- `strategyMatchScore >= 0.86`
- `provenancePassRate = 1`
- `unknownFailureRate <= 0.1`

本轮最终 full eval：

- passed: true
- caseCount: 5
- overallScore: 0.9900
- evidenceUnderstanding: 0.9780
- badcaseDetection: 1.0000
- signalRecall: 1.0000
- strategyMatchScore: 1.0000
- assetQuality: 0.9625
- unknownFailureRate: 0
- provenancePassRate: 1.0000
- criticalFailures: []

Full fixture 单项：

- rawCount: 663
- evidenceCount: 663
- failedCount: 663
- clusterCount: 6
- assetCount: 3142
- signalRecall: 1.0000
- strategyMatchScore: 1.0000
- assetCompleteness: 1.0000
- unknownFailureRate: 0
- provenancePass: true

### 验证命令

- `npm run eval:build-fixtures`
- `npx tsx --test tests/evaluation-mode.test.ts tests/evaluation-agent-eval.test.ts tests/evaluation-signal-audit.test.ts`
- `cd algorithm && uv run python -m unittest tests.test_generation_frame`
- `npm run eval:signal-audit`
- `npm run eval:evaluation-agent -- --tier=full`
