// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE scenarios: a seed draws the shape of one generated project, and the shape fixes what every Flisk surface must say about
// it (the `expect` block). The mix of resource types for the "enigma-mix" shape is ENIGMA's own draw (drawPlan), so one seed
// names the same resources in both engines; the other shapes are the places where the surfaces are known to be able to disagree
// (a project of only bring-your-own containers needs no PostgreSQL and no DB_PASSWORD).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drawPlan, rng } from "../../e2e/scale/enigma36/plan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../..");
export const SHAPES = ["enigma-mix", "byo-only", "byo-no-proxy", "byo-postgres-dep"];
// Salt so the shape draw does not walk the same PRNG stream as the ENIGMA draw for the same seed.
const SALT = 0x0badc0de;

// scenario = { seed, shape, resources: [{ name, kind, stack, args, byo?: { exposeViaProxy, dependsOn } }], expect: { database, gateway } }
//   expect.database: the shared PostgreSQL is needed; expect.gateway: some resource is routed through the proxy.
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
      resources: plan.entries.map((e) => ({ name: e.name, kind: e.kind, stack: e.stack, args: e.args })),
      expect: { database: true, gateway: true },
    };
  }
  const resources = Array.from({ length: n }, (_, i) =>
    byo(i, {
      exposeViaProxy: chosen !== "byo-no-proxy",
      dependsOn: chosen === "byo-postgres-dep" && i === 0 ? ["postgres"] : [],
    }),
  );
  return { seed, shape: chosen, resources, expect: { database: chosen === "byo-postgres-dep", gateway: chosen !== "byo-no-proxy" } };
}
