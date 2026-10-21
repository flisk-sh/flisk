// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXCLUDED_WORKFLOWS, GLOBAL_PATHS, normalizePath, workflowPathProblems } from "../validate-suites.mjs";

const e2eDir = fileURLToPath(new URL("../..", import.meta.url));
const repoWorkflows = fileURLToPath(new URL("../../../../.github/workflows", import.meta.url));

// A tests/e2e tree and a .github/workflows folder. suites: { "group/name": { paths, triggers } }. workflows: file -> pull_request.paths,
// where null writes a workflow with no paths filter and undefined leaves the file out.
function fixture(suites, workflows) {
  const root = mkdtempSync(path.join(tmpdir(), "workflow-paths-"));
  const e2e = path.join(root, "tests", "e2e");
  const wf = path.join(root, ".github", "workflows");
  mkdirSync(wf, { recursive: true });
  for (const [where, { paths, triggers = ["pr"] }] of Object.entries(suites)) {
    const dir = path.join(e2e, where);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "suite.json"), JSON.stringify({ paths, triggers }));
  }
  for (const [file, filter] of Object.entries(workflows)) {
    const pullRequest = filter === null ? {} : { paths: filter };
    writeFileSync(path.join(wf, file), JSON.stringify({ on: { pull_request: pullRequest, push: {} } }));
  }
  return { e2e, wf };
}

const WF = ".github/workflows/demo-e2e.yml";
const SELF = `${WF}`;

test("normalizePath drops quotes and a leading ./, and writes dir/** as dir/", () => {
  assert.equal(normalizePath('"./cli/**"'), "cli/");
  assert.equal(normalizePath("cli/"), "cli/");
  assert.equal(normalizePath("cli/**"), "cli/");
  assert.equal(normalizePath("Tiltfile"), "Tiltfile");
});

test("matching suite and filter pass", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/**", "tests/e2e/lib/**", "tests/e2e/resource-types/demo/**", SELF] } },
    { "demo-e2e.yml": ["cli/src/**", "tests/e2e/lib/**", "tests/e2e/resource-types/demo/**", SELF] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("a suite path missing from the filter is reported with the suite and the entry", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/**", "engine/extra.star", SELF] } },
    { "demo-e2e.yml": ["cli/src/**", SELF] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), [
    `resource-types/demo: path "engine/extra.star" is not covered by ${WF} pull_request.paths`,
  ]);
});

test("a filter entry no suite lists is reported as unexpected", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/**", SELF] } },
    { "demo-e2e.yml": ["cli/src/**", "docs/old.md", SELF] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), [
    `${WF}: pull_request.paths entry "docs/old.md" is not listed by any suite that runs in it`,
  ]);
});

test("a global path may sit in the filter without a suite listing it", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/**", SELF] } },
    { "demo-e2e.yml": ["cli/src/**", "docs/shared.md", SELF] },
  );
  GLOBAL_PATHS["docs/shared.md"] = "test-only: read by every suite";
  try {
    assert.deepEqual(workflowPathProblems(e2e, wf), []);
  } finally {
    delete GLOBAL_PATHS["docs/shared.md"];
  }
});

test("formatting-only differences do not fail", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/**", "./tests/e2e/lib/**", SELF] } },
    { "demo-e2e.yml": ['"./cli/**"', "tests/e2e/lib/", `'./${WF}'`] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("a directory entry covers the suite paths inside it", () => {
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/commands/resource.ts", SELF] } },
    { "demo-e2e.yml": ["cli/**", SELF] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("a suite that does not run on pull_request is not matched against the filter", () => {
  const { e2e, wf } = fixture(
    { "scale/demo": { paths: ["engine/**", "scripts/bench.sh", SELF], triggers: ["nightly", "manual"] } },
    { "demo-e2e.yml": ["engine/**", SELF] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("a workflow without a paths filter runs on every pull request and is not checked", () => {
  const { e2e, wf } = fixture({ "examples/demo": { paths: ["engine/**", SELF] } }, { "demo-e2e.yml": null });
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("the resource-type workflow is excluded, because it has no paths filter on purpose", () => {
  assert.ok(EXCLUDED_WORKFLOWS[".github/workflows/e2e-resource-types.yml"], "the exclusion needs a reason");
  const { e2e, wf } = fixture(
    { "resource-types/demo": { paths: ["cli/src/**", ".github/workflows/e2e-resource-types.yml"] } },
    { "e2e-resource-types.yml": ["engine/**"] },
  );
  assert.deepEqual(workflowPathProblems(e2e, wf), []);
});

test("the repository's own suites match their workflow filters", () => {
  assert.deepEqual(workflowPathProblems(e2eDir, repoWorkflows), []);
});
