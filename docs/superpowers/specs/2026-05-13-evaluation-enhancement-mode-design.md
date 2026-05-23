# CorpusFlow 评测增强模式产品定义与功能模块

日期：2026-05-13

## 1. 背景与定位修正

CorpusFlow 已进入 NEXTAI 赛事赛道三「研发效能·提质增效」复赛。复赛版本需要在现有「可控语料生成」基础上，形成更清晰的技术价值与业务闭环。

此前 `2026-05-12-corpusflow-evaluation-enhancement-definition.md` 已明确一个重要边界：

```text
CorpusFlow 不做完整评测平台。
```

这个判断仍然成立。CorpusFlow 不应扩展为 Eval Runner、LLM Judge、报告中心、CI Gate 或基线对比平台。

但原先对「评测增强模式」的表达仍偏弱。如果只是用规则把 failed 样本筛出来，再按字段分组生成相似数据，这个能力更接近数据整理工具，无法支撑「评测增强」的产品心智，也不足以体现赛道三要求的技术价值。

因此，本设计将评测增强模式修正为：

```text
基于模型推理的 badcase 诊断与数据修复工作流。
```

它不负责运行评测，也不自动证明真实根因；它负责从评测失败和业务反馈中发现问题族，生成可解释、可复核的根因假设，并产出下一轮训练与回归评测可用的数据资产。

## 2. 一句话定义

```text
CorpusFlow 评测增强模式，让每一次 badcase 都沉淀为可诊断、可复核、可生成、可导出的训练与评测数据资产。
```

面向复赛路演的口语表达：

```text
企业 AI 应用上线后，真正难的是失败样本怎么回流。CorpusFlow 用模型推理把 badcase 聚成问题族，解释可能根因，并自动生成下一轮训练和回归评测数据。
```

## 3. 产品边界

### 3.1 做什么

- 导入评测结果、用户反馈、测试失败样本、人工 badcase 表。
- 识别并映射输入字段。
- 发现显性和隐性 badcase。
- 对 badcase 做语义聚类。
- 为每个问题族生成失败模式、根因假设和修复策略。
- 基于修复策略生成训练样本、回归评测样本、负例样本和人工标注候选。
- 保留来源、聚类、诊断和生成配置，形成可追溯资产。
- 输出质量体检报告和组合数据包。

### 3.2 不做什么

- 不运行完整评测任务。
- 不做正式 LLM Judge 平台。
- 不自动决定模型是否达标。
- 不做发布 Gate 或 CI 集成。
- 不做模型训练和自动微调。
- 不声称自动证明业务真实根因。
- 不替代测试、算法或业务专家的最终判断。

核心原则：

```text
模型负责推理与建议，人负责确认与采用。
```

## 4. 目标用户与使用场景

### 4.1 测试团队

触发场景：

- 新模型或新 Agent 版本评测后出现失败样本。
- 回归测试集覆盖不足。
- 多轮、约束、边界场景需要补充。

获得价值：

- 从失败样本自动形成问题族。
- 快速生成下一轮回归评测集。
- 减少人工读表、归类、补写 expected behavior 的时间。

### 4.2 算法工程师

触发场景：

- 线上或离线评测发现能力短板。
- 已知 badcase 分散在日志、表格、飞书文档或测试记录中。
- 需要构造 SFT / DPO / 指令修复候选数据。

获得价值：

- 看到失败样本背后的共性问题。
- 获得带 provenance 的训练候选数据。
- 将 badcase 修复过程沉淀为可复用数据资产。

### 4.3 数据 PM / 产品同学

触发场景：

- 用户反馈集中暴露某类能力缺口。
- 需求表达、知识库问答、业务 SOP 场景需要补充样本。

获得价值：

- 用更低门槛把业务反馈转化为结构化数据任务。
- 参与人工复核，而不是手工写全量样本。

## 5. 核心工作流

```text
导入评测结果 / badcase
-> 字段识别与映射
-> Badcase 发现
-> 语义聚类
-> 问题族诊断
-> 修复策略推荐
-> 针对性数据生成
-> 人工复核
-> 质量体检报告
-> 组合资产导出
```

这个流程与现有 CorpusFlow 的关系：

```text
Quick Task：我有一批普通 seeds，需要快速扩写
Fine-Tune Generation：我有高价值 seeds，需要可控生成
Evaluation Enhancement：我有失败样本，需要诊断问题族并生成修复数据
```

三者不是互相割裂的模式，而是数据生产成熟度的三个阶段。

## 6. 功能模块设计

### 6.1 证据导入模块

目标：接收来自评测、测试、反馈、日志整理后的 badcase 文件。

支持输入：

- CSV
- JSON
- JSONL
- 手动粘贴表格文本

典型字段：

```text
id
query
expected
actual
score
passed
error_type
category
trace_id
model_version
source
created_at
```

复赛 P0 只需要稳定支持 CSV 与内置样例数据。JSON / JSONL 可作为后续增强。

### 6.2 字段识别与映射模块

目标：把不同来源的字段映射到 CorpusFlow 内部数据契约。

系统能力：

- 自动识别 `query`、`expected`、`actual`、`score`、`passed` 等常见字段。
- 对无法确定的字段给出候选映射。
- 允许用户手动确认和修正。

内部标准结构：

```json
{
  "sourceCaseId": "A-Q-04",
  "query": "我快没油了，帮我找一个顺路的加油站，不要绕太远",
  "expected": "推荐顺路加油站，并说明绕行成本和到达方式",
  "actual": "为你推荐附近加油站",
  "score": 0.42,
  "passed": false,
  "category": "车载助手",
  "errorType": "constraint_missing",
  "traceId": "trace_001",
  "modelVersion": "demo-agent-v1"
}
```

### 6.3 Badcase 发现模块

目标：不仅识别显式失败，也识别隐性失败。

规则层发现：

- `passed = false`
- `score < threshold`
- `error_type` 非空
- `actual` 缺失或格式异常

模型推理层发现：

- 回答是否偏离用户意图。
- 是否遗漏 expected 中的关键约束。
- 是否答非所问。
- 是否缺少必要追问。
- 是否产生不可验证或过度承诺的结论。
- 是否不符合下游评测格式。

模型输出示例：

```json
{
  "isBadcase": true,
  "confidence": 0.86,
  "failureSignals": [
    "遗漏用户要求的顺路约束",
    "未说明绕行成本",
    "只给出泛化推荐"
  ],
  "suggestedErrorType": "constraint_missing"
}
```

产品约束：

- 模型判断必须可解释。
- 低置信度结果进入人工复核。
- 不把模型判断作为不可修改的最终事实。

### 6.4 语义聚类模块

目标：把离散 badcase 聚成可行动的问题族。

聚类依据：

- Query 语义相似度。
- Expected / Actual 差异。
- 模型提取的 failureSignals。
- 业务 category。
- errorType。

推荐实现分层：

```text
规则预分桶：category / errorType / passed
-> embedding 或文本相似度聚合
-> LLM 给 cluster 命名和解释
```

聚类输出示例：

```json
{
  "clusterId": "cluster_route_constraint_001",
  "clusterName": "路线与补能场景中遗漏用户约束",
  "caseCount": 8,
  "dominantCategory": "车载助手",
  "failureSignals": [
    "忽略绕行成本",
    "未处理限行或拥堵约束",
    "未解释推荐依据"
  ],
  "representativeCaseIds": ["A-Q-04", "A-Q-07"]
}
```

复赛 P0 可以先用轻量相似度 + LLM 命名，不追求复杂无监督聚类平台。

### 6.5 问题族诊断模块

目标：对每个 cluster 生成一张「诊断卡片」。

诊断卡片包含：

- 问题族名称。
- 共性失败模式。
- 证据样本。
- 可能根因。
- 对业务的影响。
- 建议修复方向。
- 推荐生成的数据资产类型。

示例：

```json
{
  "clusterName": "路线与补能场景中遗漏用户约束",
  "failurePattern": "模型能识别目的地或补能意图，但经常忽略用户提出的顺路、绕行、限行、老人出行等复合约束。",
  "likelyRootCauses": [
    "训练数据中复合约束样本不足",
    "评测集中缺少多条件路线规划覆盖",
    "expected behavior 未显式要求解释决策依据"
  ],
  "businessImpact": "车载助手在导航和补能场景中可能给出看似可用但不符合真实出行约束的建议。",
  "repairStrategy": "补充多约束、多目标、需要解释原因的路线规划与补能推荐样本。",
  "recommendedOutputs": [
    "training_candidate",
    "regression",
    "gold_candidate"
  ]
}
```

产品措辞必须使用「可能根因」「根因假设」「建议策略」，避免承诺模型可以自动证明真实根因。

### 6.6 修复策略推荐模块

目标：把诊断结果转成可执行的数据生成 recipe。

策略类型：

- 同意图改写。
- 复合约束增强。
- 边界条件补充。
- 多轮追问构造。
- 负例 / 反例构造。
- expected behavior 补全。
- eval_points 补全。
- gold candidate 生成。

策略示例：

```json
{
  "strategyId": "repair_route_constraints",
  "targetAbility": "复合约束理解与路线推荐",
  "generationPlan": [
    "围绕顺路、绕行、拥堵、限行、老人出行等约束生成变体",
    "每条样本必须包含 expected_behavior",
    "每条样本必须包含 2-4 个 eval_points",
    "部分样本构造成多轮追问"
  ],
  "outputMix": {
    "training_candidate": 0.5,
    "regression": 0.4,
    "negative": 0.1
  }
}
```

### 6.7 针对性数据生成模块

目标：基于 badcase、cluster 诊断和修复策略生成下一轮数据。

生成输入：

```text
原始 badcase
+ 失败信号
+ 问题族诊断
+ 根因假设
+ 修复策略
+ 输出数据契约
```

生成输出：

```json
{
  "id": "enhanced_001",
  "sourceCaseId": "A-Q-04",
  "clusterId": "cluster_route_constraint_001",
  "assetIntent": "regression",
  "instruction": "我快没油了，但前面高架很堵，帮我找一个不用绕太远的加油站",
  "expectedBehavior": "推荐顺路或轻微绕行的加油站，并说明距离、绕行成本和拥堵风险。",
  "evalPoints": [
    "是否识别补能需求",
    "是否考虑拥堵约束",
    "是否说明绕行成本",
    "是否避免只推荐最近地点"
  ],
  "riskTags": ["出行安全", "位置服务"],
  "provenance": {
    "sourceFile": "demo_badcases.csv",
    "sourceRowId": "A-Q-04",
    "failureType": "constraint_missing",
    "generationStrategy": "repair_route_constraints"
  }
}
```

### 6.8 人工复核模块

目标：让模型推理结果和生成结果可控、可采纳、可追溯。

复核对象：

- badcase 判断。
- cluster 命名。
- 根因假设。
- 修复策略。
- 生成样本。

状态：

```text
accepted
rejected
edited
needs_review
```

原则：

- 所有模型产出的诊断和生成内容都可以被人工修改。
- 被拒绝的数据进入 rejected 导出，保留拒绝原因。
- 被修改的数据保留原始生成内容和修改后内容。

### 6.9 质量体检报告模块

目标：为复赛和真实使用提供量化结果。

报告指标：

```text
原始样本数
识别成功数
显式失败数
模型发现隐性失败数
问题族数量
生成样本数
保留样本数
拒绝样本数
字段完整率
格式通过率
人工复核通过率
预计节省人工整理时间
```

报告示例：

```json
{
  "sourceCases": 42,
  "mappedCases": 42,
  "explicitBadcases": 18,
  "modelDiscoveredBadcases": 7,
  "clusters": 5,
  "generatedAssets": 96,
  "acceptedAssets": 81,
  "formatPassRate": 0.98,
  "estimatedManualHoursSaved": 6.5
}
```

复赛中，这个模块用于回答「效果如何量化」。

### 6.10 组合资产导出模块

目标：把结果从页面演示变成工程资产。

建议导出结构：

```text
corpusflow-eval-enhancement-export.zip
├── train_alpaca.jsonl
├── eval_cases.jsonl
├── negative_cases.jsonl
├── rejected_cases.csv
├── cluster_diagnosis.json
├── quality_report.json
└── provenance.json
```

导出意图：

- `training_candidate`
- `regression`
- `negative`
- `gold_candidate`
- `silver_candidate`

## 7. AI 能力设计

评测增强模式需要明确体现模型推理，不应包装成纯规则流程。

### 7.1 模型参与点

```text
字段语义识别
隐性 badcase 判断
失败信号提取
语义聚类命名
问题族诊断
根因假设生成
修复策略推荐
针对性样本生成
eval_points 生成
质量解释摘要生成
```

### 7.2 模型输出要求

- 必须结构化输出。
- 必须包含置信度或可解释理由。
- 必须保留证据样本引用。
- 必须允许人工覆盖。
- 不允许直接输出不可追溯的结论。

### 7.3 技术叙事

```text
规则负责稳定性，模型负责理解和推理，人工负责确认和采纳。
```

这个叙事能同时回应：

- 工程完成度。
- AI 技术价值。
- 业务可控性。
- 安全与可靠性。

## 8. 复赛版本范围

### 8.1 P0 必做

- 新增「评测增强」入口。
- 内置一组车载 / 测试 / 企业知识库 badcase 样例。
- CSV 导入和字段映射。
- 显式 badcase 筛选。
- 模型辅助 badcase 判断。
- 问题族聚类和命名。
- 诊断卡片。
- 修复策略推荐。
- 针对性生成评测样本。
- 质量体检报告。
- 导出 `eval_cases.jsonl`、`quality_report.json`、`cluster_diagnosis.json`。

### 8.2 P1 可选

- 训练样本与评测样本混合导出。
- 多轮 badcase 模板。
- 负例样本生成。
- 人工编辑后保留 diff。
- 按 model_version 对比不同版本失败分布。

### 8.3 暂不做

- 真正运行评测。
- 自动评分平台。
- 完整 embedding 向量库。
- 跨任务长期趋势看板。
- CI / 发布门禁。
- 模型训练和部署闭环。

## 9. 示例演示主线

复赛建议使用车载助手 badcase：

```csv
id,category,query,expected,actual,passed,error_type
A-Q-04,车载助手,我快没油了，帮我找一个顺路的加油站，不要绕太远,推荐顺路加油站，并说明绕行成本和到达方式,为你推荐附近加油站,false,constraint_missing
A-Q-07,车载助手,如果现在外环有事故但内环也在限行，我又不想走特别窄的小路，请帮我规划一条从张江到静安寺附近的路线，最好能解释为什么这么走,综合拥堵、限行、道路偏好生成路线，并解释决策依据,已为你规划到静安寺的路线,false,constraint_missing
D-Q-06,企业知识库,线上告警显示订单服务 P95 延迟升高，但错误率没明显变化，客服同时反馈部分用户支付后订单页刷新慢，我需要先看哪些指标，怎么判断是数据库、缓存还是下游支付回调的问题,拆解性能告警、用户反馈和排查路径，给出指标优先级和定位思路,建议先重启订单服务,false,diagnosis_shallow
```

演示路径：

```text
导入 badcase 表
-> 系统识别字段
-> 模型发现失败信号
-> 聚类为「复合约束遗漏」「诊断过浅」等问题族
-> 展示诊断卡片
-> 一键生成回归评测样本
-> 展示质量报告
-> 导出资产包
```

## 10. 评分维度映射

### 技术价值

- 模型推理参与 badcase 判断、聚类命名、根因假设和修复策略。
- 不是简单 prompt 生成，而是 failure-driven 的数据生产链路。

### 复用性与扩展性

- 输入可以来自评测结果、用户反馈、测试失败记录。
- 场景可扩展到座舱、售后、测试、需求、知识库、研发 Agent。
- 输出格式可进入训练、回归评测、人工标注和数据归档流程。

### 性能 / 效率提升

- 缩短人工读 badcase、归类、写 expected、补 eval_points 的时间。
- 通过质量报告展示样本数、保留率、字段完整率和预计节省时间。

### 业务支撑能力

- 解决企业 AI 应用上线后的共同问题：失败样本如何回流成下一轮训练与评测资产。
- 支撑模型迭代、回归测试和能力补齐。

### 现场演示效果

- 从一张 badcase 表开始，现场看到问题族、根因假设、修复策略、增强数据和导出包。
- 评委能直观看到「失败 -> 诊断 -> 修复数据」闭环。

## 11. 风险与约束

### 11.1 模型诊断不稳定

风险：模型可能给出过度推断或不准确根因。

约束：

- 使用「根因假设」而不是「根因结论」。
- 输出必须引用证据样本。
- 低置信度结果进入人工复核。

### 11.2 产品范围膨胀

风险：容易滑向完整 EvalOps 平台。

约束：

- 不做 runner、judge、report center、CI gate。
- 只做失败证据到修复数据之间的桥梁。

### 11.3 演示链路过长

风险：10 分钟内讲不完。

约束：

- 复赛演示只展示一个主场景。
- 所有复杂能力压缩到诊断卡片和质量报告中表达。

## 12. 当前产品决策

1. 评测增强模式必须依赖模型推理，纯规则方案不足以成立。
2. 规则层负责字段、筛选、格式、导出等确定性工作。
3. 模型层负责发现隐性 badcase、聚类命名、失败模式提取、根因假设和修复策略。
4. 人工层负责确认、编辑和采纳。
5. 复赛 P0 聚焦可演示闭环，不扩展为完整评测平台。

## 13. 待评审问题

1. 「基于模型推理的 badcase 诊断与数据修复工作流」是否作为复赛主定位。
2. P0 是否只做 CSV + 内置样例，暂不扩展复杂数据源。
3. 聚类是否接受先做轻量实现，复赛阶段重点展示 cluster 诊断卡片。
4. 质量报告的指标是否足够支撑量化证明。
5. 导出包是否优先支持 `eval_cases.jsonl`、`quality_report.json`、`cluster_diagnosis.json`。
