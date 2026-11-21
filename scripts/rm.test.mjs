// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rmPath = fileURLToPath(new URL("./rm.mjs", import.meta.url));

function runRm(cwd, ...args) {
  return spawnSync(process.execPath, [rmPath, ...args], { cwd, encoding: "utf8" });
}

test("rm helper removes files and directories recursively", () => {
  const root = mkdtempSync(join(tmpdir(), "flisk-rm-test-"));
  try {
    const nested = join(root, "dist", "nested");
    const file = join(root, "bundle.js");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "chunk.js"), "chunk");
    writeFileSync(file, "bundle");

    const result = runRm(root, "dist", "bundle.js");

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(existsSync(join(root, "dist")), false);
    assert.equal(existsSync(file), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rm helper ignores paths that do not exist", () => {
  const root = mkdtempSync(join(tmpdir(), "flisk-rm-missing-test-"));
  try {
    const result = runRm(root, "never-created");

    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(existsSync(join(root, "never-created")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rm helper refuses to run without a path", () => {
  const result = runRm(tmpdir());

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: node scripts\/rm\.mjs/);
});
