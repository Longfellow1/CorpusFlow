import assert from "node:assert/strict";
import test from "node:test";
import { withMinimumDuration } from "../src/utils/timing";

test("withMinimumDuration keeps fast work visible for at least the requested duration", async () => {
  const startedAt = Date.now();

  const result = await withMinimumDuration(async () => "ready", 24);

  assert.equal(result, "ready");
  assert.ok(Date.now() - startedAt >= 20);
});

test("withMinimumDuration does not add delay after slow work already exceeds the minimum", async () => {
  const startedAt = Date.now();

  const result = await withMinimumDuration(
    () => new Promise<string>((resolve) => {
      setTimeout(() => resolve("slow-ready"), 28);
    }),
    12,
  );

  const elapsed = Date.now() - startedAt;
  assert.equal(result, "slow-ready");
  assert.ok(elapsed >= 24);
  assert.ok(elapsed < 80);
});
