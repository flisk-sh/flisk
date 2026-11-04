// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("cold-boot-notes.sh", import.meta.url));

function resolveBash() {
  if (process.platform === "win32") {
    const gitBash = "C:\\Program Files\\Git\\bin\\bash.exe";
    if (existsSync(gitBash)) {
      return gitBash;
    }
  }
  return "bash";
}

function toPosixPath(p) {
  return p.replace(/^[a-zA-Z]:/, (m) => `/${m[0].toLowerCase()}`).replace(/\\/g, "/");
}

function runScript(args, { binDir, customPath, env = {}, cwd } = {}) {
  const bash = resolveBash();
  const posixBin = binDir ? toPosixPath(binDir) : "";
  const posixScript = toPosixPath(scriptPath);
  const posixArgs = args.map((a) => toPosixPath(a));

  let cmd;
  let spawnArgs;
  if (customPath !== undefined) {
    cmd = 'PATH="$1" bash "$2" "${@:3}"';
    spawnArgs = ["-c", cmd, "_", customPath, posixScript, ...posixArgs];
  } else if (posixBin) {
    cmd = 'PATH="$1:$PATH" bash "$2" "${@:3}"';
    spawnArgs = ["-c", cmd, "_", posixBin, posixScript, ...posixArgs];
  } else {
    cmd = 'bash "$1" "${@:2}"';
    spawnArgs = ["-c", cmd, "_", posixScript, ...posixArgs];
  }

  try {
    const stdout = execFileSync(bash, spawnArgs, {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status,
      stdout: error.stdout ? error.stdout.toString() : "",
      stderr: error.stderr ? error.stderr.toString() : "",
      error,
    };
  }
}

test("cold-boot-notes validation", async (t) => {
  await t.test("fails with exit 2 when .flisk/project.json is missing", () => {
    const workDir = mkdtempSync(join(tmpdir(), "flisk-test-empty-"));
    try {
      const res = runScript([workDir]);
      assert.equal(res.status, 2);
      assert.match(res.stderr, /Run this script from a Flisk project containing \.flisk\/project\.json\./);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  await t.test("fails with exit 2 when flisk is not on PATH", () => {
    const workDir = mkdtempSync(join(tmpdir(), "flisk-test-noflisk-"));
    try {
      mkdirSync(join(workDir, ".flisk"), { recursive: true });
      writeFileSync(join(workDir, ".flisk", "project.json"), "{}");
      const res = runScript([workDir], { customPath: "/usr/bin:/bin" });
      assert.equal(res.status, 2);
      assert.match(res.stderr, /flisk must be available on PATH\./);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});

test("cold-boot-notes execution with stubs", async (t) => {
  await t.test("succeeds with stubs and generates markdown report with expected sections", () => {
    const workDir = mkdtempSync(join(tmpdir(), "flisk-test-success-"));
    const projectDir = join(workDir, "project");
    const binDir = join(workDir, "bin");

    try {
      mkdirSync(join(projectDir, ".flisk"), { recursive: true });
      writeFileSync(join(projectDir, ".flisk", "project.json"), "{}");
      mkdirSync(binDir, { recursive: true });

      const fliskStub = `#!/usr/bin/env bash
case "$1" in
  --version)
    echo "flisk 1.0.0-mock"
    ;;
  doctor)
    exit 0
    ;;
  up)
    echo "Flisk is up."
    ;;
  down)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
`;
      writeFileSync(join(binDir, "flisk"), fliskStub, { mode: 0o755 });

      const dockerStub = `#!/usr/bin/env bash
if [[ "$*" == *"compose"* ]]; then
  echo "2.20.0-mock"
else
  echo "24.0.0-mock"
fi
`;
      writeFileSync(join(binDir, "docker"), dockerStub, { mode: 0o755 });
      writeFileSync(join(binDir, "tilt"), '#!/usr/bin/env bash\necho "v0.33.0-mock"\n', { mode: 0o755 });
      writeFileSync(join(binDir, "bun"), '#!/usr/bin/env bash\necho "1.1.0-mock"\n', { mode: 0o755 });
      writeFileSync(join(binDir, "git"), '#!/usr/bin/env bash\necho "mockcommit123"\n', { mode: 0o755 });

      const res = runScript([projectDir, "shop"], { binDir });
      assert.equal(res.status, 0);

      const resultsDir = join(projectDir, "cold-boot-results");
      assert.ok(existsSync(resultsDir), "cold-boot-results directory must exist");

      const files = readdirSync(resultsDir).filter((f) => f.startsWith("shop-cold-boot-") && f.endsWith(".md"));
      assert.equal(files.length, 1, "exactly one report file should be created");

      const content = readFileSync(join(resultsDir, files[0]), "utf8");
      assert.match(content, /^# Shop cold-boot run/m);
      assert.match(content, /^- Project:/m);
      assert.match(content, /^- Stack: `shop`/m);
      assert.match(content, /^- OS \/ architecture:/m);
      assert.match(content, /^- Flisk:/m);
      assert.match(content, /^## Result/m);
      assert.match(content, /^- Outcome: ready/m);
      assert.match(content, /^- Tilt startup:/m);
      assert.match(content, /^- All doctor\/service checks ready:/m);
      assert.match(content, /^- Docker Engine: `24\.0\.0-mock`/m);
      assert.match(content, /^- Docker Compose: `2\.20\.0-mock`/m);
      assert.match(content, /^- Tilt: `v0\.33\.0-mock`/m);
      assert.match(content, /^- Bun: `1\.1\.0-mock`/m);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  await t.test("records failure when initial flisk doctor fails", () => {
    const workDir = mkdtempSync(join(tmpdir(), "flisk-test-fail-"));
    const projectDir = join(workDir, "project");
    const binDir = join(workDir, "bin");

    try {
      mkdirSync(join(projectDir, ".flisk"), { recursive: true });
      writeFileSync(join(projectDir, ".flisk", "project.json"), "{}");
      mkdirSync(binDir, { recursive: true });

      const fliskStub = `#!/usr/bin/env bash
case "$1" in
  --version)
    echo "flisk 1.0.0-mock"
    ;;
  doctor)
    echo "mock doctor failure" >&2
    exit 1
    ;;
  *)
    exit 0
    ;;
esac
`;
      writeFileSync(join(binDir, "flisk"), fliskStub, { mode: 0o755 });

      const res = runScript([projectDir, "shop"], { binDir });
      assert.equal(res.status, 1);

      const resultsDir = join(projectDir, "cold-boot-results");
      assert.ok(existsSync(resultsDir), "cold-boot-results directory must exist");

      const files = readdirSync(resultsDir).filter((f) => f.startsWith("shop-cold-boot-") && f.endsWith(".md"));
      assert.equal(files.length, 1);

      const content = readFileSync(join(resultsDir, files[0]), "utf8");
      assert.match(content, /- Outcome: blocked by initial `flisk doctor`/);
      assert.match(content, /mock doctor failure/);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
