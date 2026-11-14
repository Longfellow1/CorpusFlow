# CorpusFlow 专利点挖掘与主案预览

日期：2026-05-28

## 结论

CorpusFlow 有专利机会，但主案不能写成“自动生成评测数据集”或“自动生成训练数据”。这些方向已有大量公开技术。

第一件专利应聚焦：

```text
真实失败证据
-> 标准化 EvidenceCase
-> failure signal / problem cluster
-> repair dataset planning
-> training / eval / negative / review assets
-> provenance-preserving asset package
```

这个组合更贴近 CorpusFlow 的实际差异，也能避开单纯 synthetic dataset generation 的拥挤现有技术。

## 候选专利点排序

| 排名 | 候选专利点 | 建议 |
| --- | --- | --- |
| P0 | 基于失败证据的可追溯训练与回归评测数据资产生成 | 第一件主案 |
| P1 | 基于语义骨架的可控训练语料扩写 | 第二件或从属保护 |
| P1 | 数据资产用途分流与污染防控 | 第一件从属或第三件分案 |
| P2 | 多源 trace/eval/log 的弱解析与 readiness 分级 | 第一件从属强化 |
| P2 | 人审状态与版本 lineage 驱动的数据资产发布 | 后续产品化保护 |

## 主案：基于失败证据的可追溯训练与回归评测数据资产生成

### 工作标题

```text
一种基于失败证据的可追溯训练与回归评测数据资产生成方法及系统
```

### 要解决的技术问题

现有 LLM/Agent 工程链路中，评测失败、线上反馈、trace 和 badcase 通常只能停留在日志、观测平台或人工表格中，难以稳定转化为可复核、可导出、可追溯的数据资产。

具体问题包括：

- 失败证据格式异构，字段不统一，不能直接进入训练或评测流水线。
- 失败原因需要人工判断，难以批量归类为可操作的问题族。
- 训练数据、回归评测数据和负例容易混淆，存在数据污染风险。
- 生成数据缺少 provenance，后续无法回答来源、为什么生成、由谁确认、用于什么目的。

### 核心技术方案

1. 证据导入与字段角色识别。
   - 输入可以是 CSV、JSONL、trace export、badcase 文档或测试失败记录。
   - 系统根据字段别名和内容特征识别 evidence roles。
   - 角色包括 input、actual、expected、context、tooling、judgment、runtime、annotation。

2. EvidenceCase 标准化。
   - 将异构证据归一化为 EvidenceCase。
   - EvidenceCase 包含 interaction、expectation、context、execution、judgments、annotation、metadata、provenance。
   - 每个 case 记录 source row、trace id、session id、字段映射和置信度。

3. 证据完整度分级。
   - 根据 input、actual、expected、judgment、annotation 等字段计算 A/B/C/D readiness。
   - A/B 可进入资产生成。
   - C 进入降级生成或人工复核。
   - D 不直接生成正式资产。

4. failure signal 提取。
   - 根据 evidence case 中的输入、输出、上下文、工具调用和失败备注识别 failure signal。
   - 示例信号包括 memory_missing、coreference_failed、tool_not_called、wrong_tool、constraint_missing、weak_answer、negative_emotion、safety_boundary、format_error、retrieval_miss、unknown_failure。

5. problem cluster 聚合。
   - 将失败 case 按主要 failure signal 和业务上下文聚合为问题族。
   - 每个问题族包含代表 case、失败信号、根因假设、质量置信度和是否需要人工复核。

6. repair dataset planning。
   - 系统为每个问题族推荐数据资产类型、schema、生成数量、策略模板和修复方向。
   - 数据资产类型包括 training_candidates、eval_cases、negative_cases。
   - schema 包括 alpaca、sharegpt_history、eval_case_jsonl。

7. 数据资产生成与分流。
   - 基于问题族和代表 case 生成训练候选、回归评测、边界负例。
   - 资产必须保留 assetType 和 strategyTemplate。
   - 防止训练数据和评测数据混用。

8. provenance asset package 导出。
   - 导出 training_candidates.jsonl、eval_cases.jsonl、negative_cases.jsonl、quality_report.json、provenance.json。
   - 每条资产绑定 sourceCaseId、sourceRowId、traceId、sessionId、clusterId、rootCauseHypothesis、strategyTemplate、generatedAt。

### 与现有技术的区别

已有技术通常覆盖以下单点：

- 从文档或知识库生成 RAG 评测数据集。
- 从生产 trace 建立 dataset 并运行实验。
- 对 LLM 输出进行多维评测。
- 对失败轨迹进行分析或训练。
- 通过观测平台记录 trace、score 和 annotation。

本方案的区别在于：

- 不是直接生成 synthetic QA，而是以真实失败证据为上游。
- 不是只保存 trace 到 dataset，而是抽取 EvidenceCase 并进行失败归因。
- 不是只跑 eval，而是将失败问题族转成修复数据规划。
- 不是只生成一种数据，而是对训练候选、回归评测、负例和人工复核进行用途分流。
- 不是只导出样本，而是导出带 provenance 的数据资产包。

### 可写入权利要求的关键步骤

独立方法权利要求可按以下结构展开：

```text
S1 获取至少一条 AI 应用失败证据；
S2 对失败证据进行字段角色识别，得到字段映射和角色置信度；
S3 基于字段映射构建标准化 EvidenceCase，并计算证据完整度；
S4 根据 EvidenceCase 提取至少一个 failure signal；
S5 按 failure signal 和证据上下文形成 problem cluster；
S6 为 problem cluster 生成修复数据规划；
S7 根据修复数据规划生成至少一种数据资产；
S8 生成包含数据资产与原始失败证据关联关系的 provenance 记录；
S9 导出包含数据资产、质量报告和 provenance 的数据资产包。
```

### 附图建议

1. 系统架构图。
   - Evidence Ingestion。
   - Evidence Normalizer。
   - Failure Signal Extractor。
   - Problem Cluster Planner。
   - Asset Generator。
   - Review & Export。

2. 方法流程图。
   - 导入证据。
   - 字段角色识别。
   - EvidenceCase 构建。
   - readiness 分级。
   - signal 提取。
   - cluster 聚合。
   - 数据资产规划。
   - 资产包导出。

3. 数据结构图。
   - EvidenceCase。
   - ProblemCluster。
   - EvalAssetRecord。
   - Provenance。

4. 防污染流程图。
   - asset intent 分离。
   - review 状态。
   - export contract。
   - downstream usage guard。

## 备选专利点一：基于语义骨架的可控训练语料扩写

### 工作标题

```text
一种基于语义骨架的训练语料可控扩写方法及系统
```

### 技术机会

该方向覆盖 CorpusFlow 的 fine-tune / quick task 链路。相比简单 paraphrase，本方案通过 generation_frame 保留复杂句中的语义单元、槽位和关系。

### 核心保护点

- 将 seed 解析为 intent、subject、action、object、modifiers 和 generation_frame。
- generation_frame 包含 units、slots、relations。
- 基于 units/slots 做同类泛化，而非整体改写或笛卡尔组合。
- 将任务级要求、seed 级解析、人工作业修改和风格要求统一进入生成 prompt。
- 采用 normal / robust 双路径生成，分别覆盖主流表达和边界表达。

### 风险

普通 query paraphrase、synthetic instruction generation 和 data augmentation 已非常多。该点适合作为第二件或从属权利要求，不建议作为第一件主案。

## 备选专利点二：数据资产用途分流与污染防控

### 工作标题

```text
一种面向 AI 应用失败样本的数据资产质量门控与污染防控方法
```

### 技术机会

训练数据、评测数据和负例如果由同一失败证据生成，必须有用途分离和 provenance，否则容易造成训练/评测污染。

### 核心保护点

- 基于 assetIntent 或 assetType 将数据资产分为训练候选、回归评测、负例和人工复核。
- 不同用途对应不同 schema 和质量门槛。
- 低完整度证据只能进入 review queue，不能直接成为 gold/regression。
- 记录来源、生成策略、人审状态、导出版本。
- 导出前检查重复、来源泄漏、训练/评测集合冲突。

## 需要向公司或代理人确认的问题

1. 发明人排序。
2. 申请人是否为公司。
3. 是否已有外部公开披露，包括 GitHub public 时间、比赛材料、路演视频、微信群/公众号文章。
4. 是否需要优先提交一件主案，还是同时准备主案和分案。
5. 是否已有代理机构，还是公司知识产权部门直接撰写权利要求。
6. 是否需要在提交后恢复开源。
7. 是否有真实客户/业务数据可以脱敏作为实施例。

## 提交前最低材料包

- 本文的主案方向确认。
- 查新对比表。
- 技术交底书。
- 系统架构图。
- 流程图。
- 数据结构图。
- 脱敏实施例。
- 发明人/申请人信息。
- 公开披露说明。
- 研发证据封存记录。

## 查新初筛命中资料

### 高相关公开专利

- CN119046424A：大模型测试数据集自动生成，多对话智能体生成与评分。
  来源：https://patents.google.com/patent/CN119046424A/zh
- CN117785664A：自动化大模型评测，多维度评测与结构化结果。
  来源：https://patents.google.com/patent/CN117785664A/zh
- CN118195032A：交互数据生成 QA 评估数据集并制定优化计划。
  来源：https://patents.google.com/patent/CN118195032A/zh
- US20250156644A1：面向特定领域或知识库的合成 QA 数据生成。
  来源：https://patents.google.com/patent/US20250156644A1/zh
- US11593255B2：生产用户动作记录生成回归测试用例。
  来源：https://patents.google.com/patent/US11593255B2/en
- US10241897B2：基于生产路径和测试路径比较识别测试缺口。
  来源：https://patents.google.com/patent/US10241897B2

### 国知局公布公告初筛命中

- CN120873150A：评测结果的确定方法和装置、存储介质和电子设备。
- CN119962489A：评测数据集生成方法、装置及存储介质。
- CN122045810A：一种基于多智能体的训练数据生成方法与服务器。
- CN122087121A：基于心理过程建模的训练数据生成方法、装置和电子设备。

### 相近工具

- Langfuse：trace-to-dataset、annotation、experiment。
- Phoenix：trace、dataset、experiment、fine-tuning export。
- Opik：trace、feedback score、dataset、experiment、Ollie root-cause。
- DeepEval：golden/test case/synthetic dataset。
- Ragas：RAG testset generation。
- promptfoo：eval/red-team/test generation。
- OpenPipe：logs-to-training dataset。

## 推荐下一步

先确认第一件主案方向，再进入技术交底书。

建议确认语：

```text
确认第一件主案按“基于失败证据的可追溯训练与回归评测数据资产生成方法及系统”推进。
```

确认后即可补齐联系人和发明人信息，并生成交底书初稿。
