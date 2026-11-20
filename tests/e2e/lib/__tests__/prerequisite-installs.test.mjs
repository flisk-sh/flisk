// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/lib/prerequisite-installs.mjs.
//   node --test tests/e2e/lib/__tests__/prerequisite-installs.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { posixOnlyPrerequisiteInstalls } from "../prerequisite-installs.mjs";

const table = (bunInstall, tiltInstall) =>
  [
    "| Tool | Version | Install | Needed for |",
    "|------|---------|---------|------------|",
    `| **Tilt** | 0.25+ | ${tiltInstall} | Docker + Tilt path only |`,
    `| **Bun** | 1.2+ | ${bunInstall} | Bun install path |`,
  ].join("\r\n");

const curlBun = "`curl -fsSL https://bun.sh/install \\| bash`";
const curlTilt =
  "`curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh \\| bash`";

test("a POSIX-only table row is reported, including with CRLF line endings", () => {
  assert.deepEqual(posixOnlyPrerequisiteInstalls(table(curlBun, curlTilt)), [
    "Tilt: POSIX-only curl | bash install with no Windows alternative",
    "Bun: POSIX-only curl | bash install with no Windows alternative",
  ]);
});

test("a PowerShell Bun installer satisfies the Windows path", () => {
  const bun = `${curlBun}. Windows PowerShell: \`powershell -c "irm bun.sh/install.ps1 \\| iex"\``;
  assert.deepEqual(posixOnlyPrerequisiteInstalls(table(bun, "see WSL2 Ubuntu above")), []);
});

test("an explicit WSL2 Linux instruction satisfies the Docker + Tilt path", () => {
  const tilt = `WSL2 Ubuntu: ${curlTilt}; use the Linux line there`;
  assert.deepEqual(posixOnlyPrerequisiteInstalls(table("npm", tilt)), []);
});

test("unrelated curl | bash commands and prose are ignored", () => {
  const text = [
    "| Claude Code | - | `curl -fsSL https://claude.ai/install.sh \\| bash` | Optional |",
    '| `flisk up` fails with "Tilt not found" | Missing | `curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh \\| bash` | Restart shell |',
    "Run `curl -fsSL https://bun.sh/install | bash` in Ubuntu.",
  ].join("\n");
  assert.deepEqual(posixOnlyPrerequisiteInstalls(text), []);
});
