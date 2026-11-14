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
//   node tests/e2e/scale/enigma36/plan.mjs [--seed <n>] [--count <n>] [--include a,b]   prints the plan as JSON
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registryAxes } from "../../lib/registry-axes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const COUNT = 36;
export const STACKS = ["rotor-i", "rotor-ii", "rotor-iii", "rotor-iv", "rotor-v", "rotor-vi"];
// The kinds every plan holds at least once. library and migrator are not creatable with `flisk resource --type`; inference
// pulls a multi-gigabyte model image, so it stays in its own suite.
export const KINDS = ["backend", "frontend", "worker", "mcp", "agent", "database", "queue", "storage", "mail", "payment", "bring-your-own", "sdk"];
// Each infrastructure server (Postgres, Redis, Qdrant, MinIO, MLflow, NATS, RabbitMQ) appears at most once: a second one of the
// same framework only collides on its UI host port and adds boot time, not combinations. Every one of them is always drawn
// when the count leaves room, so a plan never holds just the Postgres.
const MAX_PER_VARIANT = 1;
// The `flisk resource --type` values whose frameworks are infrastructure presets (cli/src/utils/infra-presets.ts).
export const INFRA_KINDS = ["database", "queue", "storage", "mail", "payment"];
// The type `flisk status` and the scaffold envelope report. Every infrastructure framework except the shared Postgres is a
// bring-your-own container (docs/byo.md, "Infrastructure frameworks").
export const reportedType = (e) => (INFRA_KINDS.includes(e.kind) && e.variant !== "postgres" ? "bring-your-own" : e.kind);

// The infrastructure frameworks `flisk resource --type <database|queue|storage|mail|payment> --framework <id>` creates, read from the CLI's INFRA_PRESETS
// (the top-level keys, two-space indent) so a new framework joins the draw without editing this file.
export function infraFrameworks(root = path.resolve(here, "../../../..")) {
  const text = readFileSync(path.join(root, "cli/src/utils/infra-presets.ts"), "utf8");
  const from = text.indexOf("export const INFRA_PRESETS");
  if (from < 0) throw new Error("cli/src/utils/infra-presets.ts has no INFRA_PRESETS");
  const to = text.indexOf("\n} ", from);
  const ids = [...presetEntries(text.slice(from, to < 0 ? undefined : to))].map(([id]) => id);
  if (ids.length === 0) throw new Error("INFRA_PRESETS lists no frameworks");
  return ids;
}

// Each preset's id and the `--type` it belongs to (its `type: <KIND>_RESOURCE_TYPE` line), so a framework of a new kind joins
// the draw under that kind without editing this file. Keys may be quoted ("stripe-mock").
function presetEntries(block) {
  return [...block.matchAll(/\n  "?([a-z][\w-]*)"?: \{\n    type: ([A-Z]+)_RESOURCE_TYPE,/g)].map((m) => [m[1], m[2].toLowerCase()]);
}

// The `--type` of every infrastructure framework, read from INFRA_PRESETS like infraFrameworks.
export function infraKindOf(root = path.resolve(here, "../../../..")) {
  const text = readFileSync(path.join(root, "cli/src/utils/infra-presets.ts"), "utf8");
  const from = text.indexOf("export const INFRA_PRESETS");
  const to = text.indexOf("\n} ", from);
  return Object.fromEntries(presetEntries(text.slice(from, to < 0 ? undefined : to)));
}

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
  const infraKind = infraKindOf();
  return [
    ...axes.httpFramework.map((f) => ({ kind: "backend", variant: f, args: ["--framework", f] })),
    ...axes.language.filter((l) => l !== "bun").map((l) => ({ kind: "backend", variant: l, args: ["--language", l] })),
    ...axes.frontendFramework.map((f) => ({ kind: "frontend", variant: f, args: ["--framework", f] })),
    { kind: "worker", variant: "worker", args: [] },
    { kind: "mcp", variant: "mcp", args: [] },
    ...axes.agentDurability.map((d) => ({ kind: "agent", variant: `agent-${d}`, args: ["--durability", d] })),
    { kind: "database", variant: "postgres", args: ["--framework", "postgres"] },
    ...(axes.infraFramework ?? infraFrameworks()).map((f) => ({
      kind: infraKind[f] ?? "database",
      variant: f,
      args: ["--framework", f],
    })),
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
  for (const kind of INFRA_KINDS) {
    for (const variant of new Set(entries.filter((e) => e.kind === kind).map((e) => e.variant))) {
      const n = entries.filter((e) => e.kind === kind && e.variant === variant).length;
      if (n > MAX_PER_VARIANT) problems.push(`${n} ${variant} ${kind} resources, at most ${MAX_PER_VARIANT}`);
    }
  }
  // An agent checkpointing to Postgres needs the project's database in the draw, and in its own stack: the database resource
  // provisions <project>_<stack>, so an agent in another stack gets "database does not exist" and never answers /ready.
  const database = entries.find((e) => e.variant === "postgres");
  if (entries.some((e) => e.variant === "agent-postgres") && !database) {
    problems.push("an agent-postgres without a database resource");
  }
  for (const e of entries) {
    if (e.variant === "agent-postgres" && database && e.stack !== database.stack) {
      problems.push(`${e.name} is on ${e.stack} but the database is on ${database.stack}`);
    }
  }
  return problems;
}

// Draw the plan for a seed: one of each kind first, then the rest from every piece, shuffled, then six stacks dealt so none is
// empty. Throws when the diagonal board finds a contradiction, so a broken draw fails before anything is scaffolded.
export function drawPlan(seed, { count = COUNT, include = [], axes = registryAxes(path.resolve(here, "../../../..")) } = {}) {
  const next = rng(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const all = pieces(axes);
  // One of each kind first; the database kind is the shared Postgres, so an agent-postgres always finds it.
  const first = KINDS.map((kind) =>
    kind === "database" ? all.find((p) => p.variant === "postgres") : pick(all.filter((p) => p.kind === kind && p.variant !== "agent-postgres")),
  );
  // Then every other infrastructure framework (Redis, Qdrant, MinIO, MLflow, RabbitMQ, NATS), so the mix holds more than one
  // database; the ones the first deal already took are skipped.
  const infra = all.filter((p) => INFRA_KINDS.includes(p.kind) && !first.some((f) => f.variant === p.variant));
  // Variants the caller asked for by name (ENIGMA_INCLUDE=redis,minio,go): always in the plan, whatever the seed draws.
  const asked = include.map((v) => {
    const piece = all.find((p) => p.variant === v);
    if (!piece) throw new Error(`unknown variant "${v}" in include; the rotors hold: ${[...new Set(all.map((p) => p.variant))].join(", ")}`);
    return piece;
  });
  const extra = asked.filter((p, i) => !first.some((f) => f.variant === p.variant) && asked.findIndex((q) => q.variant === p.variant) === i);
  const drawn = [...first, ...extra, ...infra.filter((p) => !extra.some((e) => e.variant === p.variant))].slice(0, count);
  const missing = asked.filter((p) => !drawn.some((d) => d.variant === p.variant));
  if (missing.length > 0) throw new Error(`count ${count} is too small to hold ${missing.map((p) => p.variant).join(", ")}`);
  while (drawn.length < count) {
    const piece = pick(all);
    if (INFRA_KINDS.includes(piece.kind) && drawn.some((p) => p.variant === piece.variant)) continue;
    drawn.push(piece);
  }
  for (let i = drawn.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [drawn[i], drawn[j]] = [drawn[j], drawn[i]];
  }
  const stacks = drawn.map((_, i) => (i < STACKS.length ? STACKS[i] : pick(STACKS)));
  // The database resource provisions one database per stack, so every Postgres-checkpointed agent joins the database's stack.
  const dbIndex = drawn.findIndex((p) => p.variant === "postgres");
  const emptied = (i) => stacks.filter((s, k) => k !== i && s === stacks[i]).length === 0;
  drawn.forEach((p, i) => {
    if (p.variant !== "agent-postgres" || dbIndex < 0 || stacks[i] === stacks[dbIndex]) return;
    if (emptied(i)) {
      // Moving this agent would empty its stack; swap stacks with a non-database, non-postgres-agent resource instead.
      const j = drawn.findIndex((q, k) => k !== dbIndex && q.variant !== "agent-postgres" && stacks[k] === stacks[dbIndex]);
      if (j < 0) return;
      [stacks[i], stacks[j]] = [stacks[j], stacks[i]];
    } else stacks[i] = stacks[dbIndex];
  });
  const entries = drawn.map((p, i) => ({
    name: `e${String(i + 1).padStart(2, "0")}-${p.variant}`,
    kind: p.kind,
    type: reportedType(p),
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
  const include = (arg("--include") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  console.log(JSON.stringify(drawPlan(seed, { count, include }), null, 2));
}
