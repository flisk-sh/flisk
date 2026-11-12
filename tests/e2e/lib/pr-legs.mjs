// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Narrows a resource-types/orm matrix (suite-matrix.mjs) to the legs a pull request's changed files touch, so a change to one
// framework runs only that framework's legs. Used by the plan job of .github/workflows/e2e-resource-types.yml on pull requests;
// merge_group, nightly, release and manual runs keep the full matrix.
//
//   git diff --name-only "$BASE_SHA" HEAD | node tests/e2e/lib/pr-legs.mjs '<matrix json>' [--templates-before <file>]
//       [--base <rev>] [--explain <file>]
//
// --base <rev> lets the rules read a file's old content (git show <rev>:<file>), so an edit that changes only a comment, a
// description or one case selects only what it changes, the way a build graph hashes inputs instead of looking at paths.
// --explain <file> appends a table of file -> rule -> legs to <file> (the workflow passes $GITHUB_STEP_SUMMARY).
//
// Each changed file selects legs by the first rule that applies:
//   0. a file listed in a bring-your-own variant's `inputs` (suite.json globs) selects exactly the variants that list it;
//   1. a unit test in cli/src (*.test.ts, __tests__/) selects nothing: it does not change the CLI a leg runs;
//   2. cli/src/frontend-frameworks/<name>.ts selects frontend-<name>; its registry.ts or types.ts every frontend leg and the canary;
//   3. cli/src/backend-languages/<lang>.ts selects the <lang> language legs; its registry.ts or types.ts every language and the canary;
//   4. cli/src/agent-runtimes/** selects the agent leg;
//   5. examples/byo/<folder>/** or examples/byo-jobs/<folder>/** selects the bring-your-own legs whose variant args name
//      <folder>; an entry of examples/byo/templates.json counts as its folder (pass the base version with --templates-before);
//   6. a verify script of the bring-your-own suite, or a tests/e2e/fixtures/<dir>/ that one reads, selects the variants whose
//      case runs that script;
//   7. a file inside one suite's folder (tests/e2e/<group>/<suite>/) selects that suite's legs; with --base, the bring-your-own
//      run.sh selects the variants of the cases whose function changed (comments and blank lines are not changes), and its
//      suite.json the variants whose entry changed (the description is not a change); any other change there is suite-wide;
//   8. an engine file that belongs to one area selects that area's legs (ENGINE_AREAS): a vite framework file its frontend leg,
//      the vite and frontend generators every frontend leg, byo_*.star the bring-your-own variants that use its key, the prisma layer prisma and
//      migrator; engine docs and Starlark unit tests select nothing;
//   9. the files that decide the matrix (FULL_PATHS: this workflow, pr-legs.mjs, suite-matrix.mjs) select every leg;
//  10. any other file that matches SHARED_PATHS (shared CLI code, the rest of the engine, tests/e2e/lib, common.sh) selects the
//      CANARY legs, one per kind of suite; the merge queue and nightly still run every leg;
//  11. anything else (docs, unrelated code) selects nothing.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Rule 8. Engine files that belong to one area, first match wins: [pattern, legs], where legs is a leg predicate built from the match.
const FRONTEND = (leg) => leg.dir === "resource-types/frontend";
export const ENGINE_AREAS = [
  [/^runtime\/engine\/(.*\.md|topologies\/tilt\/manifest\/tests\/.*)$/, () => () => false],
  [/^runtime\/engine\/topologies\/tilt\/generators\/vite\/frameworks\/([a-z0-9-]+)\.star$/, (m) => (leg) => FRONTEND(leg) && leg.framework === m[1]],
  [
    /^runtime\/engine\/topologies\/(tilt\/generators\/vite\/|tilt\/generators\/typescript\/frontend_[a-z_]+\.star$|platform\/docker\/build\/frontend_build_plan\.star$|tilt\/resources\/orchestrator\/generators\/frontend\.star$)/,
    () => FRONTEND,
  ],
  // A byo_*.star file runs the variants whose case sets the manifest key it handles (BYO_FILE_VARIANTS); one not listed runs the
  // first variant of each case, since the variants of one case run the same engine code with different apps.
  [
    /^runtime\/engine\/topologies\/platform\/docker\/compose\/byo_([a-z_]+)\.star$/,
    (m) => (leg, byo) =>
      leg.dir === BYO_DIR && (BYO_FILE_VARIANTS[m[1]] ? ["example", ...BYO_FILE_VARIANTS[m[1]]].includes(leg.variant) : byo.firstOfCase.has(leg.variant)),
  ],
  [
    /^runtime\/engine\/topologies\/(platform\/docker\/layers\/prisma\/|tilt\/generators\/typescript\/prisma_config\.star$)/,
    () => (leg) => ["orm/prisma", "resource-types/migrator"].includes(leg.dir),
  ],
  [/^runtime\/engine\/(topologies\/tilt\/resources\/orchestrator\/apply_migrator_orchestration\.star|assets\/scripts\/cleanup-completed-migrator-images\.sh)$/, () => (leg) => leg.dir === "resource-types/migrator"],
];

// Rule 8. The bring-your-own variants whose verify script sets the manifest key a compose/byo_<name>.star file handles. Every file
// also runs the example variant, which loads them all, so a syntax error shows up. An empty list: no case sets that key, and
// tests/tilt-engine covers the generated Compose lines.
export const BYO_FILE_VARIANTS = {
  container: ["hpc", "job"], // container block (GPUs, IPC, shm) in verify-byo-hpc.sh; restart: no in verify-byo-job.sh
  ports: ["ports", "infra"], // extraPorts in verify-byo-ports.sh and verify-byo-infra.sh
  shared_database: ["flisk", "job"], // a dependsOn on Flisk's Postgres
  env: [],
  env_file: [],
  volumes: [],
  sidecar: [],
  models: [],
  build_logging: [],
  secrets_configs: [],
};

// Rule 9. The files that decide which legs run: a change to them is checked against every leg.
export const FULL_PATHS = /^(\.github\/workflows\/e2e-resource-types\.yml|tests\/e2e\/lib\/(pr-legs|suite-matrix)\.mjs)$/;

// Rule 10. One leg per kind of suite, run for a shared change on a pull request.
export const CANARY = ["bun", "frontend-react", "bring-your-own-example", "agent", "migrator", "prisma"];

// Rule 10. Keep in step with what the resource-type and ORM suites read (their suite.json paths).
export const SHARED_PATHS =
  /^(cli\/src\/commands\/(agent|restart|resource)\.ts$|cli\/src\/mcp\/|cli\/src\/frontend-frameworks\/|cli\/src\/backend-languages\/|cli\/src\/backend-frameworks\/|runtime\/engine\/|\.claude\/skills\/|scripts\/sync-flisk-skills\.sh$|tests\/e2e\/(lib|resource-types|orm)\/|\.github\/workflows\/e2e-resource-types\.yml$)/;

const BYO_DIR = "resource-types/bring-your-own";
const FRONTEND_DIR = "resource-types/frontend";
const AGENT_DIR = "resource-types/agent";
const LANGUAGE_GROUP = "languages";
const SHARED_MODULES = new Set(["registry", "types"]);

// The bring-your-own suite's variants ({id, case, args}) and, per case, the verify scripts its function in run.sh calls.
function byoSuite(e2eDir) {
  const dir = path.join(e2eDir, BYO_DIR);
  const suiteFile = path.join(dir, "suite.json");
  const variants = existsSync(suiteFile) ? (JSON.parse(readFileSync(suiteFile, "utf8")).variants ?? []) : [];
  const scriptsByCase = new Map();
  const runSh = path.join(dir, "run.sh");
  if (existsSync(runSh)) {
    let current = null;
    for (const line of readFileSync(runSh, "utf8").split("\n")) {
      const start = line.match(/^([A-Z]+[0-9]+)\(\)/);
      if (start) current = start[1];
      if (current) {
        for (const m of line.matchAll(/(verify-[a-z0-9-]+\.sh)/g)) {
          if (!scriptsByCase.has(current)) scriptsByCase.set(current, new Set());
          scriptsByCase.get(current).add(m[1]);
        }
        if (/^\}/.test(line) || (start && /\}\s*$/.test(line))) current = null;
      }
    }
  }
  const firstOfCase = new Set([...new Map([...variants].reverse().map((v) => [v.case, v.id])).values()]);
  return { dir, variants, scriptsByCase, firstOfCase };
}

// The folders of examples/byo whose templates.json entry differs between two versions of the file (added, removed or changed).
export function changedTemplateFolders(before, after) {
  const byFolder = (doc) => new Map((doc?.templates ?? []).map((t) => [t.folder, JSON.stringify(t)]));
  const a = byFolder(before);
  const b = byFolder(after);
  const folders = new Set();
  for (const [folder, entry] of a) if (b.get(folder) !== entry) folders.add(folder);
  for (const [folder, entry] of b) if (a.get(folder) !== entry) folders.add(folder);
  return [...folders].sort();
}

// A glob of suite.json `inputs` as a RegExp: `*` stays inside one path segment, `**` crosses them, `**/` may match nothing.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else re += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// A shell script without its comments, blank lines and trailing spaces: what a change must alter to count as one.
const normalizeShell = (lines) =>
  lines
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "" && !/^\s*#/.test(l))
    .join("\n");

// run.sh split into its case functions (BY1() { ... }) and everything else.
export function runShBlocks(text) {
  const blocks = new Map();
  const rest = [];
  let current = null;
  let body = [];
  for (const line of text.split("\n")) {
    const start = current ? null : line.match(/^([A-Z]+[0-9]+)\(\)/);
    if (start) {
      current = start[1];
      body = [line];
      if (/\}\s*$/.test(line)) {
        blocks.set(current, normalizeShell(body));
        current = null;
      }
    } else if (current) {
      body.push(line);
      if (/^\}/.test(line)) {
        blocks.set(current, normalizeShell(body));
        current = null;
      }
    } else rest.push(line);
  }
  if (current) blocks.set(current, normalizeShell(body));
  return { blocks, rest: normalizeShell(rest) };
}

// What a run.sh edit changes: the cases whose function differs, or the whole suite when the code outside the functions does.
export function changedByoCases(base, head) {
  const before = runShBlocks(base);
  const after = runShBlocks(head);
  const cases = new Set();
  for (const name of new Set([...before.blocks.keys(), ...after.blocks.keys()])) {
    if (before.blocks.get(name) !== after.blocks.get(name)) cases.add(name);
  }
  return { cases, suiteWide: before.rest !== after.rest };
}

// What a suite.json edit changes: the variants whose entry differs, or the whole suite when any key but the description and the
// variants does (cases, paths, triggers, timeouts).
export function changedByoVariants(base, head) {
  const before = JSON.parse(base);
  const after = JSON.parse(head);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("description");
  keys.delete("variants");
  const suiteWide = [...keys].some((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const byId = (doc) => new Map((doc.variants ?? []).map((v) => [v.id, JSON.stringify(v)]));
  const a = byId(before);
  const b = byId(after);
  const ids = new Set();
  for (const id of new Set([...a.keys(), ...b.keys()])) if (a.get(id) !== b.get(id)) ids.add(id);
  return { ids, suiteWide };
}

// The narrowed matrix: the legs of `matrix.include` that `files` select, in matrix order.
export function prLegs(matrix, files, { e2eDir, templatesBefore, templatesAfter, baseText, headText } = {}) {
  const legs = matrix.include ?? [];
  const byo = byoSuite(e2eDir);
  const selected = new Set();
  let current = new Set();
  const pick = (predicate) =>
    legs.forEach((leg, i) => {
      if (!predicate(leg)) return;
      selected.add(i);
      current.add(i);
    });
  const variantArgs = (leg) => (byo.variants.find((v) => v.id === leg.variant)?.args ?? "").split(/\s+/);
  const variantCase = (leg) => byo.variants.find((v) => v.id === leg.variant)?.case;
  const pickByoFolder = (folder) => pick((leg) => leg.dir === BYO_DIR && variantArgs(leg).includes(folder));
  const pickByoScripts = (scripts) =>
    pick((leg) => leg.dir === BYO_DIR && [...(byo.scriptsByCase.get(variantCase(leg)) ?? [])].some((s) => scripts.includes(s)));
  // Rule 0: the variants whose declared inputs name the file.
  const inputMatchers = byo.variants
    .filter((v) => Array.isArray(v.inputs))
    .map((v) => ({ id: v.id, patterns: v.inputs.map(globToRegExp) }));
  // Rule 7 for the bring-your-own run.sh and suite.json: read the old and new content, when the caller can.
  const byoPrefix = `tests/e2e/${BYO_DIR}/`;
  const texts = (file) => {
    if (!baseText || !headText) return undefined;
    const head = headText(file);
    const base = baseText(file);
    return head == null || base == null ? undefined : { base, head };
  };
  const explain = [];

  for (const file of files.map((f) => f.trim()).filter(Boolean)) {
    current = new Set();
    let rule = "11 none";
    const done = (name) => {
      rule = name;
    };
    let m;
    const claimed = inputMatchers.filter((v) => v.patterns.some((re) => re.test(file))).map((v) => v.id);
    if (claimed.length > 0) {
      done("0 inputs"); // rule 0
      pick((leg) => leg.dir === BYO_DIR && claimed.includes(leg.variant));
    } else if (/^cli\/src\/.*(\.test\.ts$|\/__tests__\/)/.test(file)) {
      done("1 unit test"); // rule 1
    } else if ((m = file.match(/^cli\/src\/frontend-frameworks\/([a-z0-9-]+)\.ts$/)) && !SHARED_MODULES.has(m[1])) {
      done("2 frontend framework");
      const name = m[1];
      pick((leg) => leg.dir === FRONTEND_DIR && leg.framework === name);
    } else if ((m = file.match(/^cli\/src\/backend-languages\/([a-z0-9-]+)\.ts$/)) && !SHARED_MODULES.has(m[1])) {
      done("3 backend language");
      const language = m[1];
      pick((leg) => leg.group === LANGUAGE_GROUP && leg.language === language);
    } else if (/^cli\/src\/frontend-frameworks\/(registry|types)\.ts$/.test(file)) {
      done("2 frontend registry");
      pick((leg) => leg.dir === FRONTEND_DIR || CANARY.includes(leg.label));
    } else if (/^cli\/src\/backend-languages\/(registry|types)\.ts$/.test(file)) {
      done("3 language registry");
      pick((leg) => leg.group === LANGUAGE_GROUP || CANARY.includes(leg.label));
    } else if (file.startsWith("cli/src/agent-runtimes/")) {
      done("4 agent runtime");
      pick((leg) => leg.dir === AGENT_DIR);
    } else if (file === "examples/byo/templates.json") {
      done("5 templates.json");
      if (templatesBefore !== undefined && templatesAfter !== undefined) {
        for (const folder of changedTemplateFolders(templatesBefore, templatesAfter)) pickByoFolder(folder);
      } else {
        pick((leg) => leg.dir === BYO_DIR);
      }
    } else if ((m = file.match(/^examples\/byo(?:-jobs)?\/([^/]+)\//))) {
      done("5 byo template");
      pickByoFolder(m[1]);
    } else if (file === `${byoPrefix}run.sh` && texts(file)) {
      done("7 run.sh by case");
      const { base, head } = texts(file);
      const change = changedByoCases(base, head);
      pick((leg) => leg.dir === BYO_DIR && (change.suiteWide || change.cases.has(variantCase(leg))));
    } else if (file === `${byoPrefix}suite.json` && texts(file)) {
      done("7 suite.json by variant");
      const { base, head } = texts(file);
      const change = changedByoVariants(base, head);
      pick((leg) => leg.dir === BYO_DIR && (change.suiteWide || change.ids.has(leg.variant)));
    } else if ((m = file.match(/^tests\/e2e\/resource-types\/bring-your-own\/(verify-[a-z0-9-]+\.sh)$/))) {
      done("6 verify script");
      pickByoScripts([m[1]]);
    } else if ((m = file.match(/^(tests\/e2e\/fixtures\/[^/]+)\//))) {
      done("6 fixture");
      const fixture = m[1];
      const readers = [...new Set([...byo.scriptsByCase.values()].flatMap((s) => [...s]))].filter((script) => {
        const p = path.join(byo.dir, script);
        return existsSync(p) && readFileSync(p, "utf8").includes(fixture);
      });
      pickByoScripts(readers);
    } else if ((m = file.match(/^tests\/e2e\/((resource-types|orm)\/[^/]+)\//))) {
      done("7 suite folder");
      const dir = m[1];
      pick((leg) => leg.dir === dir);
    } else if (ENGINE_AREAS.find(([re]) => re.test(file))) {
      done("8 engine area");
      const area = ENGINE_AREAS.find(([re]) => re.test(file));
      const inArea = area[1](file.match(area[0]));
      pick((leg) => inArea(leg, byo));
    } else if (FULL_PATHS.test(file)) {
      done("9 matrix files");
      pick(() => true);
    } else if (SHARED_PATHS.test(file)) {
      done("10 shared code, canary");
      pick((leg) => CANARY.includes(leg.label));
    }
    explain.push({ file, rule, labels: [...current].sort((a, b) => a - b).map((i) => legs[i].label) });
  }
  return { include: legs.filter((_, i) => selected.has(i)), explain };
}

// The markdown table --explain appends: what each changed file selected, and why.
export function explainMarkdown(explain, total) {
  const rows = explain.map((e) => {
    const names = e.labels.length === 0 ? "none" : e.labels.length > 6 ? `${e.labels.length} legs` : e.labels.join(", ");
    return `| \`${e.file}\` | ${e.rule} | ${names} |`;
  });
  const picked = new Set(explain.flatMap((e) => e.labels)).size;
  return ["### E2E legs for this change", "", `${picked} of ${total} legs selected.`, "", "| File | Rule | Legs |", "| --- | --- | --- |", ...rows, ""].join("\n");
}

function main(argv) {
  const [matrixJson, ...rest] = argv;
  if (!matrixJson) {
    console.error("usage: git diff --name-only BASE HEAD | node tests/e2e/lib/pr-legs.mjs '<matrix json>' [--templates-before <file>] [--base <rev>] [--explain <file>] [--e2e-dir <dir>]");
    return 2;
  }
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const here = path.dirname(fileURLToPath(import.meta.url));
  const e2eDir = path.resolve(opt("--e2e-dir") ?? path.join(here, ".."));
  const repoRoot = path.resolve(e2eDir, "../..");
  const readJson = (file) => (file && existsSync(file) && readFileSync(file, "utf8").trim() ? JSON.parse(readFileSync(file, "utf8")) : {});
  const beforeFile = opt("--templates-before");
  const options = { e2eDir };
  const baseRev = opt("--base");
  if (baseRev !== undefined) {
    // null: the file does not exist at that revision (a new file), so a rule cannot diff it and treats the change as suite-wide.
    options.baseText = (file) => {
      try {
        return execFileSync("git", ["show", `${baseRev}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], cwd: repoRoot });
      } catch {
        return null;
      }
    };
    options.headText = (file) => (existsSync(path.join(repoRoot, file)) ? readFileSync(path.join(repoRoot, file), "utf8") : null);
  }
  if (beforeFile !== undefined) {
    options.templatesBefore = readJson(beforeFile);
    options.templatesAfter = readJson(path.join(repoRoot, "examples/byo/templates.json"));
  }
  const files = readFileSync(0, "utf8").split("\n");
  const matrix = JSON.parse(matrixJson);
  const result = prLegs(matrix, files, options);
  console.log(JSON.stringify({ include: result.include }));
  const explainFile = opt("--explain");
  if (explainFile) appendFileSync(explainFile, explainMarkdown(result.explain, (matrix.include ?? []).length));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
