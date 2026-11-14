import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSignalRules,
  readSignalAuditRows,
  summarizeSignalAudit,
} from "../scripts/evaluation-signal-audit";

test("signal audit proves tightened routing and safety rules reduce false positives", () => {
  const rows = readSignalAuditRows([
    "fixtures/evaluation/migration_badcase_dimensions.jsonl",
    "tmp/migration-eval-dimensions/combined_eval_rows.jsonl",
  ]);
  const report = summarizeSignalAudit(compareSignalRules(rows, "migration-signal-audit"));

  assert.ok(report.totalRows >= 100);
  assert.ok(report.current.expectedRecall >= 0.85, JSON.stringify(report, null, 2));
  assert.ok(report.current.unknownFailureRate <= 0.12, JSON.stringify(report, null, 2));
  assert.ok(
    report.current.falsePositiveRates.tool_not_called < report.old.falsePositiveRates.tool_not_called,
    JSON.stringify(report.focusDeltas, null, 2),
  );
  assert.ok(
    report.current.falsePositiveRates.safety_boundary < report.old.falsePositiveRates.safety_boundary,
    JSON.stringify(report.focusDeltas, null, 2),
  );
  assert.equal(report.current.bySignal.tool_not_called ?? 0, 0);
  assert.equal(report.current.bySignal.safety_boundary ?? 0, 0);
});
