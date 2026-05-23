import assert from "node:assert/strict";
import test from "node:test";
import {
  EVALUATION_DEMO_ROWS,
  attachAssetPackage,
  attachPreview,
  createEvaluationSnapshotFromRows,
  inferEvidenceRoles,
  serializeEvalAssetFile,
  setClusterStatus,
  updateClusterStrategy,
} from "../src/utils/evaluationMode";

test("inferEvidenceRoles maps common eval and trace fields into evidence roles", () => {
  const roles = inferEvidenceRoles([
    "trace_id",
    "messages",
    "actual_output",
    "expected_behavior",
    "retrieved_contexts",
    "tool_calls",
    "grading_result",
    "latency_ms",
    "human_feedback",
  ]);

  const mapped = Object.fromEntries(roles.map((role) => [role.role, role.header]));

  assert.equal(mapped.identity, "trace_id");
  assert.equal(mapped.input, "messages");
  assert.equal(mapped.actual, "actual_output");
  assert.equal(mapped.expected, "expected_behavior");
  assert.equal(mapped.context, "retrieved_contexts");
  assert.equal(mapped.tooling, "tool_calls");
  assert.equal(mapped.judgment, "grading_result");
  assert.equal(mapped.runtime, "latency_ms");
  assert.equal(mapped.annotation, "human_feedback");
});

test("createEvaluationSnapshotFromRows normalizes heterogeneous eval rows without fixed column names", () => {
  const snapshot = createEvaluationSnapshotFromRows({
    taskId: "eval-task-1",
    sourceFile: "mixed-eval.json",
    now: "2026-05-22T00:00:00.000Z",
    rows: [
      {
        eval_id: "r1",
        user_input: "那附近还有停车场吗？",
        answer: "请告诉我地点。",
        reference: "继承上一轮目的地并查询停车场。",
        score: 0.1,
        comment: "多轮上下文丢失。",
        session_id: "s1",
      },
      {
        id: "r2",
        prompt: "输出 JSON，字段只保留 name",
        completion: "好的，名字是 A。",
        ideal: "{\"name\":\"A\"}",
        pass: "false",
        reason: "格式错误。",
      },
    ],
  });

  assert.equal(snapshot.stats.rawCount, 2);
  assert.equal(snapshot.stats.evidenceCount, 2);
  assert.equal(snapshot.stats.failedCount, 2);
  assert.equal(snapshot.cases[0]?.sourceCaseId, "r1");
  assert.equal(snapshot.cases[0]?.completeness, "A");
  assert.ok(snapshot.cases[0]?.provenance.fieldMapping["interaction.input"]);
  assert.ok(snapshot.oneSentenceConclusion.includes("问题集中在"));
  assert.ok(snapshot.clusters.some((cluster) => cluster.name === "多轮上下文承接失败"));
  assert.ok(snapshot.clusters.some((cluster) => cluster.name === "格式或结构错误"));
});

test("cluster decisions and strategy edits drive preview and package counts consistently", () => {
  const snapshot = createEvaluationSnapshotFromRows({
    taskId: "eval-task-2",
    sourceFile: "demo.csv",
    rows: EVALUATION_DEMO_ROWS,
    now: "2026-05-22T00:00:00.000Z",
  });
  const firstCluster = snapshot.clusters[0]!;
  const secondCluster = snapshot.clusters[1]!;
  const withRejected = setClusterStatus(snapshot, secondCluster.id, "rejected");
  const tuned = updateClusterStrategy(withRejected, firstCluster.id, { count: 3 });
  const preview = attachPreview(tuned, "2026-05-22T00:01:00.000Z").preview!;
  const packaged = attachAssetPackage(tuned, "2026-05-22T00:02:00.000Z").package!;
  const acceptedClusters = tuned.clusters.filter((cluster) => cluster.status === "accepted");
  const expectedTotal = acceptedClusters.reduce((sum, cluster) => sum + cluster.recommendedStrategy.count, 0);
  const packageTotal = packaged.files["eval_cases.jsonl"]
    + packaged.files["training_candidates.jsonl"]
    + packaged.files["negative_cases.jsonl"];

  assert.equal(tuned.clusters.find((cluster) => cluster.id === secondCluster.id)?.status, "rejected");
  assert.ok(preview.files["eval_cases.jsonl"] + preview.files["training_candidates.jsonl"] + preview.files["negative_cases.jsonl"] <= acceptedClusters.length * 2);
  assert.equal(packageTotal, expectedTotal);
  assert.equal(packaged.assets.provenance.length, packageTotal);
});

test("serializeEvalAssetFile emits line-oriented training assets and provenance", () => {
  const snapshot = attachAssetPackage(
    createEvaluationSnapshotFromRows({
      taskId: "eval-task-3",
      sourceFile: "demo.csv",
      rows: EVALUATION_DEMO_ROWS.slice(0, 2),
      now: "2026-05-22T00:00:00.000Z",
    }),
    "2026-05-22T00:03:00.000Z",
  );
  const assetPackage = snapshot.package!;
  const fileName = assetPackage.files["training_candidates.jsonl"] > 0
    ? "training_candidates.jsonl"
    : "eval_cases.jsonl";
  const content = serializeEvalAssetFile(assetPackage, fileName);
  const provenance = JSON.parse(serializeEvalAssetFile(assetPackage, "provenance.json")) as unknown[];
  const packageTotal = assetPackage.files["eval_cases.jsonl"]
    + assetPackage.files["training_candidates.jsonl"]
    + assetPackage.files["negative_cases.jsonl"];
  const expanded = serializeEvalAssetFile(assetPackage, "batch_expanded_assets.jsonl");

  assert.ok(content.split("\n").filter(Boolean).length > 0);
  assert.equal(expanded.split("\n").filter(Boolean).length, packageTotal);
  assert.match(expanded, /asset_type/);
  assert.match(expanded, /strategy_batch_expansion/);
  assert.match(expanded, /batch_strategy_expander_v0/);
  assert.ok(!expanded.includes("\"llm_inference\":true"));
  assert.equal(provenance.length, packageTotal);
  assert.match(content, /instruction|input/);
});
