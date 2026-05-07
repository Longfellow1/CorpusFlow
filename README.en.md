# CorpusFlow

> A corpus production workbench for fine-tuning and evaluation data: turn raw queries, badcases, FAQs, and seed examples into auditable training data you can export.

CorpusFlow is not a prompt playground. It turns "import raw data → detect fields → reject unsafe seeds → batch generate → review → export JSON/CSV/JSONL" into a repeatable workflow for teams that continuously prepare SFT, QA, multi-turn dialog, and evaluation datasets.

*[中文版 → README.md](README.md)*

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

---

## Why this exists

Fine-tuning data production usually breaks in three places:

- **Manual sample writing is slow**: engineers and testers repeatedly write queries, fill outputs, and clean formats by hand.
- **Unbounded batch generation is unreliable**: entities drift, formats vary, and unsafe content can enter the dataset.
- **Badcases rarely become reusable assets**: production failures and test cases stay in logs instead of flowing back into training.

CorpusFlow turns this from one-off manual work into a configurable, reviewable, exportable data workflow.

---

## A typical flow

Upload a CSV:

```csv
query,input,output,system
Navigate to Hongqiao Airport,,Ask for the departure point first, then plan the route,You are an in-car voice assistant
I am almost out of gas. Find a gas station on the way,,Recommend a nearby gas station and explain detour cost,
Where can I watch pornography,,,
```

CorpusFlow will:

1. Detect fields such as `query / input / output / system`.
2. Map `query` to `Instruction` and `system` to assistant role.
3. Reject unsafe seeds while keeping the rejection reason visible.
4. Generate QA, Alpaca Instruct, or multi-turn dialog data for valid rows.
5. Export JSON, CSV, or JSONL for training and evaluation pipelines.

Alpaca-style instruction output:

```json
{
  "system": "You are an in-car voice assistant",
  "instruction": "Navigate to Hongqiao Airport",
  "input": "",
  "output": "Please tell me your departure point first, then I can plan a route to Hongqiao Airport."
}
```

---

## Who it is for

- **ML engineers** preparing SFT, QA, and multi-turn training data.
- **QA engineers** expanding badcases into broader evaluation sets.
- **Knowledge-base owners** turning FAQs, SOPs, tickets, and support scripts into training records.
- **AI tool demo teams** that need a complete "data in → generation → filtering → export" workflow.

---

## Key features

| Capability | User benefit | Proof |
|---|---|---|
| Batch import for quick tasks | Move from spreadsheets into generation with less manual cleanup | Detects `query/question/user_query/问题`, `input/context/content/材料`, `output/answer/response`, `system/role/persona/角色设定` |
| Instruction fine-tune contract | Export data that matches LLaMA-Factory Alpaca expectations | UI shows `Assistant Role System`, `User Question Instruction`, `Supplement Input`, `Expected Output` |
| Safety rejection | Unsafe rows do not enter normal generation, but remain auditable | Rejected seeds stay in the result list with reason labels |
| Fine-tune generation workspace | Deeply expand one high-value seed with semantic analysis and previews | Workflow includes seed input, sentence analysis, paraphrase candidates, sample preview, and generation controls |
| Multi-turn support | Build previous-turn context plus current-turn response data | Exports ShareGPT-style `conversations` or `history/currentQuery/response` structures |
| Progress and export | Long-running jobs remain observable and exportable | Quick tasks show completed seeds, retained count, pass rate, and JSON/CSV/JSONL export |

---

## Supported data shapes

| Type | Use case | Main fields |
|---|---|---|
| QA | Question-answer data, customer support, knowledge-base replies | `q`, `a` |
| Instruction / Alpaca | Instruction fine-tuning, LLaMA-Factory SFT | `system`, `instruction`, `input`, `output` |
| Multi-turn / ShareGPT | Dialog context and follow-up turns | `conversations` or `history/currentQuery/response` |

All formats export to **JSON / CSV / JSONL**. CSV export escapes formula prefixes to reduce Excel formula-injection risk.

---

## Quick start

### Local development

```bash
git clone https://github.com/Longfellow1/CorpusFlow-.git
cd CorpusFlow

bash setup.sh
npm run dev:all
```

Open:

```text
http://localhost:3000
```

`npm run dev:all` starts:

- React + Express: `http://localhost:3000`
- FastAPI algorithm service: `http://localhost:8001`

### Docker

```bash
docker compose up --build
```

---

## Environment

Copy `.env.example` to `.env.local`:

```bash
PORT=3000
ALGORITHM_BASE_URL=http://127.0.0.1:8001

ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_API_KEY=your_key_here
ARK_MODEL=doubao-seed-1-6-250615
ARK_TIMEOUT_SECONDS=120

VITE_API_BASE_URL=
```

Notes:

- `ARK_API_KEY` belongs on the backend only. Do not put it in frontend builds or public materials.
- `VITE_API_BASE_URL` points the frontend to the API domain. It can stay empty for same-origin local development.
- For Cloudflare Pages, set `VITE_API_BASE_URL` to the public API URL.

---

## Commands

```bash
npm run dev           # React + Express
npm run dev:algorithm # Python algorithm service
npm run dev:all       # Full local stack
npm run build         # Vite production build
npm run lint          # TypeScript type check
```

Tests:

```bash
node --import tsx --test tests/*.test.ts
cd algorithm && uv run python -m unittest tests.test_generation_frame
```

Health check:

```bash
curl http://localhost:3000/api/health
```

Expected:

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

## Workspaces

### Quick Task

Best for CSV / XLSX batch import:

```text
Upload file → detect fields → choose QA / instruction / multi-turn → fill assistant role → generate → export
```

Common uses:

- Turn FAQs into training data
- Expand badcases into evaluation queries
- Fill standard answers for user questions
- Export instruction samples as Alpaca / JSONL

### Fine-tune Generation

Best for deep expansion of one high-value seed:

```text
Enter seed → sentence analysis → AI candidate expansion → paraphrase preview → training sample preview → batch generation
```

Common uses:

- Expand one badcase into related expressions
- Control entity, action, object, and modifier generalization
- Let a human confirm semantic structure before batch generation

---

## Architecture

```text
┌─────────────────────────────────────────────┐
│ React + TypeScript + Vite                   │
│ Import, task workspace, progress, export    │
└───────────────────┬─────────────────────────┘
                    │ REST
                    ▼
┌─────────────────────────────────────────────┐
│ Express + TypeScript                        │
│ Auth, task ownership, persistence, export   │
└───────────────────┬─────────────────────────┘
                    │ HTTP
                    ▼
┌─────────────────────────────────────────────┐
│ FastAPI + Python                            │
│ LLM orchestration, semantic parsing, jobs   │
└─────────────────────────────────────────────┘
```

Recommended first deployment:

```text
Cloudflare Pages
  → React/Vite static frontend
  → VITE_API_BASE_URL
  → External Express API
  → External FastAPI algorithm service
  → Ark / Doubao model
```

This prioritizes a stable demo URL. Express and FastAPI are not forced into Cloudflare Workers for the first version.

---

## Security and robustness

- **JWT authentication** with HMAC-SHA256 session tokens.
- **Task ownership checks** before reading or writing task-scoped data.
- **Concurrent-write protection** for shared file I/O.
- **CSV injection protection** during export.
- **Safety rejection** for political-sensitive, violent, illegal, and sexual-acquisition prompts.
- **Prompt-injection mitigation** through algorithm-side input boundaries and truncation.

---

## Current boundaries

- Storage currently uses local JSON files, suitable for demos and small-team trials. Production deployments should move to a database or object store.
- Generation depends on an external LLM API, so stability depends on service availability, network, and quota.
- The README does not yet include a screenshot or GIF.
- The repository does not yet include `CONTRIBUTING.md` or GitHub Actions workflows.

---

## Roadmap

- [x] Quick task import and field detection
- [x] QA / Instruction / Multi-turn outputs
- [x] LLaMA-Factory Alpaca contract
- [x] Rejected-seed retention with reason labels
- [x] JSON / CSV / JSONL export
- [x] Cloudflare Pages + external backend deployment plan
- [ ] Example data package and screenshot
- [ ] Dataset diff and version comparison
- [ ] Hugging Face Datasets Hub export
- [ ] Database storage and Cloudflare semi-native migration

---

## Contributing

Issues and PRs are welcome, especially for:

- Field-detection aliases
- More stable generation and filtering strategies
- Additional training data format adapters
- Demo samples, docs, and deployment scripts

Formal contribution guide: `TODO: add CONTRIBUTING.md`.

---

## License

Apache License 2.0. See [LICENSE](LICENSE).

Copyright 2026 Harland.

---

## Author

**Harland** — AI Native Product Manager.

- Email: Harland5588@outlook.com
- GitHub: [@Longfellow1](https://github.com/Longfellow1)
