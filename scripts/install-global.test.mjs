// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("install-global.mjs", import.meta.url));

// Runs the script with a fake `npm` first on PATH. The fake writes each
// argument it receives on its own line, then exits with `npmExit`.
function run(args, { npmExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "flisk-install-global-test-"));
  try {
    const argsFile = join(root, "npm-args");
    const npm = join(root, "npm");
    writeFileSync(
      npm,
      [
        "#!/usr/bin/env bash",
        `printf '%s\\n' "$@" > '${argsFile.replaceAll("'", "'\\''")}'`,
        `exit ${npmExit}`,
        "",
      ].join("\n"),
    );
    chmodSync(npm, 0o755);
    const proc = spawnSync(process.execPath, [script, ...args], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
      encoding: "utf8",
      timeout: 30_000,
    });
    const npmArgs = existsSync(argsFile)
      ? readFileSync(argsFile, "utf8").split("\n").slice(0, -1)
      : null;
    return { ...proc, npmArgs };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("passes every spec to npm install --global unchanged", () => {
  const result = run(["./flisk-sh-flisk-1.2.3.tgz", "@flisk-sh/flisk@1.2.3"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.npmArgs, [
    "install",
    "--global",
    "./flisk-sh-flisk-1.2.3.tgz",
    "@flisk-sh/flisk@1.2.3",
  ]);
});

test("exits with npm's status when the install fails", () => {
  const result = run(["@flisk-sh/flisk@9.9.9"], { npmExit: 3 });
  assert.equal(result.status, 3);
  assert.deepEqual(result.npmArgs, ["install", "--global", "@flisk-sh/flisk@9.9.9"]);
});

test("prints usage and exits 1 without calling npm when no spec is given", () => {
  const result = run([]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: install-global\.mjs <spec>\.\.\./);
  assert.equal(result.npmArgs, null);
});
