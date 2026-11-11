// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE scenarios: a seed draws the shape of one generated project, and the shape fixes what every Flisk surface must say about
// it (the `expect` block). The mix of resource types for the "enigma-mix" shape is ENIGMA's own draw (drawPlan), so one seed
// names the same resources in both engines; the other shapes are the places where the surfaces are known to be able to disagree
// (a project of only bring-your-own containers needs no PostgreSQL and no DB_PASSWORD).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawPlan, reportedType, rng } from "../../e2e/scale/enigma36/plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../..");
export const SHAPES = ["enigma-mix", "byo-only", "byo-no-proxy", "byo-postgres-dep", "multi-stack", "infra-toggle", "depends-chain", "depends-cycle", "depends-dangling"];
const INFRA = ["monitoring", "elk", "debezium", "golden_image"];
// Salt so the shape draw does not walk the same PRNG stream as the ENIGMA draw for the same seed.
const SALT = 0x0badc0de;

// scenario = { seed, shape, resources: [{ name, kind, stack, args, byo?: { exposeViaProxy, dependsOn }, dependsOn? }], infra?, expect }
//   expect.database: the shared PostgreSQL is needed; expect.gateway: some resource is routed through the proxy;
//   expect.cycle / expect.dangling: the dependsOn graph has a cycle / a name that is no service (config verify must refuse both);
//   infra: { <optional infra service>: boolean } applied with `flisk config enable-infra|disable-infra`.
export function drawScenario(seed, { shape, count = 8 } = {}) {
  const next = rng((seed ^ SALT) >>> 0);
  const chosen = shape ?? SHAPES[Math.floor(next() * SHAPES.length)];
  if (!SHAPES.includes(chosen)) throw new Error(`unknown shape ${chosen}; expected one of ${SHAPES.join(", ")}`);
  const n = 1 + Math.floor(next() * 3);
  const byo = (i, opts) => ({ name: `byo-${i + 1}`, kind: "bring-your-own", stack: "main", args: [], byo: opts });
  if (chosen === "enigma-mix") {
    const plan = drawPlan(seed, { count });
    return {
      seed, shape: chosen,
      // `type` is what status reports: a queue or a MySQL-style database is a bring-your-own container (docs/byo.md)
      resources: plan.entries.map((e) => ({ name: e.name, kind: e.kind, type: reportedType(e), stack: e.stack, args: e.args })),
      expect: { database: true, gateway: true, cycle: false, dangling: false },
    };
  }
  const backend = (name, stack, dependsOn = []) => ({ name, kind: "backend", stack, args: [], dependsOn });
  const ok = { database: true, gateway: true, cycle: false, dangling: false };
  if (chosen === "multi-stack") {
    const stacks = ["main", "edge", "data"].slice(0, 2 + Math.floor(next() * 2));
    const resources = Array.from({ length: 3 + Math.floor(next() * 3) }, (_, i) => backend(`svc-${i + 1}`, stacks[i % stacks.length]));
    return { seed, shape: chosen, resources, expect: ok };
  }
  if (chosen === "infra-toggle") {
    const infra = Object.fromEntries(INFRA.map((k) => [k, next() < 0.5]));
    return { seed, shape: chosen, resources: [backend("svc-1", "main")], infra, expect: ok };
  }
  if (chosen.startsWith("depends-")) {
    const len = 2 + Math.floor(next() * 3);
    const names = Array.from({ length: len }, (_, i) => `svc-${i + 1}`);
    // a chain svc-1 -> svc-2 -> ... ; the cycle shape closes it, the dangling shape adds a name that is not a service
    const dep = (i) => (i + 1 < len ? [names[i + 1]] : chosen === "depends-cycle" ? [names[0]] : []);
    const resources = names.map((name, i) => backend(name, "main", chosen === "depends-dangling" && i === 0 ? [...dep(i), "ghost"] : dep(i)));
    return { seed, shape: chosen, resources, expect: { ...ok, cycle: chosen === "depends-cycle", dangling: chosen === "depends-dangling" } };
  }
  const resources = Array.from({ length: n }, (_, i) =>
    byo(i, {
      exposeViaProxy: chosen !== "byo-no-proxy",
      dependsOn: chosen === "byo-postgres-dep" && i === 0 ? ["postgres"] : [],
    }),
  );
  return { seed, shape: chosen, resources, expect: { database: chosen === "byo-postgres-dep", gateway: chosen !== "byo-no-proxy", cycle: false, dangling: false } };
}
