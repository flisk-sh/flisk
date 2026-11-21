// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./select-unit-tests.sh", import.meta.url));

const git = (cwd, ...args) =>
  spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });

const write = (dir, file, text = "x\n") => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), text);
};

// A repository shaped like the real one: a base commit with two source files, a plain test, a test that starts the built CLI,
// and a shared test-support file. `change` edits the working tree and becomes the queue entry (HEAD) over the base (HEAD^1).
const queueEntry = (change, env = { EVENT: "merge_group" }, setup = () => {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "unit-select-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  write(dir, "cli/src/utils/which.ts");
  write(dir, "cli/src/utils/other.ts");
  write(dir, "cli/src/utils/__tests__/which.test.ts", "import '../which.js';\n");
  write(dir, "cli/src/commands/__tests__/restart-help.test.ts", "runFlisk(['restart']);\n");
  write(dir, "cli/src/commands/__tests__/up-bin.test.ts", "spawnSync(process.execPath, ['cli/bin/flisk.js']);\n");
  write(dir, "cli/src/test-support/index.ts");
  write(dir, "docs/x.md");
  setup(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "base");
  change(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "queue entry");
  const out = path.join(dir, "github-output");
  const outDir = path.join(dir, "select");
  writeFileSync(out, "");
  const run = spawnSync("bash", [script, outDir], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: out, ...env },
  });
  const lines = (file) =>
    existsSync(path.join(outDir, file)) ? readFileSync(path.join(outDir, file), "utf8").split("\n").filter(Boolean) : [];
  return { run, mode: readFileSync(out, "utf8").trim(), related: lines("related.txt"), files: lines("files.txt"), dir };
};

test("a change to one source file selects the tests that import it plus every CLI-spawning test", () => {
  const { run, mode, related, files } = queueEntry((d) => {
    write(d, "cli/src/utils/which.ts", "changed\n");
    write(d, "cli/dist/utils/which.js", "changed\n");
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(mode, "mode=selected");
  assert.deepEqual(related, ["src/utils/which.ts"]);
  assert.deepEqual(files, ["src/commands/__tests__/restart-help.test.ts", "src/commands/__tests__/up-bin.test.ts"]);
});

test("a changed test file is selected too", () => {
  const { mode, related } = queueEntry((d) => write(d, "cli/src/utils/__tests__/which.test.ts", "changed\n"));
  assert.equal(mode, "mode=selected");
  assert.deepEqual(related, ["src/utils/__tests__/which.test.ts"]);
});

test("a deleted source file selects nothing for it but still runs the spawning tests", () => {
  const { mode, related, files } = queueEntry((d) => {
    git(d, "rm", "-q", "cli/src/utils/other.ts");
  });
  assert.equal(mode, "mode=selected");
  assert.deepEqual(related, []);
  assert.equal(files.length, 2);
});

for (const [name, file] of [
  ["runtime files", "runtime/engine/x.star"],
  ["examples", "examples/byo/x/Dockerfile"],
  ["package.json", "cli/package.json"],
  ["the vitest config", "cli/vitest.config.ts"],
  ["a lockfile", "bun.lock"],
  ["a non-TypeScript file under cli/src", "cli/src/templates/x.json"],
  ["a project suite", "tests/generated/x.test.ts"],
]) {
  test(`a change to ${name} runs the full suite`, () => {
    const { run, mode, related } = queueEntry((d) => {
      write(d, "cli/src/utils/which.ts", "changed\n");
      write(d, file, "changed\n");
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(mode, "mode=full");
    assert.deepEqual(related, []);
  });
}

test("a change to the shared test-support runs the full suite", () => {
  const { mode } = queueEntry((d) => write(d, "cli/src/test-support/index.ts", "changed\n"));
  assert.equal(mode, "mode=full");
});

test("a pull request selects like a queue entry; manual, scheduled and push runs run the full suite", () => {
  const change = (d) => write(d, "cli/src/utils/which.ts", "changed\n");
  const pr = queueEntry(change, { EVENT: "pull_request" });
  assert.equal(pr.mode, "mode=selected");
  assert.deepEqual(pr.related, ["src/utils/which.ts"]);
  for (const EVENT of ["workflow_dispatch", "schedule", "push", ""]) {
    const { mode } = queueEntry(change, { EVENT });
    assert.equal(mode, "mode=full", `event ${EVENT || "unset"}`);
  }
});

test("a docs or workflow change runs only the test files that name it, and no CLI-spawning test", () => {
  const { run, mode, related, files } = queueEntry(
    (d) => {
      write(d, ".github/workflows/ci.yml", "changed\n");
      write(d, "docs/guides/up.md", "changed\n");
    },
    { EVENT: "pull_request" },
    (d) => {
      write(d, "cli/src/utils/__tests__/workflow.test.ts", "readFileSync('../.github/workflows/ci.yml');\n");
      write(d, "cli/src/utils/__tests__/docs.test.ts", "readdirSync(join(root, 'docs/guides'));\n");
    },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(mode, "mode=selected");
  assert.deepEqual(related, []);
  assert.deepEqual(files, ["src/utils/__tests__/docs.test.ts", "src/utils/__tests__/workflow.test.ts"]);
});

test("a docs change that no test names selects nothing", () => {
  const { mode, related, files } = queueEntry((d) => write(d, "docs/x.md", "changed\n"), { EVENT: "pull_request" });
  assert.equal(mode, "mode=selected");
  assert.deepEqual(related, []);
  assert.deepEqual(files, []);
});

test("a commit with no parent to diff against runs the full suite", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "unit-select-root-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  write(dir, "cli/src/utils/which.ts");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "only");
  const out = path.join(dir, "out");
  writeFileSync(out, "");
  spawnSync("bash", [script, path.join(dir, "select")], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: out, EVENT: "merge_group" },
  });
  assert.equal(readFileSync(out, "utf8").trim(), "mode=full");
});
