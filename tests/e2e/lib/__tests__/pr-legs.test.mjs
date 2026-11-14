// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/lib/pr-legs.mjs against the repository's real suites. Run by `make test-shell`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BYO_FILE_VARIANTS, CANARY, changedByoCases, changedByoVariants, changedTemplateFolders, explainMarkdown, globToRegExp, prLegs, runShBlocks } from "../pr-legs.mjs";
import { selectSuites } from "../suite-matrix.mjs";

const e2eDir = fileURLToPath(new URL("../..", import.meta.url));
const registry = JSON.parse(execFileSync(process.execPath, [path.join(e2eDir, "lib/registry-axes.mjs")], { encoding: "utf8" }));
const frontends = registry.frontendFramework;
// The pull request matrix the workflow builds before narrowing: the PR languages and every frontend framework.
const matrix = {
  include: ["resource-types", "orm"].flatMap((g) => selectSuites(e2eDir, g, "pr", ["bun", "python", "rust", "go", "node"], [], frontends)),
};
const all = matrix.include.map((leg) => leg.label);
const labels = (files, options = {}) => prLegs(matrix, files, { e2eDir, ...options }).include.map((leg) => leg.label);
const byoLabels = all.filter((l) => l.startsWith("bring-your-own-"));
const frontendLabels = frontends.map((f) => `frontend-${f}`);
const languageLabels = ["bun", "python", "rust", "go", "node"];
const canary = all.filter((l) => CANARY.includes(l));
const sorted = (xs) => [...xs].sort();
// One bring-your-own leg per case of its suite.json: the first variant listed for each case.
const byoVariants = JSON.parse(readFileSync(path.join(e2eDir, "resource-types/bring-your-own/suite.json"), "utf8")).variants;
const byoPerCase = byoLabels.filter((l) => byoVariants.find((v) => `bring-your-own-${v.id}` === l && byoVariants.find((w) => w.case === v.case) === v));

test("every byo_*.star file is in the map, and every mapped variant is a real leg", () => {
  const dir = path.join(e2eDir, "../../runtime/engine/topologies/platform/docker/compose");
  const files = readdirSync(dir).filter((f) => /^byo_[a-z_]+\.star$/.test(f)).map((f) => f.slice(4, -5));
  assert.deepEqual(sorted(files), sorted(Object.keys(BYO_FILE_VARIANTS)));
  for (const v of Object.values(BYO_FILE_VARIANTS).flat()) assert.ok(byoLabels.includes(`bring-your-own-${v}`), v);
});

// The map's claims: each listed variant's verify script sets the key its file handles.
test("each mapped variant's verify script sets the manifest key", () => {
  const read = (s) => readFileSync(path.join(e2eDir, "resource-types/bring-your-own", s), "utf8");
  assert.match(read("verify-byo-hpc.sh"), /m\.container=/);
  assert.match(read("verify-byo-job.sh"), /--restart no/);
  assert.match(read("verify-byo-ports.sh"), /extraPorts/);
  assert.match(read("verify-byo-infra.sh"), /m\.extraPorts=/);
  assert.match(read("verify-byo-job.sh"), /"postgres"/);
  assert.match(read("verify-byo-flisk.sh"), /DATABASE_URL/);
});

test("an engine change runs one bring-your-own leg per case, not every template", () => {
  const cases = new Set(byoVariants.map((v) => v.case));
  assert.equal(byoPerCase.length, cases.size);
  assert.ok(byoPerCase.length < byoLabels.length);
  assert.ok(byoPerCase.includes("bring-your-own-example") && !byoPerCase.includes("bring-your-own-template-vue"));
});

test("the PR matrix has a leg per frontend and per BYO variant", () => {
  assert.ok(all.includes("frontend-lit") && all.includes("frontend-vue"));
  assert.ok(byoLabels.length > 5);
});

test("lit only runs frontend-lit only", () => {
  assert.deepEqual(labels(["cli/src/frontend-frameworks/lit.ts"]), ["frontend-lit"]);
});

test("vue only runs frontend-vue only", () => {
  assert.deepEqual(labels(["cli/src/frontend-frameworks/vue.ts"]), ["frontend-vue"]);
});

test("two frameworks run both legs", () => {
  assert.deepEqual(labels(["cli/src/frontend-frameworks/vue.ts", "cli/src/frontend-frameworks/lit.ts"]).sort(), ["frontend-lit", "frontend-vue"]);
});

test("the frontend registry runs every frontend leg and the canary, not every leg", () => {
  const want = sorted(new Set([...frontendLabels, ...canary]));
  assert.deepEqual(sorted(labels(["cli/src/frontend-frameworks/registry.ts"])), want);
  assert.deepEqual(sorted(labels(["cli/src/frontend-frameworks/types.ts"])), want);
  assert.ok(want.length < all.length);
});

test("a framework's unit test runs no legs", () => {
  assert.deepEqual(labels(["cli/src/frontend-frameworks/__tests__/lit.test.ts"]), []);
});

test("a BYO template entry runs its leg only", () => {
  const before = JSON.parse(readFileSync(path.join(e2eDir, "../../examples/byo/templates.json"), "utf8"));
  const after = structuredClone(before);
  after.templates.find((t) => t.folder === "create-vue").tag = "v9.9.9";
  assert.deepEqual(changedTemplateFolders(before, after), ["create-vue"]);
  assert.deepEqual(labels(["examples/byo/templates.json"], { templatesBefore: before, templatesAfter: after }), ["bring-your-own-template-vue"]);
});

test("a BYO example folder runs the legs that use it", () => {
  assert.deepEqual(labels(["examples/byo/lobster/Dockerfile"]), ["bring-your-own-example-lobster"]);
  assert.deepEqual(labels(["examples/byo/turso-app/server.js"]), ["bring-your-own-pair"]);
  assert.deepEqual(labels(["examples/byo-jobs/dbmate/run.sh"]), ["bring-your-own-job"]);
  assert.deepEqual(labels(["examples/byo/django/app.py"]), []);
});

test("a BYO verify script or fixture runs the variants of its case", () => {
  assert.deepEqual(labels(["tests/e2e/resource-types/bring-your-own/verify-byo-flisk.sh"]), ["bring-your-own-flisk"]);
  assert.deepEqual(labels(["tests/e2e/fixtures/byo-python-health/app.py"]).sort(), ["bring-your-own-python-boot", "bring-your-own-python-dry-run"]);
  const example = labels(["tests/e2e/resource-types/bring-your-own/verify-byo-example.sh"]);
  assert.ok(example.includes("bring-your-own-example") && example.includes("bring-your-own-template-vue"));
  assert.ok(!example.includes("bring-your-own-flisk"));
});

test("every BYO verify script maps to at least one leg", () => {
  const scripts = readdirSync(path.join(e2eDir, "resource-types/bring-your-own")).filter((f) => /^verify-.*\.sh$/.test(f));
  for (const s of scripts) assert.ok(labels([`tests/e2e/resource-types/bring-your-own/${s}`]).length > 0, s);
});

test("a BYO suite's run.sh runs every BYO leg", () => {
  assert.deepEqual(labels(["tests/e2e/resource-types/bring-your-own/run.sh"]), byoLabels);
});

test("a backend language file runs that language's leg only", () => {
  assert.deepEqual(labels(["cli/src/backend-languages/rust.ts"]), ["rust"]);
  assert.deepEqual(sorted(labels(["cli/src/backend-languages/registry.ts"])), sorted(new Set([...languageLabels, ...canary])));
});

test("an agent runtime runs the agent leg only", () => {
  assert.deepEqual(labels(["cli/src/agent-runtimes/custom.ts"]), ["agent"]);
});

test("a doc-only change runs no legs", () => {
  assert.deepEqual(labels(["docs/guide.md", "README.md"]), []);
});

test("the canary is one real leg per kind of suite", () => {
  assert.deepEqual(sorted(canary), sorted(CANARY)); // every name is a leg of the PR matrix
  for (const dir of ["resource-types/backend", "resource-types/frontend", "resource-types/bring-your-own", "resource-types/agent", "resource-types/migrator", "orm/prisma"]) {
    assert.ok(matrix.include.some((leg) => leg.dir === dir && CANARY.includes(leg.label)), dir);
  }
});

test("shared code runs the canary, not every leg", () => {
  assert.deepEqual(labels(["cli/src/commands/up.ts"]), []); // not read by any of these suites
  for (const file of ["cli/src/mcp/tools.ts", "cli/src/commands/resource.ts", "tests/e2e/lib/lib.sh", "tests/e2e/resource-types/common.sh", "runtime/engine/topologies/platform/docker/compose/compose.star", "runtime/engine/schemas/service-schema.json"]) {
    assert.deepEqual(labels([file]), canary, file);
  }
});

test("the files that build the matrix still run every leg", () => {
  for (const file of [".github/workflows/e2e-resource-types.yml", "tests/e2e/lib/pr-legs.mjs", "tests/e2e/lib/suite-matrix.mjs"]) {
    assert.deepEqual(labels([file]), all, file);
  }
});

test("an engine file that belongs to one area runs only that area", () => {
  const engine = "runtime/engine/topologies";
  assert.deepEqual(labels([`${engine}/tilt/generators/vite/frameworks/react.star`]), ["frontend-react"]);
  assert.deepEqual(labels([`${engine}/tilt/generators/vite/frameworks/lit.star`]), ["frontend-lit"]);
  for (const file of [`${engine}/tilt/generators/vite/frontend.star`, `${engine}/tilt/generators/typescript/frontend_tsconfig.star`, `${engine}/platform/docker/build/frontend_build_plan.star`, `${engine}/tilt/resources/orchestrator/generators/frontend.star`]) {
    assert.deepEqual(labels([file]), frontendLabels, file);
  }
  const byo = (name) => sorted(labels([`${engine}/platform/docker/compose/byo_${name}.star`]));
  assert.deepEqual(byo("container"), ["bring-your-own-example", "bring-your-own-hpc", "bring-your-own-job"]);
  assert.deepEqual(byo("ports"), ["bring-your-own-example", "bring-your-own-infra", "bring-your-own-ports"]);
  assert.deepEqual(byo("shared_database"), ["bring-your-own-example", "bring-your-own-flisk", "bring-your-own-job"]);
  assert.deepEqual(byo("volumes"), ["bring-your-own-example"]);
  assert.deepEqual(byo("not_yet_mapped"), sorted(byoPerCase)); // a new file not in the map: one leg per case
  assert.deepEqual(sorted(labels([`${engine}/platform/docker/layers/prisma/migrate_script.star`])), ["migrator", "prisma"]);
  assert.deepEqual(labels([`${engine}/tilt/resources/orchestrator/apply_migrator_orchestration.star`]), ["migrator"]);
  assert.deepEqual(labels(["runtime/engine/AGENTS.md", "runtime/engine/docs/README.md", `${engine}/tilt/manifest/tests/test_validator.star`]), []);
});

test("every engine area pattern matches a real file", () => {
  const files = execFileSync("git", ["ls-files", "runtime/engine"], { cwd: path.join(e2eDir, "../.."), encoding: "utf8" }).split("\n");
  const named = ["vite/frameworks/react.star", "vite/frontend.star", "byo_container.star", "layers/prisma/", "apply_migrator_orchestration.star"];
  for (const n of named) assert.ok(files.some((f) => f.includes(n)), n);
});

test("lit plus a shared file runs lit and the canary", () => {
  assert.deepEqual(sorted(labels(["cli/src/frontend-frameworks/lit.ts", "runtime/engine/x.star"])), sorted(new Set(["frontend-lit", ...canary])));
});

// The changed files of real pull requests that ran all 32 legs before this rule set (checked 2026-11-01).
test("real PRs that ran every leg now run a fraction", () => {
  const prs = {
    3035: ["runtime/engine/schemas/service-schema.json", "runtime/engine/topologies/platform/docker/compose/byo_container.star", "cli/src/commands/resource.ts"],
    3032: ["runtime/engine/topologies/platform/docker/compose/byo_shared_database.star", "runtime/engine/topologies/platform/docker/compose/compose.star", "runtime/engine/topologies/tilt/resources/orchestrator/generators/env.star"],
    3034: ["cli/src/commands/resource.ts", "tests/e2e/resource-types/bring-your-own/verify-byo-job.sh"],
    3033: ["cli/src/commands/resource.ts"],
  };
  for (const [pr, files] of Object.entries(prs)) {
    const got = labels(files);
    assert.ok(got.length <= canary.length + byoLabels.length, `#${pr} ran ${got.length}`);
    assert.ok(!got.includes("frontend-lit") && !got.includes("frontend-vue") && !got.includes("frontend-next"), `#${pr}: ${got}`);
  }
  assert.ok(labels(prs[3032]).length <= 8, `#3032 ran ${labels(prs[3032]).length}`);
  assert.ok(labels(prs[3035]).length <= 8, `#3035 ran ${labels(prs[3035]).length}`);
});

// The workflow must diff a PR against its checked-out merge commit's first parent, not the event's frozen base.sha (#2960 ran 32 legs for a
// doctor-only change because main's own engine commits showed up in the diff).
test("a PR is diffed against its merge commit's parent, so main moving on does not select legs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pr-legs-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  const commit = (file, msg) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), msg);
    git("add", "-A");
    git("commit", "-qm", msg);
  };
  try {
    git("init", "-q", "-b", "main");
    commit("README.md", "base");
    const staleBase = git("rev-parse", "HEAD").trim(); // base.sha frozen in the event payload
    git("checkout", "-q", "-b", "pr");
    commit("cli/src/utils/doctor-wiring.ts", "doctor change"); // the PR: touches no suite
    git("checkout", "-q", "main");
    commit("runtime/engine/topologies/x.star", "main moves on"); // shared path, not part of the PR
    git("checkout", "-q", "-b", "merge");
    git("merge", "-q", "--no-ff", "-m", "merge ref", "pr");
    const changed = (...range) => git("diff", "--name-only", ...range);
    // Stale base: lists main's engine commit, so legs are selected for a change that touches none (the bug).
    assert.ok(labels(changed(staleBase, "HEAD").split("\n")).length > 0);
    // Merge-commit parent: only the PR's own file, so no leg runs (the fix).
    assert.deepEqual(changed("HEAD^1", "HEAD").trim().split("\n"), ["cli/src/utils/doctor-wiring.ts"]);
    assert.deepEqual(labels(changed("HEAD^1", "HEAD").split("\n")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the plan job uses the merge commit's parent and a depth-2 checkout", () => {
  const wf = readFileSync(path.join(e2eDir, "../../.github/workflows/e2e-resource-types.yml"), "utf8");
  assert.match(wf, /git diff --name-only HEAD\^1 HEAD \|/);
  assert.match(wf, /git show "HEAD\^1:examples\/byo\/templates\.json"/);
  assert.match(wf, /fetch-depth: 2/);
  assert.doesNotMatch(wf, /BASE_SHA/);
});

// The content-aware rules: old and new text of run.sh and suite.json, so only what changed selects legs.
const byoDir = "tests/e2e/resource-types/bring-your-own/";
const runSh = readFileSync(path.join(e2eDir, "resource-types/bring-your-own/run.sh"), "utf8");
const suiteJson = readFileSync(path.join(e2eDir, "resource-types/bring-your-own/suite.json"), "utf8");
const withTexts = (file, base, head) => ({
  baseText: (f) => (f === file ? base : null),
  headText: (f) => (f === file ? head : null),
});
const byoOfCase = (name) => byoVariants.filter((v) => v.case === name).map((v) => `bring-your-own-${v.id}`);

test("a comment, a blank line or a usage line in run.sh selects nothing", () => {
  const head = `# a new comment\n\n${runSh.replace("#!/usr/bin/env bash", "#!/usr/bin/env bash\n# one more comment")}\n\n`;
  assert.deepEqual(labels([`${byoDir}run.sh`], withTexts(`${byoDir}run.sh`, runSh, head)), []);
});

test("a changed case function in run.sh selects the variants of that case only", () => {
  const head = runSh.replace('verify-byo-infra.sh "BY8 ', 'verify-byo-infra.sh "BY8 changed: ');
  assert.notEqual(head, runSh);
  assert.deepEqual(sorted(labels([`${byoDir}run.sh`], withTexts(`${byoDir}run.sh`, runSh, head))), sorted(byoOfCase("BY8")));
});

test("a change to the code outside the case functions of run.sh is suite-wide", () => {
  const head = `${runSh}\necho "a new helper step"\n`;
  assert.deepEqual(sorted(labels([`${byoDir}run.sh`], withTexts(`${byoDir}run.sh`, runSh, head))), sorted(byoLabels));
});

test("a description-only change to suite.json selects nothing; a changed variant selects that leg", () => {
  const doc = JSON.parse(suiteJson);
  const described = JSON.stringify({ ...doc, description: `${doc.description} More.` }, null, 2);
  assert.deepEqual(labels([`${byoDir}suite.json`], withTexts(`${byoDir}suite.json`, suiteJson, described)), []);
  const variants = doc.variants.map((v) => (v.id === "ports" ? { ...v, args: "x" } : v));
  const changed = JSON.stringify({ ...doc, variants }, null, 2);
  assert.deepEqual(labels([`${byoDir}suite.json`], withTexts(`${byoDir}suite.json`, suiteJson, changed)), ["bring-your-own-ports"]);
  const wide = JSON.stringify({ ...doc, timeoutMinutes: 99 }, null, 2);
  assert.deepEqual(sorted(labels([`${byoDir}suite.json`], withTexts(`${byoDir}suite.json`, suiteJson, wide))), sorted(byoLabels));
});

test("without --base, run.sh and suite.json keep selecting the whole suite", () => {
  assert.deepEqual(sorted(labels([`${byoDir}run.sh`])), sorted(byoLabels));
  assert.deepEqual(sorted(labels([`${byoDir}suite.json`])), sorted(byoLabels));
});

test("a new run.sh or suite.json (absent at the base) is suite-wide, never silently nothing", () => {
  const options = { baseText: () => null, headText: () => runSh };
  assert.deepEqual(sorted(labels([`${byoDir}run.sh`], options)), sorted(byoLabels));
});

test("a file in a variant's inputs selects that leg alone, and skips the canary", () => {
  assert.deepEqual(labels(["cli/src/utils/infra-presets.ts"]), ["bring-your-own-infra"]);
  assert.deepEqual(labels(["tests/e2e/fixtures/byo-infra-probe/probe.py"]), ["bring-your-own-infra"]);
  assert.deepEqual(labels(["cli/src/utils/service-manifest.ts"]), []);
});

test("globToRegExp: * stays in a segment, ** crosses them, **/ may match nothing", () => {
  assert.ok(globToRegExp("a/*.ts").test("a/b.ts") && !globToRegExp("a/*.ts").test("a/b/c.ts"));
  assert.ok(globToRegExp("a/**").test("a/b/c.ts") && globToRegExp("a/**/c.ts").test("a/c.ts") && globToRegExp("a/**/c.ts").test("a/b/x/c.ts"));
  assert.ok(!globToRegExp("a.ts").test("axts"));
});

test("runShBlocks and the two change functions ignore comments and blank lines", () => {
  const a = runShBlocks("# c\nBY1() { echo a; }\nBY2() {\n  echo b\n}\nrest\n");
  assert.deepEqual([...a.blocks.keys()], ["BY1", "BY2"]);
  assert.deepEqual(changedByoCases("BY1() { echo a; }\nBY2() {\n  echo b\n}\n", "# n\nBY1() { echo a; }\n\nBY2() {\n  echo c\n}\n"), { cases: new Set(["BY2"]), suiteWide: false });
  assert.deepEqual(changedByoVariants('{"description":"a","variants":[{"id":"x"}]}', '{"description":"b","variants":[{"id":"x"},{"id":"y"}]}'), { ids: new Set(["y"]), suiteWide: false });
});

test("--explain reports each file, its rule and its legs", () => {
  const result = prLegs(matrix, ["docs/README.md", "cli/src/utils/infra-presets.ts", "cli/src/commands/resource.ts"], { e2eDir });
  assert.deepEqual(result.explain.map((e) => [e.file, e.rule]), [["docs/README.md", "11 none"], ["cli/src/utils/infra-presets.ts", "0 inputs"], ["cli/src/commands/resource.ts", "10 shared code, canary"]]);
  const md = explainMarkdown(result.explain, all.length);
  assert.match(md, new RegExp(`of ${all.length} legs selected`));
  assert.match(md, /\| `cli\/src\/utils\/infra-presets\.ts` \| 0 inputs \| bring-your-own-infra \|/);
});

test("the PR #4020 shape: presets, probe, verify script, resource.ts run 7 legs, not 38", () => {
  const files = ["cli/src/utils/infra-presets.ts", "cli/src/commands/resource.ts", "tests/e2e/fixtures/byo-infra-probe/probe.py", "tests/e2e/resource-types/bring-your-own/verify-byo-infra.sh"];
  const got = labels(files);
  assert.ok(got.includes("bring-your-own-infra"));
  assert.ok(got.length <= canary.length + 1, got.join(","));
  assert.ok(got.length < all.length / 4);
});
