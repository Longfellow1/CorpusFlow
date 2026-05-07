# CorpusFlow 二阶段算法链路收敛方案

*更新日期：2026-04-30*

## 0. 结论

二阶段先不做重型语义工程，不引入 embedding/cosine，不引入 NLI/LLM judge，不引入 HanLP/OpenHowNet。当前最重要的是把“五元组拆解 -> 仿写 -> 批量生成”的链路做稳。

五元组的本质不是做通用 NLP 归一化，而是给下游 LLM 一个收敛方向：它告诉模型原始 query 的意图、动作、对象、修饰条件是什么。仿写的本质也不是机械同义改写，而是形成一批可供批量生成参考的 few-shot 表达。最终批量生成吃的是 Reference Pack：原始 query、用户确认后的五元组、已确认仿写、任务要求。

## 1. 设计原则

1. 五元组只服务下游消费，不做通用类型系统。
2. 用户置灰的字段不传给下游 LLM，而不是传一个 `must_keep=false`。
3. 仿写输出保持简单，避免复杂对象数组影响 LLM 输出稳定性。
4. 批量生成不使用 `object.swappable` 这类限制，避免锁死泛化能力。
5. 前端不新增复杂算法展示，用户只看结果。
6. 工程侧只做低成本过滤：空值、重复、明显冲突。

## 2. 当前链路目标

```text
Seed Query
  -> 五元组解析
  -> 用户编辑/置灰
  -> 构造 Reference Pack
  -> 仿写生成
  -> 仿写结果进入 Reference Pack
  -> 批量生成
  -> 轻量过滤/去重
  -> 导出
```

## 3. 五元组解析

### 3.1 输出结构

保持简单：

```json
{
  "intent": "用户希望调节车内空调温度",
  "subject": "用户",
  "predicate": "调节",
  "object": "空调温度",
  "modifiers": "25度"
}
```

当前代码字段名里 `predicate` 对应 `action`，短期可以继续保留 `action` 字段，避免大改前端和数据结构。

### 3.2 不做的事

二阶段不做这些：

- `predicate normalized`
- `object type`
- `modifier type`
- `must_keep`
- `swappable`
- `semantic_step`
- embedding/cosine similarity

这些抽象通用性不足，且容易把当前问题变成 NLP 基础设施工程。

### 3.3 五元组用途

五元组只用于 prompt 拼装：

```text
原始 query：
打开空调到25度

语义参考：
- 意图：用户希望调节车内空调温度
- 主体：用户
- 动作：调节
- 对象：空调温度
- 修饰：25度
```

它的作用是让 LLM 在仿写和批量生成时别跑偏，而不是让工程侧强行判定语义。

## 4. 用户编辑与置灰

### 4.1 用户编辑

用户修改五元组字段后，下游直接使用用户编辑后的版本。

### 4.2 用户置灰

置灰字段不进入下游 prompt。

置灰前：

```text
语义参考：
- 动作：调节
- 对象：空调温度
- 修饰：25度
```

置灰后：

```text
语义参考：
- 动作：调节
- 修饰：25度
```

注意：不是告诉 LLM “对象不重要”，而是根本不给 LLM 看这个字段。

## 5. Reference Pack

Reference Pack 是下游统一输入。

```json
{
  "seed": "打开空调到25度",
  "analysis": {
    "intent": "用户希望调节车内空调温度",
    "subject": "用户",
    "predicate": "调节",
    "object": "空调温度",
    "modifiers": "25度"
  },
  "paraphrases": [
    "车里温度帮我设到25",
    "空调温度调成25吧",
    "有点热，调到25度",
    "车里有点闷，温度调到25"
  ],
  "user_requirement": "更口语，适合车载语音场景"
}
```

价值：

- 原始 seed 提供语义锚点。
- 五元组提供收敛方向。
- 仿写句子提供 few-shot 风格参考。
- 用户要求提供任务级控制。

## 6. 仿写生成

### 6.1 仿写不是机械同义

“帮我把空调开到25度”这种同义仿写价值偏低，因为语义相似度太高。仿写应该保持核心意图不变，但表达方式有明显差异。

更好的方向：

```text
打开空调到25度
-> 车里温度帮我设到25
-> 空调温度调成25吧
-> 有点热，调到25度
-> 车里有点闷，温度调到25
```

### 6.2 输出结构

LLM 输出保持简单：

```json
{
  "convergence": [
    "空调温度调成25吧",
    "车里温度帮我设到25"
  ],
  "generalization": [
    "有点热，调到25度",
    "车里有点闷，温度调到25"
  ]
}
```

不让 LLM 输出：

```json
{
  "text": "...",
  "ops": [],
  "semantic_step": 2,
  "kept_slots": [],
  "risk": "low"
}
```

原因：复杂数组对象会降低输出稳定性，而且这些元数据当前不会直接提升用户体验。

### 6.3 收敛仿写

定义：

```text
同一核心意图 + 明显不同表达 + 不引入新任务
```

### 6.4 泛化仿写

定义：

```text
允许补充真实语境，但不改变任务目标
```

泛化可以包含：

- 口语化
- 轻度倒装
- 省略
- 轻量上下文
- 程度词/语气词

## 7. 仿写 Prompt

Prompt 输入：

```text
你要基于原始 query 生成自然用户表达。

原始 query：
{seed}

语义参考：
{active_analysis_fields}

要求：
1. 保持核心意图一致。
2. 不要机械同义替换。
3. 生成的句子要像真实用户会说的话。
4. 可以适度口语化、倒装、省略、补充轻量语境。
5. 不要引入明显不同的新任务。
6. 不要复制原始 query 或已有仿写。
7. 不要输出解释。

输出 JSON：
{
  "convergence": string[],
  "generalization": string[]
}
```

## 8. 批量生成 Prompt

批量生成使用 Reference Pack：

```text
你是数据构造助手，需要基于 seed、语义参考和仿写参考，继续生成更多用户表达。

原始 query：
打开空调到25度

语义参考：
- 意图：用户希望调节车内空调温度
- 动作：调节
- 对象：空调温度
- 修饰：25度

已确认仿写参考：
1. 车里温度帮我设到25
2. 空调温度调成25吧
3. 有点热，调到25度
4. 车里有点闷，温度调到25

生成要求：
- 参考上述表达风格继续扩展。
- 不要复制已确认仿写。
- 可以补充真实语境。
- 可以有口语、省略、倒装。
- 不要偏离语义参考。
- 输出 N 条。
```

## 9. 轻量过滤

不做 embedding，不做复杂门控。

只做四类低成本处理：

### 9.1 空值/格式过滤

- 空字符串
- 太短
- 太长
- JSON 解析失败
- 明显拒答

### 9.2 完全重复过滤

- 原文完全相同
- 去空格后相同
- 去常见标点后相同

### 9.3 已有参考重复过滤

避免复制：

- seed
- 已有仿写
- 当前批次已生成文本

### 9.4 明显冲突过滤

只处理强冲突，不做通用语义判断。

例如语义参考为“打开”，候选出现“不要打开 / 关闭 / 关掉”，可标记或过滤。用小词表即可。

## 10. 当前代码落地方向

### 10.1 `build_analysis_prompt`

保留现有五元组字段，继续强化字段定义：

- `subject` 默认用户。
- `object` 是被操作、被询问、被播放、被导航的对象。
- `modifiers` 包含数值、程度、时间、条件、否定、范围。
- 输出固定 JSON，不加复杂 schema。

### 10.2 `build_paraphrase_prompt`

改成只要求输出：

```json
{
  "convergence": [],
  "generalization": []
}
```

保留兼容逻辑：如果模型仍输出旧版 `items`，服务端继续兼容解析。

### 10.3 `generate_paraphrases`

服务端将双数组转换成现有前端结构：

```json
[
  { "text": "...", "type": "convergence" },
  { "text": "...", "type": "generalization" }
]
```

这样前端不需要改。

### 10.4 `build_generate_prompt`

批量生成时拼 Reference Pack：

- seed 原文
- 用户未置灰的五元组
- 已确认仿写
- 用户整体要求
- 目标数量

置灰字段不传入 prompt。

## 11. 最小验收标准

### 11.1 五元组拆解

覆盖 20 条典型 query：

- 车控
- 导航
- 媒体播放
- 百科询问
- 联系人
- 数值调节
- 否定表达

要求：

- subject 基本稳定为用户。
- object 不误放 subject。
- modifiers 能保留数值、否定、时间、范围。

### 11.2 仿写

每条 seed 生成 8 条：

- 至少 4 条表达明显不同。
- 不只是机械同义。
- 不引入明显新任务。
- 不复制原句。

### 11.3 批量生成

输入：

- seed
- 五元组
- 已确认仿写

输出：

- 继续沿 few-shot 风格扩展。
- 不复制仿写。
- 不因为置灰字段继续强认。
- 不被 `object.swappable` 这类字段限制。

## 12. 模块保留与删除

| 模块 | 处理 |
|---|---|
| 五元组解析 | 保留，重点打磨 |
| 五元组字段置灰 | 保留，置灰字段不传下游 |
| 工程 normalize | 删除 |
| IntentFrame | 降级为 Reference Pack |
| 仿写生成 | 保留，输出简单 JSON |
| 仿写元数据 | 删除 |
| embedding/cosine | 删除 |
| object.swappable | 删除 |
| 复杂语义门控 | 删除 |
| 批量生成 few-shot | 保留，作为核心链路 |
| 前端复杂展示 | 不做 |

## 13. 参考资料

- [A Survey of Data Augmentation Approaches for NLP, ACL Findings 2021](https://aclanthology.org/2021.findings-acl.84/)
- [An Empirical Survey of Data Augmentation for Limited Data Learning in NLP, TACL 2023](https://aclanthology.org/2023.tacl-1.12/)
- [Beyond Accuracy: Behavioral Testing of NLP Models with CheckList, ACL 2020](https://aclanthology.org/2020.acl-main.442/)
- [TextAttack: A Framework for Adversarial Attacks, Data Augmentation, and Adversarial Training in NLP, EMNLP 2020](https://aclanthology.org/2020.emnlp-demos.16/)
