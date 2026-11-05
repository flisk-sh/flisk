// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The five FALSIFIER properties. Each one: draw(seed) makes a scenario (plain JSON, so it is the reproducer), run(scenario, lab)
// returns null when the property holds or { expected, actual, surfaces } when it does not, shrink(scenario) lists smaller ones.
// The expectations come from lib/model.mjs, never from reading another surface of the CLI.
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { drawPlan, rng } from "../../e2e/scale/enigma36/plan.mjs";
import { envelope, runFlisk, walk } from "./lab.mjs";
import { dangling, findCycle, isValidName, parseComposeService } from "./model.mjs";

const pick = (next, list) => list[Math.floor(next() * list.length)];
const short = (s, n = 300) => String(s).replace(/\s+/g, " ").slice(0, n);

// ---------------------------------------------------------------- 1. invalid resources must be rejected
const BAD_NAMES = [
  (b) => b.toUpperCase(), (b) => `${b}_x`, (b) => `${b} x`, (b) => `${b}.x`, (b) => `${b}/x`, (b) => `${b}-`, (b) => `${b}é`, (b) => `${b}!`,
  (b) => `${b}-${"x".repeat(60)}`, (b) => "x".repeat(64), (b) => "x".repeat(90),
];
const invalidResource = {
  id: "invalid-resources-rejected",
  bug: "an invalid resource name, stack, type or a duplicate is accepted and scaffolded",
  weight: 30,
  draw(seed) {
    const next = rng(seed ^ 0x1a2b3c);
    const roll = next();
    const base = `s${seed % 1000}`;
    if (roll < 0.6) return { kind: "name", value: pick(next, BAD_NAMES)(base) };
    if (roll < 0.75) return { kind: "stack", name: base, value: pick(next, BAD_NAMES)("st") };
    if (roll < 0.85) return { kind: "type", name: base, value: pick(next, ["nonsense", "Backend", "backend ", "frontend,worker", "../backend"]) };
    return { kind: "duplicate", stack: pick(next, ["other", "edge"]) /* same stack = documented re-registration, not a duplicate */, type: pick(next, ["backend", "worker", "mcp"]) };
  },
  run(sc, lab) {
    const dir = lab.shared();
    const before = walk(dir);
    const args = ["resource", "--yes", "--json"];
    if (sc.kind === "name") args.splice(1, 0, sc.value, "--type", "backend");
    else if (sc.kind === "stack") args.splice(1, 0, sc.name, "--type", "backend", "--stack", sc.value);
    else if (sc.kind === "type") args.splice(1, 0, sc.name, "--type", sc.value);
    else args.splice(1, 0, "existing", "--type", sc.type, "--stack", sc.stack);
    const r = runFlisk(dir, args);
    const added = walk(dir).filter((f) => !before.includes(f));
    for (const top of new Set(added.map((f) => f.split("/").slice(0, 3).join("/")))) rmSync(path.join(dir, top), { recursive: true, force: true });
    const shown = sc.kind === "duplicate" ? `"existing" again in stack ${sc.stack}` : JSON.stringify(sc.value);
    if ((sc.kind === "name" || sc.kind === "stack") && isValidName(sc.value)) return null; // the draw is meant to be invalid; a valid one proves nothing
    if (r.code !== 0 && added.length === 0) return null;
    return { expected: `exit != 0 and nothing scaffolded for ${sc.kind} ${shown}`, actual: `exit ${r.code}, ${added.length} files created (${added.slice(0, 2).join(", ")})`, surfaces: ["flisk resource"] };
  },
  shrink(sc) {
    const v = sc.value;
    if (typeof v !== "string" || v.length <= 1) return [];
    return [{ ...sc, value: v.slice(0, Math.max(1, v.length >> 1)) }, { ...sc, value: v.slice(0, -1) }, { ...sc, value: v.slice(1) }].filter((c) => c.value !== v);
  },
};

// ---------------------------------------------------------------- 2. dependency cycles must be detected
const cycles = {
  id: "dependency-cycles-detected",
  bug: "a dependsOn cycle is accepted, or an acyclic graph (diamond, fan-in, long chain) is refused",
  weight: 25,
  draw(seed) {
    const next = rng(seed ^ 0x2b3c4d);
    const n = 2 + Math.floor(next() * 5);
    const order = Array.from({ length: n }, (_, i) => `n${i + 1}`).sort(() => next() - 0.5);
    const graph = Object.fromEntries(order.map((x) => [x, []]));
    const density = 0.25 + next() * 0.5;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (next() < density) graph[order[i]].push(order[j]);
    const mode = pick(next, ["dag", "dag", "back-edge", "self-loop", "two-cycle"]);
    const a = order[Math.floor(next() * n)];
    if (mode === "self-loop") graph[a].push(a);
    else if (mode !== "dag") { const b = pick(next, order.filter((x) => x !== a)); if (!graph[b].includes(a)) graph[b].push(a); if (mode === "two-cycle" && !graph[a].includes(b)) graph[a].push(b); }
    return { graph, mode };
  },
  run(sc, lab) {
    const dir = lab.clone();
    Object.entries(sc.graph).forEach(([name, dependsOn], i) => lab.addService(dir, { name, port: 4100 + i, dependsOn }));
    const verify = runFlisk(dir, ["config", "verify", "--json"]);
    const up = runFlisk(dir, ["up", "--dry-run", "--json"]);
    const cycle = findCycle(sc.graph);
    const v = envelope(verify)?.data;
    const refused = (r) => r.code !== 0;
    if (cycle) {
      const wrong = [];
      if (v?.valid !== false) wrong.push(`config verify valid=${v?.valid}`);
      if (!refused(up)) wrong.push("up --dry-run exit 0");
      const text = verify.stdout + up.stdout + up.stderr;
      if (wrong.length === 0 && !cycle.some((c) => text.includes(c))) wrong.push(`no message names a member of the cycle ${cycle.join("->")}`);
      return wrong.length ? { expected: `cycle ${cycle.join(" -> ")} refused by verify and up`, actual: wrong.join("; "), surfaces: ["config verify", "up --dry-run"] } : null;
    }
    const wrong = [];
    if (v?.valid !== true) wrong.push(`config verify valid=${v?.valid}: ${short(JSON.stringify(v?.errors ?? verify.stderr), 200)}`);
    if (refused(up)) wrong.push(`up --dry-run exit ${up.code}: ${short(up.stdout + up.stderr, 200)}`);
    return wrong.length ? { expected: "an acyclic graph is accepted", actual: wrong.join("; "), surfaces: ["config verify", "up --dry-run"] } : null;
  },
  shrink(sc) {
    const names = Object.keys(sc.graph);
    const out = [];
    for (const x of names) if (names.length > 2) out.push({ ...sc, graph: Object.fromEntries(names.filter((n) => n !== x).map((n) => [n, sc.graph[n].filter((d) => d !== x)])) });
    for (const x of names) for (const d of sc.graph[x]) out.push({ ...sc, graph: { ...sc.graph, [x]: sc.graph[x].filter((y) => y !== d) } });
    return out;
  },
};

// ---------------------------------------------------------------- 3. removing a resource removes its references
const removal = {
  id: "removal-leaves-no-references",
  bug: "a deleted resource still appears in status, up, or a generated file after `config regenerate`",
  weight: 15,
  draw(seed) {
    const next = rng(seed ^ 0x3c4d5e);
    const count = 3 + Math.floor(next() * 2);
    const plan = drawPlan(seed, { count });
    return { seed, count, remove: plan.entries[Math.floor(next() * count)].name };
  },
  run(sc, lab) {
    const { dir } = lab.enigmaProject(sc.seed, sc.count);
    const listed = envelope(runFlisk(dir, ["resources", "--json"]))?.data?.resources ?? [];
    const target = listed.find((r) => r.name === sc.remove);
    if (!target) return { expected: `${sc.remove} is listed before removal`, actual: "not listed", surfaces: ["resources"] };
    rmSync(path.dirname(target.path), { recursive: true, force: true });
    const regen = runFlisk(dir, ["config", "regenerate"]);
    const wrong = [];
    if (regen.code !== 0) wrong.push(`regenerate exit ${regen.code}: ${short(regen.stderr || regen.stdout, 160)}`);
    const status = runFlisk(dir, ["status", "--json"]);
    const up = runFlisk(dir, ["up", "--dry-run", "--json"]);
    const verify = envelope(runFlisk(dir, ["config", "verify", "--json"]))?.data;
    if (status.stdout.includes(sc.remove)) wrong.push("status still mentions it");
    if (up.stdout.includes(sc.remove)) wrong.push("up --dry-run still mentions it");
    if (verify?.valid !== true) wrong.push(`config verify valid=${verify?.valid}: ${short(JSON.stringify(verify?.errors), 160)}`);
    const files = walk(dir, new Set(["node_modules", ".git", "services", "packages"])).filter((f) => { try { return readFileSync(path.join(dir, f), "utf8").includes(sc.remove); } catch { return false; } });
    if (files.length) wrong.push(`still in generated files: ${files.slice(0, 4).join(", ")}`);
    return wrong.length ? { expected: `no reference to ${sc.remove} anywhere after removal + regenerate`, actual: wrong.join("; "), surfaces: ["status", "up --dry-run", "config verify", "generated files"] } : null;
  },
  shrink: () => [],
};

// ---------------------------------------------------------------- 4. export compose preserves resource definitions
const ENV_VALUES = ["plain", "a b", "007", "yes", "null", "1e3", "#hash", "k: v", 'say "hi"', "back\\slash", "ünï", "0x1F", "~", "tab\tsep", "$HOME", "x=y"];
const exportPreserves = {
  id: "compose-preserves-definitions",
  bug: "`flisk export compose` drops a resource, an env var, an image, or a dependency, or changes a value",
  weight: 15,
  draw(seed) {
    const next = rng(seed ^ 0x4d5e6f);
    const n = 1 + Math.floor(next() * 3);
    const resources = Array.from({ length: n }, (_, i) => ({
      name: `app-${i + 1}`,
      image: next() < 0.4 ? pick(next, ["nginx:1.27", "traefik/whoami:v1.10", "ghcr.io/acme/api:2.0"]) : null,
      env: Object.fromEntries(Array.from({ length: Math.floor(next() * 4) }, (_, k) => [`KEY_${k + 1}`, pick(next, ENV_VALUES)])),
      dependsOn: [],
    }));
    for (let i = 1; i < n; i++) if (next() < 0.6) resources[i].dependsOn.push(resources[Math.floor(next() * i)].name);
    return { resources };
  },
  run(sc, lab) {
    const dir = lab.clone();
    sc.resources.forEach((r, i) => lab.addService(dir, { name: r.name, template: "byo", port: 4200 + i, dependsOn: r.dependsOn, patch: { ...(r.image ? { image: r.image, dockerfile: undefined } : {}), ...(Object.keys(r.env).length ? { env: r.env } : {}) } }));
    const out = runFlisk(dir, ["export", "compose", "--dry-run"]);
    if (out.code !== 0) return { expected: "compose export succeeds for bring-your-own resources", actual: `exit ${out.code}: ${short(out.stderr || out.stdout, 200)}`, surfaces: ["export compose"] };
    const wrong = [];
    for (const r of sc.resources) {
      const svc = parseComposeService(out.stdout, r.name);
      if (!svc) { wrong.push(`${r.name} missing`); continue; }
      for (const [k, v] of Object.entries(r.env)) if (svc.env[k] !== v) wrong.push(`${r.name}.${k}: ${JSON.stringify(v)} became ${JSON.stringify(svc.env[k])}`);
      for (const d of r.dependsOn) if (!svc.dependsOn.includes(d)) wrong.push(`${r.name} lost dependsOn ${d}`);
      if (r.image && svc.image !== r.image) wrong.push(`${r.name}.image ${r.image} became ${JSON.stringify(svc.image)}`);
    }
    return wrong.length ? { expected: "every resource, env value, image and dependency survives the export", actual: wrong.slice(0, 5).join("; "), surfaces: ["export compose"] } : null;
  },
  shrink(sc) {
    const out = [];
    for (let i = 0; i < sc.resources.length; i++) if (sc.resources.length > 1) {
      const gone = sc.resources[i].name;
      out.push({ resources: sc.resources.filter((_, j) => j !== i).map((r) => ({ ...r, dependsOn: r.dependsOn.filter((d) => d !== gone) })) });
    }
    sc.resources.forEach((r, i) => { for (const k of Object.keys(r.env)) out.push({ resources: sc.resources.map((x, j) => j === i ? { ...x, env: Object.fromEntries(Object.entries(x.env).filter(([kk]) => kk !== k)) } : x) }); });
    sc.resources.forEach((r, i) => { for (const d of r.dependsOn) out.push({ resources: sc.resources.map((x, j) => j === i ? { ...x, dependsOn: x.dependsOn.filter((y) => y !== d) } : x) }); });
    return out;
  },
};

// ---------------------------------------------------------------- 5. repeated validation is deterministic
const VOLATILE = /(^|_)(time|timestamp|duration|elapsed|ms|at|date)$/i;
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([k]) => !VOLATILE.test(k)).map(([k, v]) => [k, stable(v)]));
  return value;
}
const hashTree = (dir) => createHash("sha256").update(walk(dir, new Set(["node_modules", ".git", "services", "packages"])).map((f) => `${f}\0${readFileSync(path.join(dir, f))}`).join("\n")).digest("hex");
const determinism = {
  id: "validation-is-deterministic",
  bug: "the same project gives different status, verify, up or regenerated files on a second run",
  weight: 15,
  draw(seed) { const next = rng(seed ^ 0x5e6f70); return { seed, count: 3 + Math.floor(next() * 2) }; },
  run(sc, lab) {
    const { dir } = lab.enigmaProject(sc.seed, sc.count);
    const wrong = [];
    for (const args of [["config", "verify", "--json"], ["status", "--json"], ["resources", "--json"], ["stacks", "--json"], ["up", "--dry-run", "--json"]]) {
      const a = runFlisk(dir, args);
      const b = runFlisk(dir, args);
      const ja = JSON.stringify(stable(envelope(a)));
      const jb = JSON.stringify(stable(envelope(b)));
      if (a.code !== b.code || ja !== jb) wrong.push(`${args.slice(0, 2).join(" ")} differs between two runs`);
    }
    runFlisk(dir, ["config", "regenerate"]);
    const first = hashTree(dir);
    runFlisk(dir, ["config", "regenerate"]);
    if (hashTree(dir) !== first) wrong.push("a second `config regenerate` changed generated files");
    return wrong.length ? { expected: "identical output for identical input", actual: wrong.join("; "), surfaces: ["config verify", "status", "resources", "stacks", "up --dry-run", "config regenerate"] } : null;
  },
  shrink: () => [],
};

export const PROPERTIES = [invalidResource, cycles, removal, exportPreserves, determinism];
export { dangling };
