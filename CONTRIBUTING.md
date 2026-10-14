# Contributing to CorpusFlow

Thanks for helping improve CorpusFlow. Issues and pull requests are welcome, especially for field-detection aliases, generation and filtering strategies, training data format adapters, demo samples, docs, and deployment scripts.

*[中文说明见下方](#中文说明)*

## Set up

Requirements: Node.js 20+, Python 3.11+, and [uv](https://github.com/astral-sh/uv) (`setup.sh` checks all three and tries to install uv if it is missing).

```bash
git clone https://github.com/Longfellow1/CorpusFlow.git
cd CorpusFlow

bash setup.sh      # creates .env.local from .env.example, runs npm install and uv sync
npm run dev:all    # React + Express on :3000, FastAPI algorithm service from :8001
```

Generation features need `ARK_API_KEY` in `.env.local`. Keep it on the backend only; never commit it or paste it into issues.

## Checks before opening a PR

```bash
npm run lint                               # TypeScript type check (tsc --noEmit)
npm run build                              # Vite production build
npm run build:server                       # Compile server.ts (tsconfig.server.json)
node --import tsx --test tests/*.test.ts   # Node unit tests
cd algorithm && uv run python -m unittest tests.test_generation_frame   # Python unit tests
```

Optional, against a running local stack (`npm run dev:all`; set `TEST_API_BASE` to target another URL):

```bash
npm run test:regression   # scripts/regression/test-regression.ts with fixtures/regression-cases.json
npm run test:evaluate     # scripts/regression/evaluate-prompts.ts
```

If you change user-facing behavior, update both `README.md` (Chinese) and `README.en.md` (English).

## Reporting issues

Open an issue at <https://github.com/Longfellow1/CorpusFlow/issues>. Please include the steps to reproduce, the workspace you used (Batch tasks, Fine-tune, or Evaluation), and the output of `curl http://localhost:3000/api/health` if the problem looks like a backend or algorithm-service failure. Remove API keys and private data from logs and sample files first.

## License

CorpusFlow is licensed under the [Apache License 2.0](LICENSE). Unless you explicitly state otherwise, contributions you submit are licensed under the same terms (Section 5 of the license).

---

## 中文说明

欢迎提交 Issue 和 PR。

- **环境准备**：需要 Node.js 20+、Python 3.11+ 和 uv。克隆仓库后运行 `bash setup.sh`，再运行 `npm run dev:all`；生成功能需要在 `.env.local` 中配置 `ARK_API_KEY`，该密钥只放后端，不要提交到仓库或贴进 Issue。
- **提交前检查**：`npm run lint`、`npm run build`、`npm run build:server`、`node --import tsx --test tests/*.test.ts`，以及 `cd algorithm && uv run python -m unittest tests.test_generation_frame`。`npm run test:regression` 和 `npm run test:evaluate` 需要先启动本地服务。
- **文档**：涉及用户可见行为的改动，请同步更新 `README.md` 和 `README.en.md`。
- **反馈问题**：在 <https://github.com/Longfellow1/CorpusFlow/issues> 提交，附上复现步骤、使用的工作区（批量任务 / 精调生成 / 评测增强），必要时附 `/api/health` 的返回；请先去掉日志和样例文件中的 API key 与隐私数据。
- **许可证**：项目采用 [Apache License 2.0](LICENSE)，提交的贡献同样按 Apache-2.0 授权。
