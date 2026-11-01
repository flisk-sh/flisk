// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Narrows a resource-types/orm matrix (suite-matrix.mjs) to the legs a pull request's changed files touch, so a change to one
// framework runs only that framework's legs. Used by the plan job of .github/workflows/e2e-resource-types.yml on pull requests;
// merge_group, nightly, release and manual runs keep the full matrix.
//
//   git diff --name-only "$BASE_SHA" HEAD | node tests/e2e/lib/pr-legs.mjs '<matrix json>' [--templates-before <file>]
//
// Each changed file selects legs by the first rule that applies:
//   1. a unit test in cli/src (*.test.ts, __tests__/) selects nothing: it does not change the CLI a leg runs;
//   2. cli/src/frontend-frameworks/<name>.ts selects frontend-<name>; its registry.ts or types.ts every frontend leg and the canary;
//   3. cli/src/backend-languages/<lang>.ts selects the <lang> language legs; its registry.ts or types.ts every language and the canary;
//   4. cli/src/agent-runtimes/** selects the agent leg;
//   5. examples/byo/<folder>/** or examples/byo-jobs/<folder>/** selects the bring-your-own legs whose variant args name
//      <folder>; an entry of examples/byo/templates.json counts as its folder (pass the base version with --templates-before);
//   6. a verify script of the bring-your-own suite, or a tests/e2e/fixtures/<dir>/ that one reads, selects the variants whose
//      case runs that script;
//   7. a file inside one suite's folder (tests/e2e/<group>/<suite>/) selects that suite's legs;
//   8. an engine file that belongs to one area selects that area's legs (ENGINE_AREAS): a vite framework file its frontend leg,
//      the vite and frontend generators every frontend leg, byo_*.star the bring-your-own legs, the prisma layer prisma and
//      migrator; engine docs and Starlark unit tests select nothing;
//   9. the files that decide the matrix (FULL_PATHS: this workflow, pr-legs.mjs, suite-matrix.mjs) select every leg;
//  10. any other file that matches SHARED_PATHS (shared CLI code, the rest of the engine, tests/e2e/lib, common.sh) selects the
//      CANARY legs, one per kind of suite; the merge queue and nightly still run every leg;
//  11. anything else (docs, unrelated code) selects nothing.
import { existsSync, readFileSync } from "node:fs";
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
  [/^runtime\/engine\/topologies\/platform\/docker\/compose\/byo_[a-z_]+\.star$/, () => (leg) => leg.dir === "resource-types/bring-your-own"],
  [
    /^runtime\/engine\/topologies\/(platform\/docker\/layers\/prisma\/|tilt\/generators\/typescript\/prisma_config\.star$)/,
    () => (leg) => ["orm/prisma", "resource-types/migrator"].includes(leg.dir),
  ],
  [/^runtime\/engine\/(topologies\/tilt\/resources\/orchestrator\/apply_migrator_orchestration\.star|assets\/scripts\/cleanup-completed-migrator-images\.sh)$/, () => (leg) => leg.dir === "resource-types/migrator"],
];

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
  return { dir, variants, scriptsByCase };
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

// The narrowed matrix: the legs of `matrix.include` that `files` select, in matrix order.
export function prLegs(matrix, files, { e2eDir, templatesBefore, templatesAfter } = {}) {
  const legs = matrix.include ?? [];
  const byo = byoSuite(e2eDir);
  const selected = new Set();
  const pick = (predicate) => legs.forEach((leg, i) => predicate(leg) && selected.add(i));
  const variantArgs = (leg) => (byo.variants.find((v) => v.id === leg.variant)?.args ?? "").split(/\s+/);
  const variantCase = (leg) => byo.variants.find((v) => v.id === leg.variant)?.case;
  const pickByoFolder = (folder) => pick((leg) => leg.dir === BYO_DIR && variantArgs(leg).includes(folder));
  const pickByoScripts = (scripts) =>
    pick((leg) => leg.dir === BYO_DIR && [...(byo.scriptsByCase.get(variantCase(leg)) ?? [])].some((s) => scripts.includes(s)));

  for (const file of files.map((f) => f.trim()).filter(Boolean)) {
    let m;
    if (/^cli\/src\/.*(\.test\.ts$|\/__tests__\/)/.test(file)) continue; // rule 1
    if ((m = file.match(/^cli\/src\/frontend-frameworks\/([a-z0-9-]+)\.ts$/)) && !SHARED_MODULES.has(m[1])) {
      const name = m[1];
      pick((leg) => leg.dir === FRONTEND_DIR && leg.framework === name); // rule 2
      continue;
    }
    if ((m = file.match(/^cli\/src\/backend-languages\/([a-z0-9-]+)\.ts$/)) && !SHARED_MODULES.has(m[1])) {
      const language = m[1];
      pick((leg) => leg.group === LANGUAGE_GROUP && leg.language === language); // rule 3
      continue;
    }
    if (/^cli\/src\/frontend-frameworks\/(registry|types)\.ts$/.test(file)) {
      pick((leg) => leg.dir === FRONTEND_DIR || CANARY.includes(leg.label)); // rule 2: every framework, plus the canary
      continue;
    }
    if (/^cli\/src\/backend-languages\/(registry|types)\.ts$/.test(file)) {
      pick((leg) => leg.group === LANGUAGE_GROUP || CANARY.includes(leg.label)); // rule 3: every language, plus the canary
      continue;
    }
    if (file.startsWith("cli/src/agent-runtimes/")) {
      pick((leg) => leg.dir === AGENT_DIR); // rule 4
      continue;
    }
    if (file === "examples/byo/templates.json") {
      if (templatesBefore !== undefined && templatesAfter !== undefined) {
        for (const folder of changedTemplateFolders(templatesBefore, templatesAfter)) pickByoFolder(folder); // rule 5
      } else {
        pick((leg) => leg.dir === BYO_DIR);
      }
      continue;
    }
    if ((m = file.match(/^examples\/byo(?:-jobs)?\/([^/]+)\//))) {
      pickByoFolder(m[1]); // rule 5
      continue;
    }
    if ((m = file.match(/^tests\/e2e\/resource-types\/bring-your-own\/(verify-[a-z0-9-]+\.sh)$/))) {
      pickByoScripts([m[1]]); // rule 6
      continue;
    }
    if ((m = file.match(/^(tests\/e2e\/fixtures\/[^/]+)\//))) {
      const fixture = m[1];
      const readers = [...new Set([...byo.scriptsByCase.values()].flatMap((s) => [...s]))].filter((script) => {
        const p = path.join(byo.dir, script);
        return existsSync(p) && readFileSync(p, "utf8").includes(fixture);
      });
      pickByoScripts(readers); // rule 6
      continue;
    }
    if ((m = file.match(/^tests\/e2e\/((resource-types|orm)\/[^/]+)\//))) {
      const dir = m[1];
      pick((leg) => leg.dir === dir); // rule 7
      continue;
    }
    const area = ENGINE_AREAS.find(([re]) => re.test(file));
    if (area) {
      pick(area[1](file.match(area[0]))); // rule 8
      continue;
    }
    if (FULL_PATHS.test(file)) {
      pick(() => true); // rule 9
      continue;
    }
    if (SHARED_PATHS.test(file)) pick((leg) => CANARY.includes(leg.label)); // rule 10
    // rule 11: nothing
  }
  return { include: legs.filter((_, i) => selected.has(i)) };
}

function main(argv) {
  const [matrixJson, ...rest] = argv;
  if (!matrixJson) {
    console.error("usage: git diff --name-only BASE HEAD | node tests/e2e/lib/pr-legs.mjs '<matrix json>' [--templates-before <file>] [--e2e-dir <dir>]");
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
  if (beforeFile !== undefined) {
    options.templatesBefore = readJson(beforeFile);
    options.templatesAfter = readJson(path.join(repoRoot, "examples/byo/templates.json"));
  }
  const files = readFileSync(0, "utf8").split("\n");
  console.log(JSON.stringify(prLegs(JSON.parse(matrixJson), files, options)));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
