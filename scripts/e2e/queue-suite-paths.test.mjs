// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./queue-suite-paths.sh", import.meta.url));

const git = (cwd, ...args) =>
  spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });

// A repository with one commit (the queue base) and a suite.json that declares its paths; `change` edits files and commits.
const queueEntry = (paths, change, env = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "queue-paths-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  mkdirSync(path.join(dir, "cli/src"), { recursive: true });
  mkdirSync(path.join(dir, "docs"), { recursive: true });
  writeFileSync(path.join(dir, "cli/src/a.ts"), "a\n");
  writeFileSync(path.join(dir, "docs/x.md"), "x\n");
  writeFileSync(path.join(dir, "suite.json"), JSON.stringify(paths === undefined ? {} : { paths }));
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "base");
  const base = git(dir, "rev-parse", "HEAD").stdout.trim();
  change(dir);
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "queued");
  const out = path.join(dir, "github-output");
  writeFileSync(out, "");
  const run = spawnSync("bash", [script, "suite.json"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: out, BASE_SHA: base, ...env },
  });
  return { run, relevant: readFileSync(out, "utf8").trim() };
};

const edit = (file) => (dir) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), "changed\n");
};

test("a queue entry that changes only docs is not relevant to a suite that reads cli/**", () => {
  const { run, relevant } = queueEntry(["cli/**"], edit("docs/x.md"));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(relevant, "relevant=false");
});

test("a changed file matching a `**` glob across directories is relevant", () => {
  const { relevant } = queueEntry(["cli/**"], edit("cli/src/deep/nested/b.ts"));
  assert.equal(relevant, "relevant=true");
});

test("an exact path is relevant only when that file changes", () => {
  assert.equal(queueEntry(["cli/src/utils/which.ts"], edit("cli/src/utils/which.ts")).relevant, "relevant=true");
  assert.equal(queueEntry(["cli/src/utils/which.ts"], edit("cli/src/utils/other.ts")).relevant, "relevant=false");
});

test("a suite that declares no paths always runs", () => {
  assert.equal(queueEntry(undefined, edit("docs/x.md")).relevant, "relevant=true");
});

test("an unreadable base commit fails closed: the gate runs", () => {
  const { run, relevant } = queueEntry(["cli/**"], edit("docs/x.md"), {
    BASE_SHA: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(relevant, "relevant=true");
});

test("a missing base commit fails closed: the gate runs", () => {
  const { relevant } = queueEntry(["cli/**"], edit("docs/x.md"), { BASE_SHA: "" });
  assert.equal(relevant, "relevant=true");
});

test("two suites: relevant when either one matches", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "queue-paths-two-"));
  git(dir, "init", "-q", ".");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  writeFileSync(path.join(dir, "one.json"), JSON.stringify({ paths: ["cli/**"] }));
  writeFileSync(path.join(dir, "two.json"), JSON.stringify({ paths: ["runtime/**"] }));
  writeFileSync(path.join(dir, "seed"), "s\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "base");
  const base = git(dir, "rev-parse", "HEAD").stdout.trim();
  mkdirSync(path.join(dir, "runtime"), { recursive: true });
  writeFileSync(path.join(dir, "runtime/x.star"), "x\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "queued");
  const out = path.join(dir, "out");
  writeFileSync(out, "");
  spawnSync("bash", [script, "one.json", "two.json"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: out, BASE_SHA: base },
  });
  assert.equal(readFileSync(out, "utf8").trim(), "relevant=true");
});
