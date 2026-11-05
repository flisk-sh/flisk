// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Greedy delta debugging: keep taking the first smaller candidate that still fails until none does or the budget is spent.
// `candidates(s)` lists strictly smaller scenarios; `stillFails(s)` re-runs the property.
export function minimize(scenario, candidates, stillFails, budget = 24) {
  let best = scenario;
  let trials = 0;
  for (let progress = true; progress && trials < budget; ) {
    progress = false;
    for (const c of candidates(best)) {
      if (trials++ >= budget) break;
      if (stillFails(c)) { best = c; progress = true; break; }
    }
  }
  return { scenario: best, trials };
}
