import assert from "node:assert/strict";
import fs from "node:fs";
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

function readJsonlFixture<T>(filePath: string): T[] {
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

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

test("migration badcase fixture keeps routing failures distinct from missing tool calls", () => {
  const rows = readJsonlFixture<Record<string, unknown>>("fixtures/evaluation/migration_badcase_dimensions.jsonl");
  const snapshot = createEvaluationSnapshotFromRows({
    taskId: "migration-badcase-dimensions",
    sourceFile: "migration_badcase_dimensions.jsonl",
    rows,
    now: "2026-05-25T00:00:00.000Z",
  });
  const casesBySourceId = new Map(snapshot.cases.map((caseItem) => [caseItem.sourceCaseId, caseItem]));
  const domainCases = snapshot.cases.filter((caseItem) => caseItem.sourceCaseId.startsWith("migration-domain-error"));
  const chatExecutionCases = snapshot.cases.filter((caseItem) => caseItem.sourceCaseId.startsWith("chat-eval-execution"));
  const weakAnswerCases = snapshot.cases.filter((caseItem) => caseItem.sourceCaseId.startsWith("migration-weak-answer"));

  assert.equal(snapshot.stats.rawCount, rows.length);
  assert.equal(snapshot.stats.failedCount, rows.length);
  assert.ok(domainCases.length >= 6);
  assert.ok(chatExecutionCases.length >= 6);
  assert.ok(weakAnswerCases.length >= 6);
  assert.ok(snapshot.clusters.some((cluster) => cluster.name === "工具选择错误"));
  assert.ok(snapshot.clusters.some((cluster) => cluster.name === "弱答或空泛回答"));
  assert.ok(snapshot.clusters.some((cluster) => cluster.name === "负向情绪或投诉处理不足"));
  assert.ok(!snapshot.clusters.some((cluster) => cluster.name === "应调用工具但未调用"));
  assert.ok(!snapshot.clusters.some((cluster) => cluster.failureSignals.includes("safety_boundary")));

  for (const caseItem of domainCases) {
    assert.ok(caseItem.annotation.tags.includes("wrong_tool"), JSON.stringify(caseItem.annotation.tags));
    assert.ok(!caseItem.annotation.tags.includes("tool_not_called"), JSON.stringify(caseItem.annotation.tags));
  }

  for (const caseId of ["migration-weak-answer-001", "migration-weak-answer-002"]) {
    assert.ok(casesBySourceId.get(caseId)?.annotation.tags.includes("weak_answer"));
  }

  for (const caseId of ["migration-negative-emotion-001", "migration-complaint-001"]) {
    assert.equal(casesBySourceId.get(caseId)?.annotation.tags[0], "negative_emotion");
    assert.ok(!casesBySourceId.get(caseId)?.annotation.tags.includes("tool_not_called"));
  }
});

test("raw Chat eval execution fields map to concrete failure signals", () => {
  const snapshot = createEvaluationSnapshotFromRows({
    taskId: "raw-chat-eval",
    sourceFile: "badcases_answer_quality.jsonl",
    rows: [
      {
        run_id: "mt_migration90_20260515_095956_e4a4c8",
        query: "明天的天气怎么样",
        final_text_snippet: "搜索2026-05-16的天气怎么样 天气失败，请稍后重试（工具：get_weather）",
        corrected_expected_mode: "tool_call",
        corrected_expected_tool: "get_weather",
        got_tool: "get_weather",
        tool_status: "fallback_or_error",
        result_quality: "fallback_search",
        effective_query: "2026-05-16的天气怎么样",
        passed: "False",
        fail_reason: "wrong_mode",
        answer_quality: "unusable",
        answer_quality_reason: "fallback_search made the answer unusable",
      },
    ],
    now: "2026-05-25T00:00:00.000Z",
  });
  const tags = snapshot.cases[0]!.annotation.tags;

  assert.ok(tags.includes("memory_missing"), JSON.stringify(tags));
  assert.ok(tags.includes("wrong_tool"), JSON.stringify(tags));
  assert.ok(tags.includes("weak_answer"), JSON.stringify(tags));
  assert.ok(!tags.includes("unknown_failure"), JSON.stringify(tags));
  assert.ok(!tags.includes("tool_not_called"), JSON.stringify(tags));
  assert.ok(!tags.includes("safety_boundary"), JSON.stringify(tags));
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
  const qualityReport = JSON.parse(serializeEvalAssetFile(packaged, "quality_report.json")) as Record<string, unknown>;
  const acceptedClusters = tuned.clusters.filter((cluster) => cluster.status === "accepted");
  const expectedTotal = acceptedClusters.reduce((sum, cluster) => sum + cluster.recommendedStrategy.count, 0);
  const packageTotal = packaged.files["eval_cases.jsonl"]
    + packaged.files["training_candidates.jsonl"]
    + packaged.files["negative_cases.jsonl"];

  assert.equal(tuned.clusters.find((cluster) => cluster.id === secondCluster.id)?.status, "rejected");
  assert.ok(preview.files["eval_cases.jsonl"] + preview.files["training_candidates.jsonl"] + preview.files["negative_cases.jsonl"] <= acceptedClusters.length * 2);
  assert.equal(packageTotal, expectedTotal);
  assert.equal(packaged.assets.provenance.length, packageTotal);
  assert.equal(qualityReport["已拒绝根因数（rejected_cluster_count）"], 1);
  assert.equal((qualityReport["已拒绝根因（rejected_clusters）"] as unknown[]).length, 1);
});

test("strategy edits can update cluster repair target and construction rule", () => {
  const snapshot = attachPreview(createEvaluationSnapshotFromRows({
    taskId: "eval-task-strategy",
    sourceFile: "demo.csv",
    rows: EVALUATION_DEMO_ROWS,
    now: "2026-05-22T00:00:00.000Z",
  }));
  const cluster = snapshot.clusters[0]!;
  const tuned = updateClusterStrategy(snapshot, cluster.id, {
    count: 7,
    solution: "补齐工具路由边界样本，要求动作/问答意图显式区分。",
    strategyTemplate: "围绕同一车控实体生成咨询问法、动作问法和反事实边界问法。",
  });
  const tunedCluster = tuned.clusters.find((item) => item.id === cluster.id)!;

  assert.equal(tunedCluster.recommendedStrategy.count, 7);
  assert.match(tunedCluster.recommendedStrategy.solution, /工具路由边界/);
  assert.match(tunedCluster.recommendedStrategy.strategyTemplate, /反事实边界/);
  assert.equal(tuned.preview, null);
  assert.equal(tuned.package, null);
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
  const qualityReport = JSON.parse(serializeEvalAssetFile(assetPackage, "quality_report.json")) as Record<string, unknown>;
  const packageTotal = assetPackage.files["eval_cases.jsonl"]
    + assetPackage.files["training_candidates.jsonl"]
    + assetPackage.files["negative_cases.jsonl"];
  const expanded = serializeEvalAssetFile(assetPackage, "batch_expanded_assets.jsonl");
  const expandedRecords = expanded.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const expandedRecord = expandedRecords[0]!;
  const provenanceRecord = provenance[0] as Record<string, unknown>;
  const expandedAssetIds = new Set(expandedRecords.map((record) => record["资产编号（id）"]));

  assert.ok(content.split("\n").filter(Boolean).length > 0);
  assert.equal(expanded.split("\n").filter(Boolean).length, packageTotal);
  assert.ok(Object.keys(expandedRecord).includes("资产编号（id）"));
  assert.ok(Object.keys(expandedRecord).includes("资产类型（asset_type）"));
  assert.ok(Object.keys(expandedRecord).includes("指令（instruction）"));
  assert.ok(Object.keys(expandedRecord).includes("期望输出（expected_output）"));
  assert.ok(Object.keys(provenanceRecord).includes("资产编号（assetId）"));
  assert.ok(Object.keys(provenanceRecord).includes("来源文件（sourceFile）"));
  assert.ok(Object.keys(provenanceRecord).includes("根因假设（rootCauseHypothesis）"));
  assert.ok(Object.keys(provenanceRecord).includes("生成策略（strategyTemplate）"));
  assert.ok(Object.keys(provenanceRecord).includes("修复方向（strategySolution）"));
  assert.ok(Object.keys(provenanceRecord).includes("是否LLM推理（llm_inference）"));
  assert.ok(Object.keys(qualityReport).includes("扩增资产数（expanded_asset_count）"));
  assert.ok(expandedAssetIds.has(provenanceRecord["资产编号（assetId）"]));
  assert.match(expanded, /strategy_batch_expansion/);
  assert.match(expanded, /batch_strategy_expander_v0/);
  assert.ok(!expanded.includes("\"是否LLM推理（llm_inference）\":true"));
  assert.equal(provenance.length, packageTotal);
  assert.match(content, /指令（instruction）|评测输入（input）/);
});
