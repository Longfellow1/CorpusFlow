# Fine-Tune Stage 3 Contract

## Goal

精调模式的 `指令微调` 和 `多轮问答` 不再是轻量展示壳层，而是批量生成前的样本契约预览。阶段 1/2 继续负责 query 语义解析、候选扩写和 query 仿写；阶段 3 负责定义这些 query 最终如何被包装成训练数据。

## Core Flow

```text
seed query
-> 语义解析
-> 候选扩写
-> query 仿写/泛化
-> 按模式包装成最终训练样本
```

## Instruction Fine-Tune

输出字段固定为：

```json
{
  "system": "可选系统提示或角色约束",
  "instruction": "当前用户 query 或任务指令",
  "input": "可选补充输入",
  "output": "当前 query 的理想回答"
}
```

字段来源：

- `system` 优先来自任务级整体需求/指令背景，也允许在单条 seed 的阶段 3 卡片里补充或覆盖。
- `instruction` 默认等于当前 seed，批量生成时可替换为阶段 2 产生的 query 泛化结果。
- `input` 是可选补充输入；如果 `instruction` 已经是完整 query，则保持为空。
- `output` 是必须可检查、可编辑的训练目标，不再使用 `instruct` 作为回答字段名。

交互原则：

- 左侧只保留任务级约束，不堆每条样本字段。
- 单条 seed 的字段检测和补充放在阶段 3 卡片里。
- 缺失必填的 `instruction/output` 时，预览卡片直接显示对应空字段，用户可就地补齐；`system/input` 可为空。

## Multi-Turn QA

输出字段固定为：

```json
{
  "history": [
    { "role": "user", "content": "上一轮用户问题" },
    { "role": "assistant", "content": "上一轮助手回答" }
  ],
  "currentQuery": "当前这一轮用户 query",
  "response": "当前轮助手回答",
  "conversations": [
    { "from": "human", "value": "上一轮用户问题" },
    { "from": "gpt", "value": "上一轮助手回答" },
    { "from": "human", "value": "当前这一轮用户 query" },
    { "from": "gpt", "value": "当前轮助手回答" }
  ]
}
```

核心约束：

- `currentQuery` 是主样本，必须来自 seed 或 seed 的等价/泛化 query。
- 前置 `1Q1A` 只服务当前 query，不能改写主任务、抢主意图或制造无关剧情。
- 批量生成结果必须保留多轮结构，不能压扁成普通 `{ q, a }`。

## Acceptance

- 指令微调预览和批量结果都使用 `instruction/input/output`。
- 多轮问答预览明确标注“上一轮上下文”和“当前轮 query”。
- 多轮批量结果导出 JSON/JSONL 时保留 `conversations`。
- CSV 导出至少包含可读的当前 query/response；多轮上下文可以序列化到单元格。
