// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("check-cli-dist.sh", import.meta.url));

// A tiny repo shaped like this one: the script under scripts/, cli/dist
// gitignored, and one compiled file committed with `git add -f`.
function withRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), "flisk-check-cli-dist-test-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    mkdirSync(join(root, "scripts"));
    copyFileSync(script, join(root, "scripts", "check-cli-dist.sh"));
    mkdirSync(join(root, "cli", "dist"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "cli/dist/\n");
    writeFileSync(join(root, "cli", "dist", "index.js"), "export const a = 1;\n");
    git("add", ".gitignore", "scripts");
    git("add", "-f", "cli/dist/index.js");
    git("commit", "-q", "-m", "init");
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function check(root) {
  return spawnSync("bash", [join(root, "scripts", "check-cli-dist.sh")], { encoding: "utf8" });
}

test("exits 0 when cli/dist matches the commit", () => {
  withRepo((root) => {
    const result = check(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /cli\/dist is up to date\./);
  });
});

test("exits 1 when a committed dist file was rebuilt differently", () => {
  withRepo((root) => {
    writeFileSync(join(root, "cli", "dist", "index.js"), "export const a = 2;\n");
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /cli\/dist\/index\.js/);
    assert.match(result.stderr, /::error::cli\/dist is stale/);
  });
});

test("exits 1 when the build adds a new, still ignored dist file", () => {
  withRepo((root) => {
    writeFileSync(join(root, "cli", "dist", "new.js"), "export const b = 1;\n");
    const result = check(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /!! cli\/dist\/new\.js/);
    assert.match(result.stderr, /git add -f cli\/dist/);
  });
});
