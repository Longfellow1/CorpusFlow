# CorpusFlow
<img width="3012" height="1586" alt="6c6592419610702ff88dff00b03ad357" src="https://github.com/user-attachments/assets/84c9aaf3-55e4-46d2-ba3c-b693e8807b6e" />
<img width="3006" height="1582" alt="028095fa811bb82e7318f801397b4410" src="https://github.com/user-attachments/assets/663cbd90-f534-431e-b5d6-20368ab386eb" />
<img width="2996" height="1586" alt="7f31f77c052e63273be937f40a4e192b" src="https://github.com/user-attachments/assets/d724e49e-6dc9-4224-8df8-22af0118f311" />


> 面向微调和评测的数据生产工作台：把零散的 query、badcase、FAQ 和种子样本，批量转成可审计、可导出的训练数据。

CorpusFlow 不是一个 Prompt 游乐场。它把“导入原始数据 → 字段识别 → 敏感拒识 → 批量生成 → 人工复核 → JSON/CSV/JSONL 导出”做成一条可重复的工作流，服务于需要持续准备 SFT、QA、多轮对话和评测数据的算法、测试与业务团队。

*[English → README.en.md](README.en.md)*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## 为什么需要 CorpusFlow

微调数据生产通常卡在三个地方：

- **手工造样本太慢**：算法、测试或业务同学需要反复写 query、补 output、整理格式。
- **直接让模型批量扩写不可信**：实体漂移、格式不稳定、敏感内容混入，最后仍要人工清洗。
- **badcase 很难变成资产**：线上问题、测试失败、用户反馈散落在日志和表格里，不能快速回流训练。

CorpusFlow 的目标是让数据生产从“临时手工活”变成“可配置、可复核、可导出”的工程流程。

---

## 一个典型流程

上传一份 CSV：

```csv
query,input,output,system
导航去虹桥机场,,请先确认出发地，再给出导航规划,你是车载语音助手
我快没油了，帮我找顺路加油站,,推荐顺路加油站，并说明绕行成本,
色情片在哪里看,,,
```

CorpusFlow 会自动完成：

1. 识别 `query / input / output / system` 等字段。
2. 将 `query` 映射为 `Instruction`，将 `system` 映射为助手角色。
3. 拒识敏感样本，并在结果里保留拒识原因。
4. 对正常样本批量生成 QA、Alpaca Instruct 或多轮对话数据。
5. 导出 JSON、CSV 或 JSONL，进入训练或评测流水线。

指令微调导出的 Alpaca 结构示例：

```json
{
  "system": "你是车载语音助手",
  "instruction": "导航去虹桥机场",
  "input": "",
  "output": "请先告诉我你的出发地，我可以帮你规划前往虹桥机场的路线。"
}
```

---

## 谁适合用

- **算法工程师**：需要快速构造 SFT、QA、多轮对话训练数据。
- **测试工程师**：需要把测试 badcase 扩展成覆盖更多表达方式的评测集。
- **业务知识库维护者**：需要把 FAQ、SOP、工单和客服话术转成可训练格式。
- **AI 工具参赛或演示团队**：需要一条能展示“数据进入、生成、过滤、导出”的完整链路。

---

## 核心能力

| 能力 | 用户收益 | 证明方式 |
|---|---|---|
| 快速任务批量导入 | 从表格直接进入生成流程，减少手工字段整理 | 自动识别 `query/question/user_query/问题`、`input/context/content/材料`、`output/answer/response`、`system/role/persona/角色设定` |
| 指令微调字段契约 | 导出的数据能对齐 LLaMA-Factory Alpaca 结构 | UI 明确展示 `助手角色 System`、`用户问题 Instruction`、`补充材料 Input`、`期望输出 Output` |
| 拒识与安全保护 | 敏感样本不会混入普通生成结果，同时保留可审计记录 | 被拒识的 seed 会在结果列表标记“拒绝”并展示原因 |
| 精调生成工作台 | 对单条高价值 seed 做语义解析、候选扩写和训练样本预览 | 工作流包含种子语句、句子解析、仿写句子、训练样本预览、生成控制 |
| 多轮数据支持 | 能构造上一轮 1Q1A + 当前轮的对话样本 | 导出 ShareGPT 风格 `conversations` / history 结构 |
| 进度与导出 | 长任务不是“发出去等结果”，而是可观察、可暂停、可导出 | 快速任务展示已完成种子、保留数量、保留率，并支持 JSON/CSV/JSONL |

---

## 支持的数据形态

| 类型 | 适合场景 | 主要字段 |
|---|---|---|
| QA | 问答数据、客服回复、知识库问答 | `q`, `a` |
| Instruction / Alpaca | 指令微调、LLaMA-Factory SFT | `system`, `instruction`, `input`, `output` |
| Multi-turn / ShareGPT | 多轮对话、上下文承接 | `conversations` 或 `history/currentQuery/response` |

所有格式均可导出为 **JSON / CSV / JSONL**。CSV 导出会做公式注入防护，避免 Excel 打开时把 `= + - @` 开头内容误当公式执行。

---

## 快速开始

### 本地开发

```bash
git clone https://github.com/Longfellow1/CorpusFlow-.git
cd CorpusFlow

bash setup.sh
npm run dev:all
```

打开：

```text
http://localhost:3000
```

`npm run dev:all` 会同时启动：

- React + Express：`http://localhost:3000`
- FastAPI 算法服务：`http://localhost:8001`

### Docker

```bash
docker compose up --build
```

---

## 环境变量

复制 `.env.example` 为 `.env.local`，至少配置：

```bash
PORT=3000
ALGORITHM_BASE_URL=http://127.0.0.1:8001

ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=your_key_here
ARK_MODEL=doubao-seed-1-6-250615
ARK_TIMEOUT_SECONDS=120

VITE_API_BASE_URL=
```

说明：

- `ARK_API_KEY` 只放后端环境变量，不要放进前端或公开材料。
- `VITE_API_BASE_URL` 只用于前端指向 API 地址，部署到 Cloudflare Pages 时可设置为公网 API 域名。
- 本地开发时 `VITE_API_BASE_URL` 可以留空，走同源 API。

---

## 常用命令

```bash
npm run dev          # 启动 React + Express
npm run dev:algorithm # 启动 Python 算法服务
npm run dev:all      # 同时启动前后端和算法服务
npm run build        # Vite 生产构建
npm run lint         # TypeScript 类型检查
```

测试：

```bash
node --import tsx --test tests/*.test.ts
cd algorithm && uv run python -m unittest tests.test_generation_frame
```

健康检查：

```bash
curl http://localhost:3000/api/health
```

期望返回：

```json
{
  "ok": true,
  "services": {
    "node": true,
    "algorithm": {
      "ok": true
    }
  }
}
```

---

## 产品工作区

### 快速任务

适合批量导入 CSV / XLSX 后直接生成。核心路径：

```text
上传文件 → 自动识别字段 → 选择 QA / 指令微调 / 多轮 → 填写助手角色 → 生成 → 导出
```

适合场景：

- 一批 FAQ 转训练数据
- 一批 badcase 扩展成评测 query
- 一批用户问题补齐标准回答
- 一批指令微调样本转成 Alpaca / JSONL

### 精调生成

适合单条高价值种子的深度扩写。核心路径：

```text
输入种子 → 句子解析 → AI 扩写候选 → 仿写句子 → 训练样本预览 → 批量生成
```

适合场景：

- 针对一个 badcase 做同义表达增强
- 控制实体、动作、对象、修饰条件的泛化范围
- 先人工确认语义骨架，再让模型批量生成

---

## 架构

```text
┌─────────────────────────────────────────────┐
│ React + TypeScript + Vite                   │
│ 数据导入、任务工作台、生成进度、结果编辑与导出 │
└───────────────────┬─────────────────────────┘
                    │ REST
                    ▼
┌─────────────────────────────────────────────┐
│ Express + TypeScript                        │
│ 登录认证、任务所有权、工作区持久化、导出安全   │
└───────────────────┬─────────────────────────┘
                    │ HTTP
                    ▼
┌─────────────────────────────────────────────┐
│ FastAPI + Python                            │
│ LLM 编排、语义解析、批量生成、进度与取消       │
└─────────────────────────────────────────────┘
```

第一版部署推荐：

```text
Cloudflare Pages
  → React/Vite 静态前端
  → VITE_API_BASE_URL
  → 外部 Express API
  → 外部 FastAPI 算法服务
  → Ark / Doubao 模型
```

这个形态优先保证演示 URL 稳定可访问；Express 和 FastAPI 暂不强行迁移到 Cloudflare Workers。

---

## 安全与健壮性

- **JWT 认证**：HMAC-SHA256 会话令牌。
- **任务所有权隔离**：任务、种子、结果和工作区读写前校验所属用户。
- **并发写入保护**：共享文件 I/O 使用 Promise 链互斥，降低数据损坏风险。
- **CSV 注入防护**：导出时转义公式前缀。
- **敏感拒识**：政治敏感、暴力违法、色情获取等输入会在生成前拦截。
- **Prompt 注入防护**：算法层对外部输入做边界包裹与长度限制。

---

## 当前边界

- 当前存储以本地 JSON 文件为主，适合演示和小团队内测；生产化建议迁移到数据库或对象存储。
- 算法服务依赖外部 LLM API，生成稳定性受模型服务、网络和 API key 配额影响。
- README 暂未包含正式截图或 GIF；建议后续补一张快速任务结果页截图。
- 仓库暂未提供 CONTRIBUTING.md 和 GitHub Actions 工作流。

---

## 路线图

- [x] 快速任务批量导入与字段识别
- [x] QA / Instruction / Multi-turn 三类输出
- [x] LLaMA-Factory Alpaca 字段契约
- [x] 拒识样本保留与原因展示
- [x] JSON / CSV / JSONL 导出
- [x] Cloudflare Pages + 外部后端部署方案
- [ ] 示例数据包与截图
- [ ] 数据集 diff 与版本对比
- [ ] Hugging Face Datasets Hub 导出
- [ ] 数据库存储与 Cloudflare 半原生改造

---

## 贡献

欢迎提交 Issue 和 PR，尤其是：

- 新的字段识别别名
- 更稳定的生成与过滤策略
- 更多训练数据格式适配
- 演示样例、文档和部署脚本

正式贡献指南待补充：`TODO: add CONTRIBUTING.md`。

---

## License

Apache License 2.0。详见 [LICENSE](LICENSE)。

Copyright 2026 Harland.

---

## 作者

**Harland** —— AI Native 产品经理。

- 邮箱: Harland5588@outlook.com
- GitHub: [@Longfellow1](https://github.com/Longfellow1)
