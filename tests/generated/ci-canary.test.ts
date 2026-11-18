import { expect, test } from "vitest";

// Deliberate failure to prove Auto-fix wakes the session. Reverted right after.
test("ci canary", () => {
  expect(1).toBe(2);
});
