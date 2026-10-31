// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/scale/enigma36/plan.mjs: the seeded draw and its diagonal board. Run by `make test-shell`.
import assert from "node:assert/strict";
import test from "node:test";
import { COUNT, KINDS, STACKS, checkPlan, drawPlan } from "../../scale/enigma36/plan.mjs";

test("the same seed draws the same plan", () => {
  assert.deepEqual(drawPlan(1936), drawPlan(1936));
});

test("different seeds draw different plans", () => {
  const names = (seed) => drawPlan(seed).entries.map((e) => e.name).join(",");
  assert.notEqual(names(1), names(2));
});

test("the diagonal board finds no contradiction in 500 seeds", () => {
  for (let seed = 0; seed < 500; seed++) {
    const plan = drawPlan(seed);
    assert.equal(plan.entries.length, COUNT);
    assert.deepEqual(checkPlan(plan), [], `seed ${seed}`);
  }
});

test("every plan holds every kind and every stack", () => {
  const plan = drawPlan(7);
  for (const kind of KINDS) assert.ok(plan.entries.some((e) => e.kind === kind), kind);
  for (const stack of STACKS) assert.ok(plan.entries.some((e) => e.stack === stack), stack);
});

test("the diagonal board rejects contradictory plans", () => {
  const plan = drawPlan(3);
  const twin = { ...plan, entries: [...plan.entries.slice(0, -1), { ...plan.entries[0] }] };
  assert.ok(checkPlan(twin).some((p) => p.startsWith("duplicate names")));
  const twoDatabases = {
    ...plan,
    entries: plan.entries.map((e, i) => (i < 2 ? { ...e, kind: "database", variant: "postgres", name: `db-${i}` } : e)),
  };
  assert.ok(checkPlan(twoDatabases).some((p) => p.includes("database resources")));
  const orphanAgent = {
    ...plan,
    entries: plan.entries.map((e) => (e.kind === "database" ? { ...e, kind: "agent", variant: "agent-postgres" } : e)),
  };
  assert.ok(checkPlan(orphanAgent).includes("an agent-postgres without a database resource"));
  assert.ok(checkPlan({ entries: plan.entries.slice(1) }).some((p) => p.startsWith("plan has 35")));
});

test("a smaller count still draws a sound plan", () => {
  const plan = drawPlan(42, { count: 12 });
  assert.equal(plan.entries.length, 12);
  assert.deepEqual(checkPlan(plan, 12), []);
});
