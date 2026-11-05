// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// FALSIFIER: property-based tests that try to disprove what Flisk should do. No Docker, no Tilt, no CI cost.
//   node tests/falsifier/run.mjs [--seed <n>] [--scenarios 100] [--property <id>] [--out <dir>] [--save-regressions]
//   node tests/falsifier/run.mjs --replay <regressions/file.json>
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeLab } from "./lib/lab.mjs";
import { minimize } from "./lib/minimize.mjs";
import { PROPERTIES } from "./lib/properties.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const commit = () => spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: here, encoding: "utf8" }).stdout.trim();

// 100 scenarios split by each property's weight; scenario i of a property is seed + i, so any one replays on its own.
export function plan(total, only) {
  const props = only ? PROPERTIES.filter((p) => p.id === only) : PROPERTIES;
  if (only && props.length === 0) throw new Error(`unknown property "${only}"; expected one of ${PROPERTIES.map((p) => p.id).join(", ")}`);
  const sum = props.reduce((s, p) => s + p.weight, 0);
  return props.map((p) => ({ property: p, n: only ? total : Math.max(1, Math.round((total * p.weight) / sum)) }));
}

export function check(property, seed, lab) {
  const scenario = property.draw(seed);
  let failure;
  try { failure = property.run(scenario, lab); } catch (e) { failure = { expected: "the property runs", actual: `crashed: ${e.message.slice(0, 300)}`, surfaces: [] }; }
  lab.sweep();
  return failure ? { scenario, failure } : null;
}

export function falsify(total = 100, seed0 = 1, { only, log = console.log } = {}) {
  const lab = makeLab();
  const found = [];
  const t0 = Date.now();
  try {
    for (const { property, n } of plan(total, only)) {
      const t = Date.now();
      const bugs = [];
      for (let i = 0; i < n; i++) {
        const seed = seed0 + i;
        const hit = check(property, seed, lab);
        if (!hit) continue;
        const small = minimize(hit.scenario, property.shrink, (s) => { try { return !!property.run(s, lab); } catch { return true; } });
        const again = (() => { try { return property.run(small.scenario, lab); } catch { return hit.failure; } })() ?? hit.failure;
        bugs.push({ engine: "FALSIFIER", property: property.id, seed, commit: commit(), scenario: hit.scenario, minimized: small.scenario, shrinkTrials: small.trials, expected: again.expected, actual: again.actual, surfaces: again.surfaces, reproduction: `node tests/falsifier/run.mjs --property ${property.id} --seed ${seed} --scenarios 1`, regression_test: "pending" });
      }
      log(`${property.id}: ${n} scenarios, ${bugs.length} failing, ${((Date.now() - t) / 1000).toFixed(0)}s`);
      // many seeds usually hit one defect: report each distinct (expected shape, actual) once
      const seen = new Set();
      for (const b of bugs) { const key = `${b.property}|${b.actual.replace(/\d+/g, "N").slice(0, 80)}`; if (!seen.has(key)) { seen.add(key); found.push(b); } }
    }
  } finally { lab.dispose(); }
  return { found, seconds: (Date.now() - t0) / 1000, ran: plan(total, only).reduce((sum, x) => sum + x.n, 0) };
}

function main(argv) {
  const arg = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
  if (argv.includes("--replay")) {
    const fx = JSON.parse(readFileSync(arg("--replay"), "utf8"));
    const lab = makeLab();
    try {
      const p = PROPERTIES.find((x) => x.id === fx.property);
      const r = p.run(fx.minimized, lab);
      console.log(r ? `STILL FAILS: ${r.actual}` : "passes");
      return r ? 1 : 0;
    } finally { lab.dispose(); }
  }
  const seed = Number(arg("--seed") ?? 1);
  const total = Number(arg("--scenarios") ?? 100);
  const { found, seconds, ran } = falsify(total, seed, { only: arg("--property") });
  for (const b of found) console.log(`\nFALSIFIED ${b.property} (seed ${b.seed}, commit ${b.commit})\n  expected: ${b.expected}\n  actual:   ${b.actual}\n  minimal:  ${JSON.stringify(b.minimized)}\n  replay:   ${b.reproduction}`);
  console.log(`\n${ran} scenarios, ${found.length} distinct defect(s), ${seconds.toFixed(0)}s`);
  const out = arg("--out");
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, "falsifier-failures.json"), `${JSON.stringify(found, null, 2)}\n`); }
  if (argv.includes("--save-regressions")) for (const b of found) writeFileSync(path.join(here, "regressions", `${b.property}-${b.seed}.json`), `${JSON.stringify({ ...b, status: "open" }, null, 2)}\n`);
  return found.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
