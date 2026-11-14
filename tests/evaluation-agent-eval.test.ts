import assert from "node:assert/strict";
import test from "node:test";
import {
  EVALUATION_AGENT_GOLDEN_CASES,
  EVALUATION_AGENT_TIER_THRESHOLDS,
  evaluateEvaluationAgent,
  getEvaluationAgentGoldenCases,
} from "../scripts/evaluation-agent-eval";

test("evaluation enhancement agent meets golden badcase-to-asset thresholds", () => {
  const report = evaluateEvaluationAgent(EVALUATION_AGENT_GOLDEN_CASES);

  assert.equal(report.passed, true, JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.overallScore >= report.thresholds.overallScore, JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.signalRecall >= report.thresholds.signalRecall, JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.strategyMatchScore >= report.thresholds.strategyMatchScore, JSON.stringify(report.summary, null, 2));
  assert.equal(report.summary.provenancePassRate, 1, JSON.stringify(report.summary, null, 2));
  assert.deepEqual(report.summary.criticalFailures, []);

  for (const result of report.results) {
    assert.ok(result.scores.diagnosis >= 0.75, `${result.id} diagnosis score too low`);
    assert.ok(result.scores.dataRecommendation >= 0.8, `${result.id} data recommendation score too low`);
    assert.ok(result.scores.assetQuality >= 0.8, `${result.id} asset quality score too low`);
  }
});

test("evaluation enhancement agent exposes smoke, regression, and full eval tiers", () => {
  const smoke = getEvaluationAgentGoldenCases("smoke");
  const regression = getEvaluationAgentGoldenCases("regression");
  const full = getEvaluationAgentGoldenCases("full");

  const fullFixture = full.find((golden) => golden.id === "migration-full-badcase-regression");

  assert.ok(smoke.length >= 3);
  assert.ok(regression.length > smoke.length);
  assert.ok(full.length > regression.length);
  assert.ok(fullFixture, "full tier should include migration-full-badcase-regression");
  assert.ok(fullFixture.expectedFailedCount >= 500);
  assert.ok(EVALUATION_AGENT_TIER_THRESHOLDS.full.signalRecall >= 0.85);
});

test("full evaluation tier meets stricter regression thresholds", () => {
  const report = evaluateEvaluationAgent(getEvaluationAgentGoldenCases("full"), EVALUATION_AGENT_TIER_THRESHOLDS.full);

  assert.equal(report.passed, true, JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.signalRecall >= report.thresholds.signalRecall, JSON.stringify(report.summary, null, 2));
  assert.ok(report.summary.unknownFailureRate <= report.thresholds.unknownFailureRate, JSON.stringify(report.summary, null, 2));
  assert.equal(report.summary.provenancePassRate, 1, JSON.stringify(report.summary, null, 2));
  assert.deepEqual(report.summary.criticalFailures, []);
});
