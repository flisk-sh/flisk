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
import { changedTemplateFolders, prLegs } from "../pr-legs.mjs";
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

test("the frontend registry runs every frontend and the rest as before", () => {
  const got = labels(["cli/src/frontend-frameworks/registry.ts"]);
  assert.deepEqual(got, all);
  for (const f of frontends) assert.ok(got.includes(`frontend-${f}`));
  assert.deepEqual(labels(["cli/src/frontend-frameworks/types.ts"]), all);
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
  assert.deepEqual(labels(["cli/src/backend-languages/registry.ts"]), all);
});

test("an agent runtime runs the agent leg only", () => {
  assert.deepEqual(labels(["cli/src/agent-runtimes/custom.ts"]), ["agent"]);
});

test("a doc-only change runs no legs", () => {
  assert.deepEqual(labels(["docs/guide.md", "README.md"]), []);
});

test("an unrelated CLI change keeps today's behaviour", () => {
  assert.deepEqual(labels(["cli/src/commands/up.ts"]), []); // not read by any of these suites: no legs, as before
  assert.deepEqual(labels(["cli/src/mcp/tools.ts"]), all); // shared: every leg, as before
  assert.deepEqual(labels(["cli/src/commands/resource.ts"]), all);
});

test("shared e2e code runs everything, a suite's own folder runs only that suite", () => {
  assert.deepEqual(labels(["tests/e2e/lib/lib.sh"]), all);
  assert.deepEqual(labels(["tests/e2e/resource-types/common.sh"]), all);
  assert.deepEqual(labels([".github/workflows/e2e-resource-types.yml"]), all);
  assert.deepEqual(labels(["runtime/engine/topologies/x.star"]), all);
  assert.deepEqual(labels(["tests/e2e/orm/prisma/run.sh"]), ["prisma"]);
  assert.deepEqual(labels(["tests/e2e/resource-types/frontend/run.sh"]), frontends.map((f) => `frontend-${f}`));
});

test("lit plus a shared file runs everything", () => {
  assert.deepEqual(labels(["cli/src/frontend-frameworks/lit.ts", "runtime/engine/x.star"]), all);
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
    // Stale base: lists main's engine commit, so every leg is selected (the bug).
    assert.deepEqual(labels(changed(staleBase, "HEAD").split("\n")), all);
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
