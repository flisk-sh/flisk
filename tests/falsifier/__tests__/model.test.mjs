// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { minimize } from "../lib/minimize.mjs";
import { dangling, findCycle, isValidName, parseComposeService } from "../lib/model.mjs";
import { PROPERTIES } from "../lib/properties.mjs";
import { plan } from "../run.mjs";

test("isValidName is an RFC 1123 label", () => {
  for (const ok of ["a", "svc-1", "1a", "x".repeat(63)]) assert.equal(isValidName(ok), true, ok);
  for (const bad of ["", "A", "a_b", "a b", "a.b", "a/b", "a-", "-a", "é", "x".repeat(64)]) assert.equal(isValidName(bad), false, bad);
});

test("findCycle: self-loop, two-cycle, cycle with tail; diamond and chain are acyclic", () => {
  assert.deepEqual(findCycle({ a: ["a"] }), ["a"]);
  assert.equal(findCycle({ a: ["b"], b: ["a"] }).length, 2);
  assert.deepEqual(new Set(findCycle({ t: ["a"], a: ["b"], b: ["c"], c: ["a"] })), new Set(["a", "b", "c"]));
  assert.equal(findCycle({ a: ["b", "c"], b: ["d"], c: ["d"], d: [] }), null);
  assert.equal(findCycle({ a: ["ghost"] }), null);
});

test("dangling names the missing target", () => assert.deepEqual(dangling({ a: ["b", "x"], b: [] }), [{ from: "a", to: "x" }]));

test("parseComposeService reads quoted env and flags unquoted scalars", () => {
  const text = 'services:\n  api:\n    image: "nginx:1"\n    environment:\n      A: "x y"\n      B: yes\n    depends_on:\n      db:\n        condition: service_started\n  db:\n    init: true\n';
  const api = parseComposeService(text, "api");
  assert.equal(api.image, "nginx:1");
  assert.equal(api.env.A, "x y");
  assert.deepEqual(api.env.B, { raw: "yes" });
  assert.deepEqual(parseComposeService(text, "db").env, {});
  assert.equal(parseComposeService(text, "nope"), null);
});

test("minimize reaches a local minimum within budget", () => {
  const shrink = (xs) => xs.map((_, i) => xs.filter((__, j) => j !== i));
  const r = minimize([1, 2, 3, 4, 5], shrink, (xs) => xs.includes(3));
  assert.deepEqual(r.scenario, [3]);
  assert.ok(minimize([1, 2, 3], shrink, () => true, 1).trials <= 1);
  assert.equal(minimize([1, 2, 3], shrink, () => false, 1).trials, 1);
});

test("every property draws the same scenario for the same seed and has an id, a bug and a weight", () => {
  const ids = new Set();
  for (const p of PROPERTIES) {
    assert.ok(p.id && p.bug && p.weight > 0);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
    for (const seed of [1, 7, 99]) assert.deepEqual(p.draw(seed), p.draw(seed));
  }
  assert.equal(PROPERTIES.length, 5);
});

test("an unknown property id is refused", () => assert.throws(() => plan(5, "cycles"), /unknown property/));

test("the default plan is 100 scenarios; --property takes all of them", () => {
  const total = plan(100).reduce((s, x) => s + x.n, 0);
  assert.ok(total >= 98 && total <= 102, String(total));
  assert.deepEqual(plan(7, "validation-is-deterministic").map((x) => x.n), [7]);
});
