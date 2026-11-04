// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The Enigma 36 rotors: a seeded draw of 36 resources across every resource type `flisk resource` can create, spread over six
// stacks. The same seed always draws the same project, so a failing nightly is replayed with E2E_SEED=<seed>. The pieces come
// from the CLI registries (registry-axes.mjs), so a new framework or language joins the draw without editing this file.
//
// Before a plan leaves this file it goes through the diagonal board (after Welchman's addition to the Bombe, which threw out
// every plugboard guess that contradicted itself before the machine ran it): checkPlan lists every invariant the draw broke, and
// drawPlan refuses a plan with any. tests/e2e/lib/__tests__/enigma36-plan.test.mjs runs the board over hundreds of seeds, so a draw can never boot a
// project that was contradictory to begin with.
//
//   node tests/e2e/scale/enigma36/plan.mjs [--seed <n>] [--count <n>]   prints the plan as JSON
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registryAxes } from "../../lib/registry-axes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const COUNT = 36;
export const STACKS = ["rotor-i", "rotor-ii", "rotor-iii", "rotor-iv", "rotor-v", "rotor-vi"];
// The kinds every plan holds at least once. library and migrator are not creatable with `flisk resource --type`; inference
// pulls a multi-gigabyte model image, so it stays in its own suite.
export const KINDS = ["backend", "frontend", "worker", "mcp", "agent", "database", "bring-your-own", "sdk"];
// One Postgres per project is enough: more only adds boot time, not combinations.
const MAX_PER_KIND = { database: 1 };

// mulberry32: a small seeded PRNG that is the same on every Node version and platform.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every piece the rotors can land on: { kind, variant, args } where args are the extra `flisk resource` arguments.
export function pieces(axes) {
  return [
    ...axes.httpFramework.map((f) => ({ kind: "backend", variant: f, args: ["--framework", f] })),
    ...axes.language.filter((l) => l !== "bun").map((l) => ({ kind: "backend", variant: l, args: ["--language", l] })),
    ...axes.frontendFramework.map((f) => ({ kind: "frontend", variant: f, args: ["--framework", f] })),
    { kind: "worker", variant: "worker", args: [] },
    { kind: "mcp", variant: "mcp", args: [] },
    ...axes.agentDurability.map((d) => ({ kind: "agent", variant: `agent-${d}`, args: ["--durability", d] })),
    { kind: "database", variant: "postgres", args: [] },
    { kind: "bring-your-own", variant: "whoami", args: [] },
    { kind: "sdk", variant: "sdk", args: [] },
  ];
}

// The diagonal board: every invariant a plan must hold, as a list of contradictions (empty when the plan is sound).
export function checkPlan(plan, count = COUNT) {
  const problems = [];
  const entries = plan.entries ?? [];
  if (entries.length !== count) problems.push(`plan has ${entries.length} resources, expected ${count}`);
  const names = entries.map((e) => e.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) problems.push(`duplicate names: ${dupes.join(", ")}`);
  for (const e of entries) {
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(e.name) || e.name.length > 40) problems.push(`${e.name} is not a short kebab-case name`);
    if (!STACKS.includes(e.stack)) problems.push(`${e.name} is on unknown stack ${e.stack}`);
    if (!KINDS.includes(e.kind)) problems.push(`${e.name} has kind ${e.kind}, which the rotors do not hold`);
  }
  if (count >= KINDS.length) {
    for (const kind of KINDS) if (!entries.some((e) => e.kind === kind)) problems.push(`no ${kind} in the plan`);
  }
  if (count >= STACKS.length) {
    for (const stack of STACKS) if (!entries.some((e) => e.stack === stack)) problems.push(`stack ${stack} is empty`);
  }
  for (const [kind, max] of Object.entries(MAX_PER_KIND)) {
    const n = entries.filter((e) => e.kind === kind).length;
    if (n > max) problems.push(`${n} ${kind} resources, at most ${max}`);
  }
  // An agent checkpointing to Postgres needs the project's database in the draw.
  if (entries.some((e) => e.variant === "agent-postgres") && !entries.some((e) => e.kind === "database")) {
    problems.push("an agent-postgres without a database resource");
  }
  return problems;
}

// Draw the plan for a seed: one of each kind first, then the rest from every piece, shuffled, then six stacks dealt so none is
// empty. Throws when the diagonal board finds a contradiction, so a broken draw fails before anything is scaffolded.
export function drawPlan(seed, { count = COUNT, axes = registryAxes(path.resolve(here, "../../../..")) } = {}) {
  const next = rng(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const all = pieces(axes);
  const drawn = KINDS.slice(0, count).map((kind) => pick(all.filter((p) => p.kind === kind && p.variant !== "agent-postgres")));
  while (drawn.length < count) {
    const piece = pick(all);
    const max = MAX_PER_KIND[piece.kind];
    if (max !== undefined && drawn.filter((p) => p.kind === piece.kind).length >= max) continue;
    drawn.push(piece);
  }
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [drawn[i], drawn[j]] = [drawn[j], drawn[i]];
  }
  const stacks = drawn.map((_, i) => (i < STACKS.length ? STACKS[i] : pick(STACKS)));
  const entries = drawn.map((p, i) => ({
    name: `e${String(i + 1).padStart(2, "0")}-${p.variant}`,
    kind: p.kind,
    variant: p.variant,
    stack: stacks[i],
    args: p.args,
  }));
  const plan = { seed, count, entries };
  const problems = checkPlan(plan, count);
  if (problems.length > 0) throw new Error(`seed ${seed} drew a contradictory plan: ${problems.join("; ")}`);
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
  };
  const seed = Number(arg("--seed") ?? Math.floor(Math.random() * 2 ** 31));
  const count = Number(arg("--count") ?? COUNT);
  console.log(JSON.stringify(drawPlan(seed, { count }), null, 2));
}
