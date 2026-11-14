# CorpusFlow 大事业叙事

日期：2026-05-21

## 1. 核心定位

CorpusFlow 不应被长期定义为数据生成工作台。

更大的定位是：

```text
Trace-to-Dataset Pipeline
```

更严肃的技术表达是：

```text
Evidence-Grounded Dataset Pipeline
```

中文表达：

```text
AI 应用失败证据到训练与回归数据资产的构建管道。
```

CorpusFlow 的核心价值不是“再生成一些样本”，而是把 AI 应用上线后的真实失败现场，转成下一轮模型、Agent、Prompt、评测都能复用的数据资产。

## 2. 一句话叙事

### 内部领导版

```text
让线上 AI 应用的每一个真实 badcase，自动变成下一个版本能用的训练和评测数据。
```

### 外部开源版

```text
Turn failure traces into training-ready datasets, with full provenance.
```

### 比赛版

```text
评测不是终点。CorpusFlow 把评测失败变成下一轮训练和回归的数据资产。
```

## 3. 为什么这件事大

企业内部会出现越来越多 AI 应用、Agent、智能研发工具和业务助手。它们上线后都会进入同一个循环：

```text
用户真实使用
-> 产生失败、反馈、trace、测试失败
-> 团队人工复盘
-> 试图补 prompt、补数据、补评测
-> 下一版上线
-> 新失败继续出现
```

今天行业工具链里已经有很多相邻系统：

```text
Observability: Langfuse / Phoenix / Opik / Helicone
Eval Runner: promptfoo / DeepEval / Ragas / OpenAI Evals
Labeling: Argilla / Label Studio
Training: LLaMA-Factory / Axolotl / TRL / Unsloth
```

但从失败现场到可用数据资产之间，仍然大量依赖人工：

```text
读日志
找上下文
判断为什么错
归类 badcase
补 expected behavior
写 eval points
构造训练样本
保留来源
导出到下游工具
```

CorpusFlow 要站的位置就是这段缺失管道：

```text
failure evidence -> evidence pack -> dataset candidate -> review/export
```

## 4. 数据飞轮

CorpusFlow 的长期飞轮不是 seed generation，而是 failure-driven dataset construction。

```text
真实对话 / trace / eval failure / 用户反馈
-> 会话和链路重建
-> 失败信号识别
-> 问题族聚类
-> 修复数据规划
-> 训练候选 / 回归评测候选
-> 人工复核
-> 导出到训练、评测、标注系统
-> 新版本上线
-> 新失败继续进入
```

每一轮循环都沉淀：

- 原始证据。
- 问题族。
- 修复策略。
- 数据候选。
- 人工确认记录。
- 版本差异。
- 下游效果反馈。

这才是“数据资产”的含义。

## 5. 不是 GPT 前端

如果 CorpusFlow 只是：

```text
把 badcase 改写成几条训练数据
```

用户可以直接找 GPT。

CorpusFlow 必须提供 GPT 聊天窗口缺少的工程属性：

- provenance：每条数据能追溯到原始失败证据。
- rebuild：同一输入和配置能重建同一数据包。
- diff：两轮数据资产能比较变化。
- review：人审状态可保留。
- export contract：能稳定输出给评测、标注、训练工具。
- evidence pack：不是只给结果，而是给结果背后的证据链。

## 6. 四个不做

清晰边界比大口号更重要。

| 不做 | 边界 |
| --- | --- |
| 不做 observability | 消费 trace，不采集 trace |
| 不做 eval runner | 产出 eval 数据，不运行评测 |
| 不做 labeling UI | 产出待审数据和证据，不替代标注平台 |
| 不做 training | 产出训练数据，不调 GPU |

一句话：

```text
CorpusFlow 是上下游之间的连接组织，不是新的 LLMOps 端点平台。
```

## 7. 与复赛的关系

复赛不是大事业本身，而是大事业的一个可见切片。

复赛只需要证明一件事：

```text
失败证据进入 CorpusFlow 后，可以被整理、诊断、生成、导出为下一轮训练和回归评测资产。
```

比赛现场应避免讲成完整平台。应讲：

```text
我们今天演示的是 Trace-to-Dataset Pipeline 的第一段：
badcase / eval failure -> 理解报告 -> 一键生成 -> eval / training asset package
```

## 8. PPT 中的使用方式

大事业叙事应放在 PPT 的前后两处。

开场用于抬高问题：

```text
企业 AI 应用上线后，真正难的不是第一次生成答案，而是每一次失败如何进入下一轮改进。
```

结尾用于拔高空间：

```text
CorpusFlow 从复赛场景里的 badcase 回流出发，长期要成为 AI 应用失败证据到数据资产之间的开源基础设施。
```

中间 Demo 不讲远景，只讲可跑通的比赛链路。

复赛 PPT 中，大事业叙事只能作为开场问题意识和结尾空间，不要压过主演示。现场讲解时，远景部分控制在 30 秒左右，先让评委看懂“失败证据 -> 数据资产包”的可运行链路，再抬升到开源基础设施。
