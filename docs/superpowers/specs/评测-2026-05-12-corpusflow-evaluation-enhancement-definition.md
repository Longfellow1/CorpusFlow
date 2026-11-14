# CorpusFlow Evaluation Enhancement Definition

Date: 2026-05-12

## Background

CorpusFlow is not an eval platform.

The broader eval methodology defines a full loop:

```text
Contract + Truth + Trace + Review
-> Dataset
-> Runner / Grader / Judge
-> Report
-> Gate
-> Feedback Loop
```

CorpusFlow should not own this whole loop. Its mission is narrower: turn raw seeds, bad cases, evaluation needs, and failure signals into controllable, reviewable, exportable data assets.

The third-stage product question is therefore not:

```text
How do we build evaluation?
```

It is:

```text
After evaluation has already found failures, how does CorpusFlow help users turn those failures into useful enhancement data?
```

## Product Judgment

Verdict: `DE-SCOPE / 降级做`.

The direction is valid, but the wording "evaluation mode" is dangerous. It can pull the product toward runner, judge, report, baseline comparison, CI, and release gate features. Those belong to EvalOps infrastructure, not CorpusFlow.

The correct third-stage definition is:

```text
Evaluation Enhancement Mode
```

It handles the segment after eval results exist and before the next training, regression, or benchmark dataset is prepared.

## Core Product Definition

Evaluation Enhancement Mode helps testing and algorithm teams transform evaluation failures into structured enhancement tasks and exportable data assets.

Core workflow:

```text
Upload eval result / badcase file
-> Detect fields
-> Filter failed or low-score cases
-> Group by failure signal or ability gap
-> Create enhancement task from a selected group
-> Generate query / QA / multi-turn / instruct variants
-> Review generated samples
-> Export with dataset intent and provenance
```

It does not decide whether the evaluated system is good enough. It helps users produce the next useful dataset from evidence that the system was not good enough.

## Three-Stage Positioning

CorpusFlow's three stages should be understood as three input situations:

```text
I have seeds
-> Quick Task

I have high-value seeds that need control
-> Fine-Tune Generation

I have eval failures or badcases
-> Evaluation Enhancement
```

The stages are not three unrelated feature modes. They are a maturity path from raw generation to controlled generation to failure-driven enhancement.

## Keep In Scope

- Upload evaluation result files.
- Identify fields such as `query`, `expected`, `actual`, `score`, `passed`, `error_type`, `category`, `trace_id`, and `model_version`.
- Filter bad cases by failure flag, score threshold, or error type.
- Cluster or group cases by intent, text similarity, error type, or ability tag.
- Create a normal CorpusFlow generation task from a selected cluster.
- Support lightweight multi-turn templates for common eval failure shapes:
  - reference continuation
  - negation or correction
  - cross-domain follow-up
  - previous-answer follow-up
  - tool or media carrier switch
- Export generated samples with intent labels such as `regression`, `negative`, `gold_candidate`, `silver_candidate`, or `training_candidate`.
- Preserve provenance: source file, row id, trace id, failure type, cluster id, and generation config.

## Keep Out Of Scope

- Eval runner.
- LLM judge platform.
- Report center.
- Release gate.
- CI integration.
- Baseline comparison as a first-class product area.
- Full gold set lifecycle management.
- Deep diagnosis, adaptive recipe generation, or P-N-H strategy UI in the first version.

## Why This Matters

The demand side does not only need more generated data. They need a way to turn evaluation evidence into the next round of usable data.

If CorpusFlow stops at seed expansion, it remains a data generator.

If it owns evaluation execution, it becomes the wrong product.

If it owns the transformation from eval failure to enhancement task, it becomes the missing bridge between evaluation systems and data production.

## One-Sentence Definition

CorpusFlow Evaluation Enhancement Mode is a failure-driven data enhancement workflow: it does not run eval, but turns eval failures into reviewable, generatable, and exportable data assets.
