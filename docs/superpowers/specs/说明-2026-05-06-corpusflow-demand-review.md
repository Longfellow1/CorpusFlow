# CorpusFlow Demand Review

Date: 2026-05-06

## Source Scope

This review is based on:

- `/Users/Harland/Go/CorpusFlow_副本/数据构造需求分析.pdf`
- `/Users/Harland/Go/CorpusFlow_副本/数据合成&增强产品分享.pdf`
- Recent product discussions in this project around batch generation, fine-tune data fields, multi-turn data, upload flow, task deletion, and LLaMA-Factory export.

Previous conclusions based on unrelated PDFs such as car dialogue reporting or travel assistant materials should be ignored for this review.

## Stage 0 Anchor

### Real Users

The strongest user groups are:

1. Testing team
   - Needs to quickly construct high-quality evaluation queries.
   - Needs batch seed upload, multi-turn context construction, deduplication, and eventually automated test flow integration.

2. Data PM / Data planner
   - Defines intent systems and business data requirements.
   - Needs to create large-scale vertical-domain data from small seed sets.
   - Needs human confirmation, schema awareness, and controllable generation.

3. Algorithm engineer
   - Uses generated data for SFT, evaluation, and model iteration.
   - Needs data that can be exported into frameworks such as LLaMA-Factory and used to repair Bad Case clusters.

### Trigger Moments

The demand is triggered when:

- A new model, service, or intelligent agent version needs evaluation.
- The testing team needs 100-200 seed queries expanded into broader coverage.
- A known weakness appears in evaluation results, but the team does not know how to turn Bad Cases into targeted enhancement data.
- Manual construction of evaluation data is too slow and inconsistent.
- Multi-turn evaluation requires context cases such as reference resolution, cross-domain follow-up, media carrier switch, or negation of the previous turn.

### Current Workaround

Current work likely combines:

- Manual writing of evaluation cases.
- One-off prompt generation.
- Spreadsheet editing.
- Algorithm-side ad hoc scripts.
- Repeated setup of evaluation flows after model or service updates.
- Manual Bad Case reading and clustering.

This creates high time cost, low consistency, and poor reusability.

## Product Judgment

Verdict: **DE-SCOPE / 降级做**

The direction is valid, but the product must be narrowed.

The correct near-term product is not a full "Data Alchemist" platform, not a complete SFT factory, and not a full evaluation platform. The strongest validated wedge is:

> A controllable evaluation query and data enhancement tool for testing teams, with batch seed upload, query expansion, deduplication, multi-turn context construction, and export-ready data.

The broader vision of:

```text
Bad Case discovery -> diagnosis -> recipe confirmation -> data repair -> model iteration
```

is directionally right, but should not be fully built before the smaller loop is proven.

## Strike 1: Disease Diagnosis

### 1. 万能入口症

The product has repeatedly tried to serve:

- Query generation
- SFT instruction data
- Multi-turn QA
- Evaluation flow generation
- Bad Case diagnosis
- Forge / third-party service integration
- Code generation
- Report-like workflow visibility

These are related, but they are not the same MVP.

If all are exposed as first-class product modes, users will not understand the core job-to-be-done.

### 2. Demo 成瘾症

Some earlier design choices made the product look richer in demos but weaker in daily usage:

- Adding "code generation" as an output type.
- Treating "multi-turn" as a competing mode instead of a sample structure.
- Surfacing too many data-contract details before the batch generation mental model was stable.

These features increase perceived capability, but they dilute the core workflow.

### 3. 场景错配症

The product discussion temporarily over-weighted "fine-tune field correctness" and under-weighted the immediate testing-team need:

- Batch upload.
- Query expansion.
- Multi-turn context query construction.
- Deduplication between test data and train data.
- Export / integration readiness.

LLaMA-Factory compatibility matters, but it is a downstream format requirement, not the core product positioning.

## Strike 2: Assumption Review

### Assumption 1: Testing teams need high-quality query generation more urgently than a complete SFT factory

Status: partially supported.

Evidence:

- The product sharing PDF explicitly positions current value around high-quality Query generation for broader evaluation data coverage.
- The meeting notes mention batch seed upload, multi-turn query generation, deduplication, parameter generalization, and Forge integration.

Risk:

- If actual users are algorithm engineers rather than testing users, SFT export may need higher priority.

Current judgment:

- Testing-team query generation is the best MVP wedge.

### Assumption 2: Multi-turn should be a simple switch now, not a complex mode

Status: supported by recent product discussions and PDF planning.

Evidence:

- The planning section says future capability should support single query, QA pair, and multi-turn QA pair.
- Meeting notes ask for multi-turn query generation around reference resolution, cross-domain scenarios, and media carrier switch.

Interpretation:

- "Multi-turn" is a sample topology, not an output type.
- It should be controlled as a lightweight option in the same generation flow.

Current judgment:

- The current correction to make multi-turn a switch is right.
- The next layer should be simple built-in multi-turn templates, not a complex configuration system.

### Assumption 3: Bad Case diagnosis is important but not yet the first build target

Status: supported but should be staged.

Evidence:

- Both PDFs emphasize Bad Case closed-loop optimization.
- The demand analysis PDF describes diagnosis, adaptive recipe generation, P-N-H strategy, and dynamic variable pools.
- The sharing PDF frames future planning as evaluation file upload -> Bad Case identification -> clustering -> enhancement task -> data generation.

Risk:

- Building full AI diagnosis too early will consume large effort and produce unstable output.

Current judgment:

- Start with Bad Case upload, field recognition, filtering, and clustering.
- Delay adaptive recipe generation until the batch query generation loop is stable.

### Assumption 4: Users will tolerate some configuration if it maps clearly to batch production

Status: likely true, but needs behavior validation.

Evidence:

- Users asked for batch upload, parameters, multi-turn context, deduplication, and downstream integration.
- These are not casual consumer interactions; this is a professional internal data workflow.

Risk:

- If configuration is split across "fine-tune", "batch", "multi-turn", "instruction" modes, users will feel they are learning the same production logic twice.

Current judgment:

- One batch-generation mental model should drive both quick and fine-tune screens.

## Strike 3: Failure Forecast

Month 1:

The product looks powerful. It supports batch generation, fine-tune formats, multi-turn data, and several output types. Demos feel complete because many capabilities are visible.

Month 2-3:

Testing users start asking basic workflow questions:

- Should I use fine-tune or batch?
- Is multi-turn a mode or a switch?
- Why does query generation and instruction generation have different configuration logic?
- Where do I upload 100-200 seeds?
- How do I avoid overlap with training data?

They can generate data, but they do not trust the workflow enough to repeat it without guidance.

Month 4-5:

The team keeps adding explanations, cards, modes, and field panels to clarify confusion. Each fix helps one local issue but increases the global cognitive load.

Month 6+:

CorpusFlow becomes a capable but hard-to-operate internal tool. It can generate several data formats, but users still rely on the builder to tell them which path to use. The tool fails to become the default workflow for testing-data construction.

Root cause:

The product confuses workflow stages, sample structures, and output formats, instead of organizing everything around the user's core batch data construction job.

## Correct Product Definition

CorpusFlow should be defined as:

> A controllable batch data construction and enhancement tool for evaluation query generation first, then SFT data repair and model iteration.

The product should not introduce feature names as top-level navigation unless they represent a different user job.

## Product Model

Use one unified model:

```text
Input source
-> Field mapping
-> Generation configuration
-> Sample structure
-> Output contract
-> Quality filtering
-> Export / integration
```

### Input Source

- Manual seed input.
- Table upload.
- Future: evaluation result upload.

### Field Mapping

- Query / input / output / label / score / error type.
- Use rules first, LLM fallback second.
- Always allow manual correction.

### Generation Configuration

- Generation intent.
- Target count.
- Diversity.
- Filter strength.
- Parameter generalization.
- Deduplication scope.

### Sample Structure

- Single-turn.
- Multi-turn switch.
- Future: multi-turn template type.

Multi-turn templates should start small:

- Reference continuation.
- Negation / correction.
- Cross-domain follow-up.
- Media or tool carrier switch.

### Output Contract

- Query-only evaluation set.
- QA pair.
- Instruction SFT.
- Multi-turn variants of the above.

Output contracts should be treated as export/data format choices, not as the main product identity.

### Quality Filtering

MVP should prioritize:

- Empty / malformed output filtering.
- Near-duplicate filtering.
- Train-test overlap detection.
- Basic semantic consistency checks.
- Manual review affordance.

Avoid prematurely building a heavy judge platform.

## Current Implementation Assessment

### Good Direction

1. Batch and fine-tune configuration mental models were aligned.
2. Multi-turn was demoted from a competing mode into a switch.
3. Code generation was removed from the batch UI.
4. LLaMA-Factory instruction fields were clarified.
5. Batch upload flow and duplicate button conflict were addressed.
6. Task deletion on homepage was added.

These changes reduce mode confusion and move the product closer to the batch production mental model.

### Remaining Product Gaps

1. Batch query generation must become the primary path.

The current product still visually carries "fine-tune" as a strong concept. Based on the PDFs, current strongest wedge is testing query generation, not SFT-first workflow.

2. Multi-turn switch needs templates next.

A switch alone answers "whether multi-turn", but not "what kind of multi-turn". The PDF examples make this clear:

- "开空调" -> "关掉"
- previous music/media context -> next query in another player
- previous RAG answer -> follow-up question
- cross-domain context change

3. Deduplication needs product-level visibility.

Meeting notes explicitly mention avoiding overlap between test data and training data. This cannot be hidden as a backend filter only.

4. Bad Case loop should start with clustering, not diagnosis.

Full diagnostic agent is too large. The smallest useful step is:

```text
upload eval result -> identify bad cases -> cluster -> create enhancement task
```

5. Forge / automated evaluation integration should be prepared but not block the MVP.

Expose export/API shape first. Do not make integration the next build blocker.

## Recommended Roadmap

### Phase 0: Clean Scope

Goal:

Make the current product stop saying too many things.

Do:

- Remove product-visible code generation.
- Keep top-level product language around evaluation query generation and data enhancement.
- Keep fine-tune as an output/export contract, not the leading concept.
- Keep multi-turn as a switch.

Do not:

- Add new top-level modes.
- Add full evaluation platform screens.
- Add general-purpose AI workflow builder concepts.

### Phase 1: Batch Query Generation MVP

Goal:

Make the testing team able to run a real 100-200 seed task end to end.

Must support:

- Stable table upload.
- Field recognition and manual correction.
- Generation count and diversity control.
- Parameter generalization.
- Deduplication.
- Export.
- Result review and deletion.

Acceptance:

- User can upload 100-200 seeds and generate usable evaluation queries without developer help.
- Export format can be consumed by the next testing step.
- The UI does not require users to understand separate "fine-tune" and "batch" logic.

### Phase 2: Multi-Turn Context Templates

Goal:

Support the real multi-turn scenarios from the sharing PDF without introducing complex configuration.

Add simple template choices:

- Reference continuation.
- Negation / correction.
- Cross-domain follow-up.
- Media/tool switch.

Acceptance:

- Multi-turn generated samples clearly mark previous turn and current query.
- Current query remains the target sample.
- Previous 1Q1A only provides context.
- Results can export both readable preview and downstream structured data.

### Phase 3: Deduplication and Data Boundary Control

Goal:

Address the testing team's concern that test data and training data overlap.

Add:

- Upload or select existing train set as exclusion corpus.
- Deduplication report.
- "Removed because overlap" reason.
- Configurable strictness.

Acceptance:

- User can explain why certain generated items were filtered.
- User can trust that test data is not trivially overlapping with train data.

### Phase 4: Bad Case Upload and Clustering

Goal:

Start the evaluation-to-enhancement loop without overbuilding diagnosis.

Add:

- Upload evaluation result.
- Identify query / score / error_type fields.
- Filter bad cases by threshold or error type.
- Cluster by intent or text similarity.
- Create enhancement task from a selected cluster.

Acceptance:

- User can go from an evaluation result file to a new batch enhancement task.
- The system does not need to generate a perfect "recipe" yet.

### Phase 5: Adaptive Recipe and Data Alchemist Vision

Goal:

Only after the previous phases work, add the larger Data Alchemist layer.

Add:

- AI diagnosis summary.
- P-N-H strategy suggestion.
- Dynamic variable pools.
- Template generation.
- Human confirmation.

Do this only when:

- Batch query generation usage is validated.
- Multi-turn templates are usable.
- Bad Case clustering creates meaningful enhancement tasks.

## What To Cut For Now

Cut or freeze:

- Code generation.
- Full evaluation platform.
- Full Forge integration.
- LangGraph / agentic architecture rewrite.
- Heavy LLM judge platform.
- Complex dynamic variable pool UI before Bad Case clustering is proven.
- Too many output modes in the left panel.

## What To Keep

Keep:

- Explicit multi-stage pipeline.
- Rules-first, LLM fallback principle.
- Human-in-the-loop confirmation.
- Batch generation mental model.
- Query generation as the near-term core.
- LLaMA-Factory compatibility as export/data-contract support.
- Multi-turn as sample topology.
- Lightweight quality filtering and deduplication.

## Metrics

### Phase 1 Metrics

- Upload success rate.
- Valid seed extraction rate.
- Generation completion rate for 100-200 seed tasks.
- Format pass rate.
- Deduplication removal rate.
- Manual edit rate.
- Time from upload to export.

### Phase 2 Metrics

- Multi-turn sample acceptance rate.
- Percentage of samples where current query remains the target.
- Percentage of samples where previous 1Q1A is relevant context.
- Manual correction rate for history/current query fields.

### Phase 3 Metrics

- Train-test overlap removal count.
- False positive removal rate from user review.
- User trust in deduplication report.

### Phase 4 Metrics

- Bad Case field recognition accuracy.
- Cluster usefulness rate.
- Percentage of clusters converted into enhancement tasks.

## Brief For Context Reset

CorpusFlow should currently be treated as a controllable batch evaluation-query and data-enhancement tool, not a full SFT factory or evaluation platform.

Correct source materials are:

- `/Users/Harland/Go/CorpusFlow_副本/数据构造需求分析.pdf`
- `/Users/Harland/Go/CorpusFlow_副本/数据合成&增强产品分享.pdf`

Core users:

- Testing team constructing evaluation queries.
- Data PM defining intent/schema and data requirements.
- Algorithm engineer using generated data for SFT/evaluation iteration.

Strongest near-term needs:

- Batch upload 100-200 seeds.
- High-quality query generation.
- Parameter generalization.
- Deduplication, especially train-test overlap control.
- Multi-turn query construction for reference continuation, negation/correction, cross-domain follow-up, and media/tool switch.
- Future Bad Case upload -> clustering -> enhancement task.

Product judgment:

- Verdict is **DE-SCOPE / 降级做**.
- First build the batch query generation workflow deeply.
- Multi-turn is a switch plus later lightweight templates, not a separate mode.
- Fine-tune / LLaMA-Factory fields are export/data-contract support, not primary positioning.
- Code generation is out of scope.
- Full Bad Case diagnosis, Forge integration, and evaluation platform are later phases.

Implementation direction:

- Align fine-tune and batch left-side configuration around the same batch-generation mental model.
- Keep output type simple: query/QA vs instruction fine-tune.
- Keep multi-turn as independent sample-structure switch.
- Next product work should prioritize upload stability, field mapping, dedup report, multi-turn templates, and batch result review/export.
