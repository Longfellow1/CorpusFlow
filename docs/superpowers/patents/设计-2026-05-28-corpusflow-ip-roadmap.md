# CorpusFlow 知识产权组合推进路线

日期：2026-05-28

## 当前状态

- GitHub 仓库已转为 private。
- 项目已具备可提交发明专利的技术主题，但不宜主张“自动生成评测数据集”这个宽泛方向。
- 第一件专利应围绕“失败证据到可追溯数据资产”的完整管线，避开已有的 RAG 评测数据集生成、LLM synthetic golden、trace-to-test-case 等拥挤方向。

## 总体策略

推荐采用三条线并行、公开节奏串行：

1. 发明专利优先提交，先锁定申请日。
2. 软著并行准备，用于证明软件成果与项目完成度。
3. 论文和重新开源放在专利申请日之后，不在申请前公开核心技术细节。

建议顺序：

```text
转 private
-> 研发证据封存
-> 专利点挖掘
-> 查新对比
-> 技术交底书
-> 公司在线系统提交发明专利
-> 软著提交
-> 论文/开源披露审查
```

## 发明专利规划

可以按两件发明专利推进，但两件必须对应不同技术问题和不同独立权利要求主题，不能把同一“自动生成数据集”方案拆成两份近似申请。

### 第一件主案

工作标题：

```text
一种基于失败证据的可追溯训练与回归评测数据资产生成方法及系统
```

保护对象：

- 方法。
- 系统/装置。
- 电子设备。
- 计算机可读存储介质。

核心保护点：

- 异构失败证据归一化为标准 EvidenceCase。
- 字段角色识别：input、actual、expected、context、tooling、judgment、annotation。
- 证据完整度或 readiness 分级。
- failure signal 提取和 problem cluster 聚合。
- 基于问题族生成修复数据规划。
- 同源失败证据分流生成训练候选、回归评测、负例和人工复核资产。
- 每条资产保留 provenance、生成策略、来源 case、问题族、人工状态和导出契约。
- 防止训练数据与评测数据污染的 asset intent 分离机制。

### 第二件备选分案

工作标题：

```text
一种基于语义骨架的训练语料可控扩写方法及系统
```

保护对象：

- generation_frame。
- units / slots / relations。
- 常态泛化与鲁棒增强双路径。
- seed 级与任务级控制条件进入最终 prompt 的约束机制。

适合在第一件主案提交后，根据代理人建议作为分案或第二件申请。

### 第三件备选分案

工作标题：

```text
一种面向 AI 应用失败样本的数据资产质量门控与污染防控方法
```

保护对象：

- 证据完整度分级。
- 资产用途分离。
- 人工复核状态机。
- provenance 校验。
- 重复度、覆盖增益和训练/评测污染防控。

## 两件发明专利的推荐拆分

### 发明一：失败证据到可追溯数据资产

名称建议：

```text
一种基于失败证据的可追溯训练与回归评测数据资产生成方法及系统
```

核心问题：

- 真实 badcase、trace、eval failure 难以变成可复核、可导出的训练和回归数据资产。

独立权利要求主线：

```text
失败证据导入
-> 字段角色识别
-> EvidenceCase 标准化
-> readiness 分级
-> failure signal 提取
-> problem cluster 聚合
-> repair asset planning
-> 训练候选/回归评测/负例资产生成
-> provenance asset package 导出
```

应放入从属保护的内容：

- 数据资产用途分流。
- 训练/评测污染防控。
- 人工复核状态。
- provenance 校验。
- 质量报告。

### 发明二：语义骨架驱动的可控语料扩写

名称建议：

```text
一种基于语义骨架与双路径生成的训练语料可控扩写方法及系统
```

核心问题：

- 普通 paraphrase 或 synthetic data generation 容易丢失复杂 seed 的条件、否定、指代、纠偏、排除项和多任务关系，生成结果不可控。

独立权利要求主线：

```text
seed 输入
-> intent / 五元组摘要
-> generation_frame 构建
-> units / slots / relations 解析
-> 同类槽位扩展
-> 任务级与 seed 级控制条件合并
-> normal / robust 双路径生成
-> 轻量过滤和导出
```

应避免写得过宽：

- 不主张“基于大模型生成语料”本身。
- 不主张普通同义改写。
- 不把第一件的 failure evidence / provenance asset package 主线混进独立权利要求。

### 不建议作为第二件独立申请的方向

```text
一种面向 AI 应用失败样本的数据资产质量门控与污染防控方法
```

该方向有价值，但与第一件主案强相关，更适合放在第一件的从属权利要求或后续分案。若直接作为第二件，容易与第一件边界重叠。

## 软通模板填充方式

公司模板路径：

```text
/Users/Harland/Downloads/专利技术交底书模板（软通）.docx
```

已转换为临时 Markdown 供结构读取：

```text
tmp/patent-template/备忘-备忘-备忘-softtone-disclosure-template.md
```

后续交底书按该模板组织：

- 发明名称：按两件专利分别填写。
- 申请类型：勾选发明。
- 第一/第二技术联系人、电话、邮箱、部门：保留待填写。
- 一、技术领域：写具体应用领域。
- 二、背景技术：按 A1/A2/A3 写现有技术、最接近现有技术、缺陷。
- 三、发明内容：按 B1/B2/B3/B4 写技术问题、技术方案及区别、技术效果、创新点。
- 四、专利附图：提供系统框图、流程图、数据结构图。
- 五、具体实施方式：按步骤 S1... 展开，发明不少于 1500 字。
- 六、替代方案：扩展可替代实现方式。
- 七、其他事项：公开时间和初稿期望时间由用户填写。

模板中标注“不得使用 AI 生成”的章节，后续输出应作为技术底稿，由技术负责人逐项核验、改写和确认事实后再进入公司提交系统。

## 软著规划

建议软件名称：

```text
CorpusFlow AI 失败证据数据资产构建平台 V1.0
```

软著目标：

- 保护软件代码和文档表达。
- 支撑比赛、项目申报、客户沟通或公司资产登记。
- 证明软件已经开发完成。

建议准备材料：

- 软件源程序鉴别材料。
- 软件说明书、用户手册或设计说明书。
- 主要功能截图。
- 版本号、开发完成日期、首次发表状态。
- 著作权人主体信息。
- 开发人员与权属说明。

软著不替代发明专利。软著不保护“失败证据到数据资产”的技术思想，只保护软件表达。

## 论文规划

建议论文标题：

```text
Failure-to-Dataset Pipeline: Turning LLM/Agent Failure Evidence into Provenance-Preserving Training and Regression Assets
```

公开策略：

- 专利提交前不发预印本、不公开完整方法图、不公开核心模块细节。
- 专利提交后再写论文公开版。
- 论文重点放在系统设计、实验证据、数据资产质量、用户工作流评估。

建议论文结构：

1. Introduction：LLM/Agent 失败证据难以回流为训练和回归资产。
2. Related Work：LLM eval、observability、synthetic testset、labeling、fine-tuning。
3. Method：EvidenceCase、failure signal、problem cluster、repair asset planning、provenance。
4. System：CorpusFlow 架构。
5. Experiments：真实 badcase fixture、归因准确性、资产可用性、人审通过率。
6. Discussion：与 Langfuse/Phoenix/Opik/DeepEval/Ragas 的边界。

## 公司在线提交系统之外需要准备的材料

### 专利基础信息

- 申请人名称。
- 统一社会信用代码。
- 申请人地址。
- 联系人姓名、电话、邮箱。
- 发明人姓名、身份证件信息、排序。
- 是否需要请求提前公开或实质审查。
- 是否委托代理机构。

### 技术交底材料

- 技术领域。
- 背景技术和现有问题。
- 最接近现有技术。
- 本方案要解决的技术问题。
- 完整技术方案。
- 系统模块说明。
- 方法流程说明。
- 关键参数和数据结构。
- 实施例。
- 技术效果。
- 保护点。
- 附图。

### 研发证据封存

- 当前 private 仓库 commit hash。
- 核心代码目录清单。
- README、架构文档、PRD 文档快照。
- 关键界面截图。
- 运行结果、导出资产包示例。
- 公开历史说明：GitHub 公开时间、转 private 时间、是否有 release、是否有 fork、是否有比赛公开材料。

### 查新材料

现有公开资料已初筛到以下高相关方向，交底书中需逐项区分：

- RAG 评测数据集生成。
- LLM synthetic golden/testset generation。
- 生产日志或 trace 自动生成回归测试用例。
- agent trace failure taxonomy。
- negative trajectory 用于训练改进。
- observability/eval 平台中的 trace-to-dataset 工作流。

## 一周执行计划

### Day 1

- 确认申请主体、发明人、联系人。
- 封存当前代码与文档快照。
- 确认是否存在公开披露材料。

### Day 2

- 完成专利点挖掘表。
- 确认第一件主案标题和保护范围。
- 补充查新关键词和相近文献表。

### Day 3-4

- 生成技术交底书初稿。
- 画系统框图、流程图、资产包结构图。
- 准备实施例和脱敏样例。

### Day 5

- 内部评审权利要求方向。
- 与代理人或公司知识产权人员沟通。
- 按反馈修改交底书。

### Day 6-7

- 在线提交系统录入。
- 同步准备软著申请材料。
- 论文大纲只保留内部版。

## 公开与保密规则

- 专利申请日前，不公开核心流程、系统图、权利要求式描述和完整交底书。
- 私有仓库继续可开发，但避免给外部人员开放访问。
- 对比赛、客户、合作方材料采用抽象叙事，不展示完整技术链路。
- 提交专利后，再决定 README、论文和开源节奏。

## 参考公开资料

- Langfuse Datasets: https://langfuse.com/docs/evaluation/features/datasets
- Phoenix Overview: https://arize.com/docs/phoenix
- Opik Observability: https://www.comet.com/docs/opik/tracing/overview
- DeepEval Synthetic Data: https://deepeval.com/docs/synthetic-data-generation-introduction
- Ragas Testset Generation: https://docs.ragas.io/en/stable/concepts/test_data_generation/
- CN119046424A: https://patents.google.com/patent/CN119046424A/zh
- CN118195032A: https://patents.google.com/patent/CN118195032A/zh
- US11593255B2: https://patents.google.com/patent/US11593255B2/en
