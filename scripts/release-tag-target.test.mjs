// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { releaseTagTarget } from "./release-tag-target.mjs";

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), "rtt-"));
  const run = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  run("init", "-q", "-b", "main");
  run("config", "user.name", "t");
  run("config", "user.email", "t@example.com");
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  const commit = (message) => {
    run("add", "-A");
    run("commit", "-q", "-m", message);
    return run("rev-parse", "HEAD");
  };
  const show = (rev, file) => run("show", `${rev}:${file}`);
  return { dir, run, write, commit, show, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const version = (v) => JSON.stringify({ name: "x", version: v });

test("a bump commit that is the published commit plus version files is tagged as it is", () => {
  const r = repo();
  try {
    r.write("package.json", version("1.0.0"));
    r.write("cli/src/a.ts", "a");
    const published = r.commit("published");
    r.write("package.json", version("1.0.1"));
    r.write("docs/CHANGELOG.md", "## 1.0.1\n");
    const bump = r.commit("Release 1.0.1 (automatic version bump)");
    const out = releaseTagTarget({ published, bump, cwd: r.dir });
    assert.deepEqual(out, { target: bump, drift: false, extra: [] });
  } finally {
    r.done();
  }
});

test("a bump commit that also carries later merges is not tagged: the tag gets the published content", () => {
  const r = repo();
  try {
    r.write("package.json", version("1.0.0"));
    r.write("cli/src/a.ts", "published");
    const published = r.commit("published");
    // Main moves on after publish (#3024, #3025, #3028 in 1.4.30).
    r.write("cli/src/a.ts", "merged after publish");
    r.write("cli/src/new.ts", "also after");
    r.commit("later work");
    r.write("package.json", version("1.0.1"));
    const bump = r.commit("Release 1.0.1 (automatic version bump)");

    const out = releaseTagTarget({ published, bump, cwd: r.dir });
    assert.equal(out.drift, true);
    assert.notEqual(out.target, bump);
    assert.deepEqual(out.extra.sort(), ["cli/src/a.ts", "cli/src/new.ts"]);
    assert.equal(r.run("rev-parse", `${out.target}^`), published);
    assert.equal(JSON.parse(r.show(out.target, "package.json")).version, "1.0.1");
    assert.equal(r.show(out.target, "cli/src/a.ts"), "published");
    assert.throws(() => r.show(out.target, "cli/src/new.ts"));
  } finally {
    r.done();
  }
});

test("the tag target is the same on a second run, so a re-run cannot move the tag", () => {
  const r = repo();
  try {
    r.write("package.json", version("1.0.0"));
    const published = r.commit("published");
    r.write("x.txt", "later");
    r.commit("later");
    r.write("package.json", version("1.0.1"));
    const bump = r.commit("bump");
    const first = releaseTagTarget({ published, bump, cwd: r.dir, message: "fixed message" });
    const second = releaseTagTarget({ published, bump, cwd: r.dir, message: "fixed message" });
    assert.equal(second.drift, true);
    assert.equal(r.run("rev-parse", `${first.target}^{tree}`), r.run("rev-parse", `${second.target}^{tree}`));
  } finally {
    r.done();
  }
});

test("a bump file that the published commit lacks is added, and one the bump removed is removed", () => {
  const r = repo();
  try {
    r.write("package.json", version("1.0.0"));
    r.write("bun.lock", "old lock");
    const published = r.commit("published");
    r.write("other.txt", "later");
    r.commit("later");
    r.write("package.json", version("1.0.1"));
    r.write("docs/CHANGELOG.md", "## 1.0.1\n");
    r.run("rm", "-q", "bun.lock");
    const bump = r.commit("bump");
    const out = releaseTagTarget({ published, bump, cwd: r.dir });
    assert.equal(r.show(out.target, "docs/CHANGELOG.md"), "## 1.0.1");
    assert.throws(() => r.show(out.target, "bun.lock"));
  } finally {
    r.done();
  }
});
