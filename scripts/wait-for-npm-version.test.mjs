// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("wait-for-npm-version.sh", import.meta.url));

// Runs the script with a fake `npm` first on PATH. The fake counts its calls
// and prints the requested version from call number `visibleOnCall` onwards
// (0 means never).
function run({ visibleOnCall, timeoutSeconds }) {
  const root = mkdtempSync(join(tmpdir(), "flisk-wait-npm-test-"));
  try {
    const calls = join(root, "calls");
    writeFileSync(calls, "0");
    const npm = join(root, "npm");
    writeFileSync(
      npm,
      [
        "#!/usr/bin/env bash",
        `n=$(( $(cat "${calls}") + 1 ))`,
        `echo "$n" > "${calls}"`,
        `if [ ${visibleOnCall} -gt 0 ] && [ "$n" -ge ${visibleOnCall} ]; then echo 1.2.3; else exit 1; fi`,
        "",
      ].join("\n"),
    );
    chmodSync(npm, 0o755);
    const proc = spawnSync("bash", [script, "@flisk-sh/flisk", "1.2.3", String(timeoutSeconds)], {
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, NPM_POLL_SECONDS: "1" },
      encoding: "utf8",
    });
    return { ...proc, calls: Number(readFileSync(calls, "utf8")) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("exits 0 once the version shows up on the second lookup", () => {
  const result = run({ visibleOnCall: 2, timeoutSeconds: 30 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls, 2);
  assert.match(
    result.stdout,
    /Waiting for @flisk-sh\/flisk@1\.2\.3 .*attempt 1; observed 'not found'/,
  );
  assert.match(
    result.stdout,
    /@flisk-sh\/flisk@1\.2\.3 is visible on https:\/\/registry\.npmjs\.org\./,
  );
});

test("exits 1 after the timeout when the version never shows up", () => {
  const result = run({ visibleOnCall: 0, timeoutSeconds: 2 });
  assert.equal(result.status, 1);
  assert.ok(result.calls >= 1);
  assert.match(
    result.stdout,
    /::error::@flisk-sh\/flisk@1\.2\.3 did not become visible .* within 2s\./,
  );
});
