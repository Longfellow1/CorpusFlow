# CorpusFlow 专利返工 Handoff

记录日期：2026-07-10  
目标：让下一位 agent 或下一轮会话能直接接上两件专利被退回后的返工工作。

## 1. 当前背景

两件 CorpusFlow 专利被内部退回。用户初始判断是正文被 GPTZero 或类似检测脚本判定为 AI 生成倾向较高；后续补充了专利同事建议，要求从专利法视角看技术交底书，而不是只从 AI 检测视角处理文本。

当前工作边界已经明确：

- 不做“绕过 GPTZero / BypassAIGC / humanizer”的检测规避。
- 不逐句洗稿。
- 返工目标是重建发明人事实链、技术方案链、实施例支撑链和代理人可撰写链。
- AI 只能辅助检索、形式审查、完整性检查、一致性检查、语言清理；不能替代发明人生成技术方案、实施例和附图逻辑。

## 2. 已完成进度

### 2.1 项目认知

已从 docs 和代码结构构建过专利申请认知：

- 主案方向：失败证据数据资产生成方法及系统。
- 第二案方向：基于语义自由度预算的语料裂变控制方法及系统。
- 主案优先级高于第二案，因为它更贴近当前产品代码和评测模式。

CodeGraph 说明：

- 仓库存在 `.codegraph/codegraph.db`。
- 当前会话没有暴露 `codegraph_*` 工具。
- 曾尝试 `npx -y @colbymchenry/codegraph --help`，未在 60 秒内返回，已降级为低成本结构化文件读取。
- 后续不要声称已经直接使用 CodeGraph MCP。

### 2.2 外部/参考材料

已读取并转出用户给的参考 Word：

- `/Users/Harland/Downloads/智能座舱多模态交互融合方法及系统技术交底书.docx`
- `/Users/Harland/Downloads/QY-253571CN1-PA26009724-一稿-智能座舱多模态交互融合方法及系统.docx`
- `/Users/Harland/Downloads/QY-253571CN1-PA26009724-专利质检表-智能座舱多模态交互融合方法及系统.doc`

临时转文本位置：

- `tmp/patent_reference_texts/inventor_disclosure.txt`
- `tmp/patent_reference_texts/agent_first_draft.txt`
- `tmp/patent_reference_texts/quality_check.txt`

已读取专利同事建议：

- `/Users/Harland/Downloads/deepseek_markdown_20260703_7cbe8d.md`

已审计 BypassAIGC：

- 本地克隆位置：`/tmp/BypassAIGC`
- 结论：该项目是“论文润色 + 原创性增强 + GPTZero 效果展示”的双阶段 AI 改写系统，不适合作为正式专利返工工具，只能作为反面红队样本理解检测风险。

### 2.3 已形成的项目文档

专利目录下已有三份关键工作稿：

- `docs/superpowers/patents/设计-设计-设计-2026-07-03-ai-detection-red-blue-plan.md`
- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-redteam-report.md`
- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-red-blue-review.md`

其中最重要的是：

- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-red-blue-review.md`

它已经覆盖：

- 参考案中代理人如何做上位概括；
- 主案和第二案的专利法风险；
- 专利法第26条第3/4款、第31条、第33条、实施细则第20/22/23/39条；
- 主案和第二案独权主链建议；
- 主案必须澄清的事实问题；
- 第二案必须补强的实施例样式；
- 后续交付物建议。

不要在 handoff 文档中重复该文件的完整内容；后续应引用它。

## 3. 当前关键判断

### 3.1 总判断

退回问题不能简化为“AI 检测分高”。检测分只是触发器，更深层风险是：

- 技术方案是否由发明人真实确定；
- 技术方案是否充分公开；
- 权利要求是否得到说明书支持；
- 是否一案多发明；
- 首稿是否写入足够细节以避免后续超范围修改；
- 附图是否体现逻辑架构而不是执行框图。

### 3.2 参考案学习结论

参考的智能座舱多模态案中，代理人不是简单把文字“洗得像人”，而是把原交底书中的具体实现：

- 具体传感器；
- MFCC、MediaPipe、MobileNetV3、Transformer；
- 具体权重值；
- 具体模型参数；

上位为：

- 多模态交互数据；
- 行驶数据；
- 初步响应程度；
- 用户历史交互数据；
- 信息贡献量；
- 目标响应程度；
- 控制指令。

该模式要迁移到 CorpusFlow：

- 主案不要把独权写死为具体文件名、具体字段名、具体 qualityScore 公式。
- 第二案不要把独权写死为阻尼公式、`exploration_floor`、`delta_max`、`fission_trace` 全字段。
- 具体实现进入实施例或从属权利要求，用于支撑而不是限制独权。

### 3.3 两案优先级

P0：失败证据数据资产生成方法及系统

- 与代码和产品最贴近。
- 已有权利要求草案骨架、代理人一页纸、事实锁定表、待实现项。
- 最适合先返工。

P1：语义自由度预算的语料裂变控制方法及系统

- 技术概念完整。
- 更容易被质检认为概念密度高、AI 味重。
- 应先补强可执行表格式实施例，再考虑正式返工。

## 4. 已知风险和边界

### 4.1 主案风险

主案路径：

- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/说明-失败证据数据资产生成方法及系统-20260528183806.md`
- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/说明-权利要求草案骨架-20260528190717.md`
- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/说明-待实现项-交底书对齐.md`

主要风险：

- `expectationSource / expectationConfidence` 是否作为正式技术特征仍需确认。
- `tool_argument_error` 目前不应进入独权。
- `review_tasks.jsonl` 不应写成已实现事实，除非代码补齐。
- `qualityScore` 和 `clusterPurity` 若没有数值实现，应改为质量状态、质量条件或可选实现。
- 独权应聚焦“失败证据到用途分流资产包”，污染防控、人工复核、具体质量公式放从权或实施例。

主案独权主链建议详见：

- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-red-blue-review.md`

### 4.2 第二案风险

第二案路径：

- `docs/superpowers/patents/disclosures/语义骨架双路径可控扩写方法及系统/说明-一种基于语义自由度预算的语料裂变控制方法及系统-20260611113658.md`

主要风险：

- 概念密度高：自由度、账本、预算、投影、反馈回写、裂变轨迹同时出现。
- 缺少“最小可运行样例”。
- 公式较多，但发明人事实和真实样本证据不足。
- 独权主线过长，应压缩为 6-8 个步骤。
- 实体池、在线检索、模板填槽不能作为核心，否则会退化为普通语料扩写。

第二案需要先补三类表格式实施例：

- “把空调调到 22 度”；
- “找附近的店，但不要便利店”；
- “不是的，在 QQ 音乐里播放”。

每个实施例应包含 seed、语义不变量、自由度、互斥/耦合约束、原始预算、投影后预算、生成样本、裂变轨迹、失败反馈、下一轮预算变化。

## 5. 下一步待办

### P0：主案事实锁定表 v2

建议新建：

- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/主案_事实锁定表_v2.md`

内容按以下列组织：

- 技术特征；
- 当前写法；
- 事实状态：已实现、部分实现、设计中、推演、删除；
- 证据来源：代码、docs、测试、发明人口述、代理人建议；
- 是否进独权；
- 处理建议。

优先核对的特征：

- 字段角色识别；
- 标准证据卡；
- 期望行为或候选期望行为；
- 失败信号提取；
- 工具参数错误；
- 问题族；
- 资产用途规划；
- 训练/评测/负例/复核分流；
- provenance；
- qualityScore 或质量状态；
- review task 或复核队列。

### P1：主案代理人一页纸 v2

建议新建：

- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/代理人一页纸_v2.md`

内容：

- 这项发明是什么；
- 核心技术问题；
- 独权主链；
- 必须进独权；
- 只能进从权；
- 不建议进权利要求；
- 已实现/未实现口径；
- 与普通 synthetic data generation 的区别；
- 需要代理人注意的第33条风险。

### P2：主案样章返工

建议新建：

- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/主案_技术问题与技术方案样章_v2.md`

先只改：

- B1 技术问题；
- B2.1 方法流程；
- 实施例二或实施例四；
- 附图说明。

不要直接全量改正文。先用样章确认口径。

### P3：第二案实施例补强表

建议新建：

- `docs/superpowers/patents/disclosures/语义骨架双路径可控扩写方法及系统/语义自由度账本实施例补强表.md`

目标：

- 把概念型表述变成可执行样例；
- 降低 AI 概念堆叠感；
- 增强第26条第3款充分公开支撑。

### P4：AI 使用与人工审查说明

建议最后生成：

- `docs/superpowers/patents/2026-07-10-ai-use-and-human-review-note.md`

内容：

- AI 在本轮工作中只用于阅读整理、风险审查、一致性检查；
- 技术方案和实施例必须由项目事实、代码、docs 或发明人口述确认；
- 不使用 BypassAIGC 或同类工具处理正式文本；
- 保留事实锁定表作为人工审查痕迹。

## 6. 建议下轮使用的技能

建议：

- `patent-disclosure-skill`：继续处理专利交底、事实锁定、样章修订。
- `investigation-first`：在改写前先核查代码和事实来源。
- `contradiction-analysis`：遇到保护范围 vs 实现真实性、独权宽度 vs 说明书支撑冲突时使用。
- `documents`：如果需要继续读取 Word 参考稿或生成 DOCX。
- `verification-before-completion`：最终声称完成提交包前使用。

不建议：

- 不使用 BypassAIGC 作为文本处理工具。
- 不以 GPTZero 分数作为主要验收标准。

## 7. 工作区状态提醒

当前 git worktree 已经存在大量未提交/未跟踪改动，许多并非本轮专利 handoff 任务产生。后续 agent 不应重置或回滚这些改动。

与本轮 handoff 直接相关的新文件是：

- `docs/superpowers/patents/交接-交接-交接-2026-07-10-corpusflow-patent-handoff.md`

此前专利返工相关的重要文件包括：

- `docs/superpowers/patents/设计-设计-设计-2026-07-03-ai-detection-red-blue-plan.md`
- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-redteam-report.md`
- `docs/superpowers/patents/说明-说明-说明-2026-07-03-corpusflow-patent-red-blue-review.md`

## 8. 下一位 agent 的第一步

直接从 P0 开始：创建并填写主案事实锁定表 v2。

第一批需要核查的代码/文档入口：

- `algorithm/src/app.py`
- `src/utils/evaluationMode.ts`
- `server.ts`
- `scripts/evaluation-agent-eval.ts`
- `scripts/evaluation-signal-audit.ts`
- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/说明-待实现项-交底书对齐.md`
- `docs/superpowers/patents/disclosures/失败证据数据资产生成方法及系统/说明-权利要求草案骨架-20260528190717.md`

输出时不要写“已经实现”除非代码或事实表能支撑。

