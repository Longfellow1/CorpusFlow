import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf-8");

test("evaluation parse delegates to algorithm service with local fallback", () => {
  assert.match(serverSource, /callAlgorithm<EvaluationSnapshot>\("\/evaluation\/analyze"/);
  assert.match(serverSource, /createEvaluationSnapshotFromRows\(/);
});

test("evaluation preview and package delegate asset generation to algorithm service", () => {
  assert.match(serverSource, /callAlgorithm<.*>\("\/evaluation\/assets"/s);
  assert.match(serverSource, /attachPreview\(/);
  assert.match(serverSource, /attachAssetPackage\(/);
});
