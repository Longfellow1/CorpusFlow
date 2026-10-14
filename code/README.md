# 开发记录与交接说明 (Development Records)

本目录包含了 CorpusFlow 项目从 AI Studio 迁移至本地开发（Claude Code / Local IDE）所需的关键信息。

> 状态说明：本目录是 2026-04 从 AI Studio 原型（前端直连 Gemini）迁移到本地开发时的历史记录，不代表当前实现。当前大模型调用由 Python 算法服务（`algorithm/src/app.py`）通过 Ark / Doubao 完成，配置 `ARK_API_KEY` 等变量；前端 `src/services/geminiService.ts` 只调用后端 `/api/algorithm/*` 接口，不再直连 Gemini。安装与配置以根目录 [README.md](../README.md) 为准。

## 目录内容
- **HANDOVER.md**: 项目整体交接记录，包含架构回顾、核心逻辑说明及下一阶段待办事项。
- **api_design.md**: 详细的后端 API 接口设计规范，定义了数据模型与端点。

## 本地启动（当前）
迁移已完成，原 AI Studio 导出步骤和 `GEMINI_API_KEY` 配置已不再适用。请按根目录 README 的「快速开始」操作：
1. 运行 `bash setup.sh`（从 `.env.example` 生成 `.env.local`，安装 Node 与 Python 依赖）。
2. 在 `.env.local` 中配置 `ARK_API_KEY`。
3. 运行 `npm run dev:all`。

## 后端开发建议
- 推荐使用 Node.js (Express/Fastify) 或 Python (FastAPI) 构建后端。
- 优先实现 `src/services/apiService.ts` 中预留的接口。
- 逐步将 `localStorage` 的读写逻辑替换为 API 调用。
