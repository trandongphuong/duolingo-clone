import test from "node:test";
import assert from "node:assert/strict";
import { nextReview } from "../lib/review";

test("correct review intervals are 1, 3, 7, 14 days and bounded", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  for (const [step, days] of [1, 3, 7, 14].entries()) {
    const result = nextReview(step, true, now);
    assert.equal(result.dueAt.getTime() - now.getTime(), days * 86_400_000);
    assert.equal(result.step, Math.min(step + 1, 3));
    assert.equal(result.lastResult, true);
  }
  assert.equal(nextReview(100, true, now).step, 3);
});

test("wrong answers reset review and become due immediately", () => {
  const now = new Date("2026-11-09T00:00:00Z");
  const result = nextReview(3, false, now);
  assert.equal(result.step, 0);
  assert.equal(result.dueAt.getTime(), now.getTime());
  assert.equal(result.lastResult, false);
});
