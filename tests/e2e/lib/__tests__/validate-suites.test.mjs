// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkSuiteJson, validateSuites } from "../validate-suites.mjs";

const lib = fileURLToPath(new URL("../lib.sh", import.meta.url));
const good = {
  group: "resource-types",
  suite: "demo",
  description: "demo suite",
  paths: ["cli/src/demo/**"],
  cases: ["A1", "A2"],
  triggers: ["pr", "nightly"],
  timeoutMinutes: 10,
  needsSecrets: [],
};

// A suite folder whose run.sh sources the real lib.sh and defines <defined> as cases.
function makeSuite(root, { json = good, defined = ["A1", "A2"], executable = true } = {}) {
  const dir = path.join(root, json.group ?? "resource-types", json.suite ?? "demo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "suite.json"), JSON.stringify(json));
  const run = path.join(dir, "run.sh");
  writeFileSync(
    run,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
      `E2E_ROOT="${root}/scratch" source "${lib}"`,
      "e2e_init demo demoproj",
      ...defined.map((id) => `${id}() { echo "ran ${id}"; }`),
      "A2() { echo ran A2; [ \"${FAIL_A2:-}\" != 1 ]; }",
      'e2e_main "$@"',
    ].join("\n"),
  );
  if (executable) chmodSync(run, 0o755);
  return run;
}

test("a well-formed suite passes", () => {
  assert.deepEqual(checkSuiteJson(good, "resource-types", "demo"), []);
  const root = mkdtempSync(path.join(tmpdir(), "suites-"));
  makeSuite(root);
  assert.deepEqual(validateSuites(root), []);
});

test("shape problems are each named", () => {
  const bad = { ...good, group: "journeys", suite: "other", triggers: ["pr", "hourly"], timeoutMinutes: 0, extra: 1, cases: ["A1", "A1", "1x"] };
  const problems = checkSuiteJson(bad, "resource-types", "demo").join("\n");
  for (const expected of [/unknown key "extra"/, /under resource-types\//, /folder is demo\//, /unknown triggers: hourly/, /timeoutMinutes/, /duplicate cases: A1/, /shell function names: 1x/]) {
    assert.match(problems, expected);
  }
});

test("secrets and scale suites never run on pull requests", () => {
  assert.match(checkSuiteJson({ ...good, needsSecrets: ["TDK_LICENSE_KEY"] }, "resource-types", "demo").join(), /needs secrets must not run on pr/);
  assert.match(checkSuiteJson({ ...good, group: "scale" }, "scale", "demo").join(), /scale suites must not run on pr/);
});

test("run.sh must be executable and define every listed case", () => {
  const root = mkdtempSync(path.join(tmpdir(), "suites-"));
  makeSuite(root, { json: { ...good, cases: ["A1", "A2", "A3"] }, executable: false });
  const problems = validateSuites(root).join("\n");
  assert.match(problems, /run.sh is not executable/);
  assert.match(problems, /does not define:.*A3/);
});

test("run.sh dispatch: list, one case, unknown case, all", () => {
  const root = mkdtempSync(path.join(tmpdir(), "suites-"));
  const run = makeSuite(root);
  const sh = (args, env = {}) => spawnSync("bash", [run, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(sh(["list"]).stdout.trim(), "A1 A2");
  const one = sh(["A1"]);
  assert.equal(one.status, 0);
  assert.match(one.stdout, /ran A1\nPASS A1/);
  const unknown = sh(["A9"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown case: A9/);
  const all = sh(["all"]);
  assert.equal(all.status, 0);
  assert.match(all.stdout, /PASS A1[\s\S]*PASS A2/);
  const failing = sh(["all"], { FAIL_A2: "1" });
  assert.equal(failing.status, 1);
  assert.match(failing.stdout, /diagnostics written to/);
  assert.equal(sh([]).status, 2);
});
