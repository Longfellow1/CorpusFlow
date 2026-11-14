# CorpusFlow MCP Server 架构与工具契约设计规格书 (v2)

> 状态：评审修订完成稿 (Passed Argon-4 Peer Review)  
> 日期：2026-11-14  
> 评审模型：gemini-4-argon-thinking-medium (Argon4)  
> 目标：将 CorpusFlow 沉淀为赋能 AI Coding / Testing Agent（如 Claude Code, Codex, Cursor）的本地“失败修复数据层（Failure-to-Patch Harness）”。

---

## 1. 核心定位与设计原则

CorpusFlow MCP 不是对原有 Web 工作台 REST API 的简单平移，而是**专为 AI 宿主 Agent 打造的高效、可信的训练与回归数据生产扩展器**。

### 核心设计原则 (Argon4 评审注入)
1. **暂存区句柄模式（Staging & Reference Pattern）**：
   - 宿主 Agent 的上下文极为宝贵，绝不把几十条生成的 JSONL 数据全量塞回 Stdio；
   - 工具之间通过 `diagnosis_id` 和 `batch_id` 传递句柄，工具调用仅返回宏观统计（Stats）与 **1 条代表性样本（Preview）**；
   - 借助 MCP 动态资源（`corpusflow://staging/batches/{batch_id}`）实现“按需深钻（Progressive Disclosure）”。
2. **黄金锚点驱动（Golden Anchor Principle）**：
   - 针对失败案例造数据时，强制要求提供期望行为或单条黄金正解（`golden_response`），杜绝模型“在错误之上盲目幻觉”生成毒化数据。
3. **Agent 工具调用（Tool-Calling）为一等公民**：
   - 原生支持 OpenAI / Anthropic 格式的 `tools` + `tool_calls`，直接用于修复 Agent 路由漂移、错调漏调等核心缺陷。
4. **血缘追踪与语义去重（Lineage & Deduplication）**：
   - 保证数据进入工程代码库（`tests/regression/` 等）时具备去重机制与追溯清单（`manifest.json`）。

---

## 2. 系统架构与技术选型

* **实现语言与框架**：**Python 3.11 + FastMCP (`mcp.server.fastmcp`)**。
  - 直接复用 `algorithm/` 内的语义骨架解析、Doubao/Ark API 客户端、拒识规则引擎与聚类分析核心算子。
  - 避免跨语言进程桥接与状态分裂（Split-Brain）。
* **存储架构**：
  - 本地轻量暂存区：`.corpusflow/staging.sqlite`（管理 `diagnoses`、`batches`、`audit_logs`）。
  - 项目交付区：用户项目内指定的目标路径（如 `tests/regression/`、`data/sft/`）。

---

## 3. MCP 工具契约 (Tools)

### Tool 1: `corpusflow_diagnose_failure`
* **功能**：结构化诊断 Agent 交互或测试用例的失败特征，定位问题族并给出修补策略建议。
* **输入参数**：
  * `user_input` (string, 必填): 触发失败的用户原始 Prompt 或多轮历史摘要。
  * `actual_output` (string, 必填): 模型实际给出的错误回答、Tool Call 报文或测试异常堆栈。
  * `expected_behavior` (string, 必填): 期望的正确行为描述、正确回答或断言规则（强制调用方明确预期）。
  * `available_tools` (Array<object>, 可选): 当前上下文挂载的 Tool Schemas，用于路由诊断。
  * `trace_id` (string, 可选): 外部评测框架（如 Langfuse / Pytest）关联的 Trace ID。
* **返回格式**：
  ```json
  {
    "diagnosis_id": "diag_a81f3",
    "failure_cluster": "routing_drift | missing_tool_call | schema_error | hallucination | negative_emotion",
    "root_cause_analysis": "未能正确识别目的地槽位，错把导航指令归类为闲聊",
    "recommended_strategy": "sft_positive | contrastive_negative | hard_boundary | prompt_patch_only"
  }
  ```

### Tool 2: `corpusflow_synthesize_patch`
* **功能**：基于诊断结果与黄金正解，受控扩写批量的回归测试用例或 SFT 补丁微调数据。
* **输入参数**：
  * `diagnosis_id` (string, 必填): 引用 Tool 1 的诊断结果，自动继承失败上下文与 Tool 设定。
  * `golden_response` (string | object, 必填): 针对原案的正确回复或标准 Tool Call JSON（作为变异黄金锚点）。
  * `target_format` (enum, 必填): `openai_messages_tools` | `sharegpt` | `alpaca_sft` | `eval_assertion_case`。
  * `variation_mode` (enum, 选填): `paraphrase_robustness` | `boundary_negative` | `distractor_injection` | `adversarial` (默认 `paraphrase_robustness`)。
  * `count` (integer, 选填): 扩写数量（默认 5，最大 20）。
* **内部机制**：内置敏感拒识流水线与批内哈希去重。
* **返回格式**（轻量 Token 占用）：
  ```json
  {
    "batch_id": "batch_9e42d",
    "stats": {
      "requested": 5,
      "valid_staged": 5,
      "safety_rejected": 0,
      "deduplicated_dropped": 0
    },
    "preview_sample": {
      "input": "帮我看看去虹桥 T2 最快怎么走",
      "expected_tool": "navigation_plan",
      "expected_args": { "destination": "虹桥国际机场T2航站楼" }
    }
  }
  ```

### Tool 3: `corpusflow_commit_dataset`
* **功能**：将验证合格的 Staging 批次数据，幂等合入工程实际目录，并自动生成/更新血缘清单。
* **输入参数**：
  * `batch_ids` (Array<string>, 必填): 待提交的批次 ID 列表。
  * `target_split` (enum, 必填): `regression_suite` | `sft_train_pool` | `human_review_queue`。
  * `output_dir` (string, 必填): 目标写入目录。
  * `dedup_against_existing` (boolean, 选填): 是否与现有数据集做碰撞去重，默认 `true`。
* **返回格式**：
  ```json
  {
    "committed_file": "tests/regression/navigation_failures.jsonl",
    "added_count": 5,
    "total_in_file": 28,
    "lineage_manifest": "tests/regression/.corpusflow_lineage.json"
  }
  ```

---

## 4. MCP Resources（资源暴露）

* `corpusflow://taxonomy/failure_modes`：静态资源，定义标准的大模型/Agent 失败模式分类树与严重级别。
* `corpusflow://templates/{format}`：静态资源，提供标准 Alpaca / ShareGPT / ToolCall Schema 的字段契约规范。
* `corpusflow://staging/batches/{batch_id}`：**动态资源**，允许 Agent 或人类在需要审查全量生成物时按需加载，贯彻渐进式暴露原则。

---

## 5. MCP Prompts（预设 Agent 协作模版）

* **`closed-loop-failure-repair`**：
  引导 Agent 形成完整的修复反射弧：
  1. 捕获报错用例 -> 调用 `corpusflow_diagnose_failure`；
  2. 若建议为 `prompt_patch_only`，则引导修改代码；
  3. 若建议造数，引导 Agent 先手写一条 `golden_response`，调用 `corpusflow_synthesize_patch`；
  4. 检查 `preview_sample` 正常后，调用 `corpusflow_commit_dataset` 写入测试用例，并立刻跑测验证。
