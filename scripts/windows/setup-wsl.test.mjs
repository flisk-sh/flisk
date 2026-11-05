// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The Ubuntu half of scripts/windows/setup-wsl.ps1, run with stub commands so nothing is installed. The PowerShell half
// (WSL install, Docker Desktop check, handing the script to Ubuntu) runs only on Windows and is NOT exercised here.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ps1 = readFileSync(path.join(here, "setup-wsl.ps1"), "utf8");

/** The bash between `$UbuntuScript = @'` and the closing `'@`. */
function ubuntuScript() {
  const match = ps1.match(/\$UbuntuScript = @'\r?\n([\s\S]*?)\r?\n'@/);
  assert.ok(match, "setup-wsl.ps1 has no $UbuntuScript here-string");
  return match[1];
}

function stub(bin, name, body) {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(file, 0o755);
}

/** Runs the Ubuntu script in a temp HOME with stubs; returns its exit code, output and the command log. */
function run({ nodeVersion = "v22.12.0", dockerWorks = true, haveTilt = true, args = [], home: reuseHome } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "flisk-setup-wsl-"));
  const bin = path.join(root, "bin");
  const home = reuseHome ?? path.join(root, "home");
  mkdirSync(bin);
  mkdirSync(home, { recursive: true });
  const log = path.join(root, "calls.log");
  const record = `echo "$(basename "$0") $*" >> ${JSON.stringify(log)}`;
  stub(bin, "node", `${record}\nif [ "$1" = --version ]; then echo ${nodeVersion}; fi`);
  if (haveTilt) stub(bin, "tilt", `${record}\necho v0.35.0`);
  stub(bin, "curl", `${record}\necho 'echo installer-ran'`);
  // sudo -E bash - reads the piped installer, as the real one does; without that, curl gets SIGPIPE under pipefail.
  stub(bin, "sudo", `${record}\nif [ "$1" = -E ]; then cat > /dev/null; fi`);
  stub(bin, "docker", `${record}\nexit ${dockerWorks ? 0 : 1}`);
  stub(bin, "npx", `${record}\necho doctor-ok`);
  stub(
    bin,
    "git",
    `${record}\ncase "$1" in clone) mkdir -p "$3/.git";; config) if [ "$#" -eq 3 ]; then echo input; fi;; esac`,
  );
  const script = path.join(root, "setup.sh");
  writeFileSync(script, ubuntuScript());
  const proc = spawnSync("/bin/bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home },
  });
  const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
  return { code: proc.status, out: proc.stdout + proc.stderr, calls, home };
}

test("the Ubuntu script is valid bash", () => {
  const root = mkdtempSync(path.join(tmpdir(), "flisk-setup-wsl-syntax-"));
  const file = path.join(root, "s.sh");
  writeFileSync(file, ubuntuScript());
  const proc = spawnSync("/bin/bash", ["-n", file], { encoding: "utf8" });
  assert.equal(proc.status, 0, proc.stderr);
});

test("with everything installed it installs nothing, clones the fork into ~/ and runs doctor there", () => {
  const r = run({ args: ["https://github.com/someone/flisk-task-starter.git"] });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.calls, /^sudo /m);
  assert.doesNotMatch(r.calls, /^curl /m);
  assert.match(r.calls, /^git config --global core.autocrlf input$/m);
  assert.match(r.calls, /^git clone https:\/\/github.com\/someone\/flisk-task-starter.git .*\/home\/flisk-task-starter$/m);
  assert.ok(existsSync(path.join(r.home, "flisk-task-starter", ".git")));
  assert.match(r.calls, /^npx -y @flisk-sh\/flisk doctor$/m);
  assert.match(r.out, /cd .*\/home\/flisk-task-starter\n {2}npx @flisk-sh\/flisk up/);
});

test("running it again does not clone twice", () => {
  const first = run({ args: ["https://github.com/someone/app"] });
  assert.equal(first.code, 0, first.out);
  const again = run({ args: ["https://github.com/someone/app"], home: first.home });
  assert.equal(again.code, 0, again.out);
  assert.doesNotMatch(again.calls, /^git clone /m);
  assert.match(again.out, /already cloned/);
});

test("an old Node.js is upgraded through NodeSource", () => {
  const r = run({ nodeVersion: "v20.11.0" });
  // The stub keeps reporting v20, so the script must stop and say what to do instead of carrying on.
  assert.equal(r.code, 4, r.out);
  assert.match(r.calls, /^curl -fsSL https:\/\/deb.nodesource.com\/setup_22.x$/m);
  assert.match(r.calls, /^sudo apt-get install -y -qq nodejs$/m);
  assert.match(r.out, /older than 22\.12/);
});

test("Node.js 22.11 is too old, 23.0 is fine", () => {
  assert.equal(run({ nodeVersion: "v22.11.0" }).code, 4);
  assert.equal(run({ nodeVersion: "v23.0.0" }).code, 0);
});

test("a missing Tilt is installed with the official installer", () => {
  const r = run({ haveTilt: false });
  assert.match(r.calls, /^curl -fsSL https:\/\/raw.githubusercontent.com\/tilt-dev\/tilt\/master\/scripts\/install.sh$/m);
});

test("without Docker in Ubuntu it stops with the WSL integration step and exit 3", () => {
  const r = run({ dockerWorks: false, args: ["https://github.com/someone/app"] });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /WSL Integration, turn on Ubuntu/);
  assert.doesNotMatch(r.calls, /^git clone /m);
});

test("the PowerShell half keeps the POSIX script free of Windows line endings and asks before admin work", () => {
  assert.match(ps1, /tr -d '\\r' > \/tmp\/flisk-setup-wsl\.sh/);
  assert.match(ps1, /IsInRole\(\[Security\.Principal\.WindowsBuiltInRole\]::Administrator\)/);
  assert.match(ps1, /-replace "`0", ''/);
  assert.doesNotMatch(ps1, /npm install -g/);
});
