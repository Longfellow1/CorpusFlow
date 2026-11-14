# Fine-Tune Stage 3 Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make fine-tune `指令微调` and `多轮问答` stage 3 define the data contract used by batch generation.

**Architecture:** Keep stage 1/2 as query-control stages. Add stage 3 contracts for `instruction/input/output` and multi-turn `history/currentQuery/response/conversations`, then make algorithm generation and export preserve those shapes.

**Tech Stack:** React/TypeScript, Express, FastAPI/Python, node:test, unittest.

---

### Task 1: Contract Tests

**Files:**
- Modify: `tests/task-workspace-state.test.ts`
- Modify: `algorithm/tests/test_generation_frame.py`

- [ ] Add tests for fine-tune instruction/multi field completeness and algorithm prompt output schemas.
- [ ] Run `node --test tests/task-workspace-state.test.ts` and `uv run --project algorithm python -m unittest algorithm.tests.test_generation_frame`; both should fail before implementation.

### Task 2: Shared Field Contract

**Files:**
- Create: `src/utils/fineTuneDataContract.ts`
- Modify: `src/App.tsx`

- [ ] Add helpers for empty instruction and multi-turn payloads.
- [ ] Use those helpers when normalizing seeds and when deciding whether preview exists.

### Task 3: Algorithm Contract

**Files:**
- Modify: `algorithm/src/app.py`

- [ ] Change instruct preview to return `instruction/input/output` while accepting legacy `query/instruct`.
- [ ] Change multi batch generation to return `history/currentQuery/response/conversations`.
- [ ] Change instruct batch generation to return `instruction/input/output`.
- [ ] Deduplicate multi on `currentQuery` and instruct on `input`.

### Task 4: UI and Export

**Files:**
- Modify: `src/App.tsx`
- Modify: `server.ts`
- Modify: `src/services/geminiService.ts`

- [ ] Rename stage 3 labels and bind fields to the new contract.
- [ ] Keep left sidebar focused on task-level controls only.
- [ ] Render generated multi/instruct items with mode-specific fields.
- [ ] Export JSON/JSONL/CSV using the contract fields.

### Task 5: Verification

**Commands:**
- `node --test tests/task-workspace-state.test.ts`
- `uv run --project algorithm python -m unittest algorithm.tests.test_generation_frame`
- `npm run lint`
- Minimal curl checks for `/api/algorithm/instruct`, `/api/algorithm/qa`, and `/api/tasks/:taskId/export`.
