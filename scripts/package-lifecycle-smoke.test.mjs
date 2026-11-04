// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/package-lifecycle-smoke.sh (#2370).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "package-lifecycle-smoke.sh");

function findBash() {
  if (process.platform !== "win32") {
    return "bash";
  }
  const gitBashPaths = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe",
  ];
  for (const candidate of gitBashPaths) {
    if (existsSync(candidate)) return candidate;
  }
  return "bash";
}

const bashExecutable = findBash();

function posixPath(p) {
  return p.replaceAll("\\", "/");
}

function runSmokeTest({
  args = null,
  failInstall = false,
  failUpgrade = false,
  versionMismatch = false,
  packageVersion = "1.4.11",
  previousVersion = "1.4.10",
  customTarball = null,
  customPackageJson = null,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "flisk-lifecycle-test-"));
  try {
    const mockBin = join(root, "mock-bin");
    const stateDir = join(root, "state");
    const logFile = join(root, "events.log");
    mkdirSync(mockBin);
    mkdirSync(stateDir);

    const realNode = posixPath(process.execPath);

    // Stub node: delegate inline -e scripts to the real Node binary;
    // translate install-global.mjs invocations directly into npm install --global.
    const mockNodePath = join(mockBin, "node");
    writeFileSync(
      mockNodePath,
      `#!/usr/bin/env bash
if [ "$1" = "-e" ]; then
  exec "${realNode}" "$@"
fi
if [[ "$1" == *"install-global.mjs"* ]]; then
  shift
  exec npm install --global "$@"
fi
exec "${realNode}" "$@"
`,
    );
    chmodSync(mockNodePath, 0o755);

    // Stub npm: record invocations, return version candidates, and manage the mock flisk CLI binary.
    const mockNpmPath = join(mockBin, "npm");
    writeFileSync(
      mockNpmPath,
      `#!/usr/bin/env bash
if [ -n "$LOG_FILE" ]; then
  echo "npm $*" >> "$LOG_FILE"
fi

if [ "$1" = "view" ]; then
  echo '["${previousVersion}", "${packageVersion}"]'
  exit 0
fi

if [ "$1" = "install" ] && [ "$2" = "--global" ]; then
  spec="$3"
  if [ "$MOCK_FAIL_INSTALL" = "1" ] && [[ "$spec" == *"@"* ]]; then
    echo "simulated install failure for previous version" >&2
    exit 1
  fi
  if [ "$MOCK_FAIL_UPGRADE" = "1" ] && [[ "$spec" != *"@"* ]]; then
    echo "simulated upgrade failure for tarball" >&2
    exit 1
  fi
  mkdir -p "$npm_config_prefix/bin"
  if [[ "$spec" == *"@"* ]]; then
    ver="\${spec##*@}"
  else
    ver="$EXPECTED_VER"
  fi
  echo "$ver" > "$STATE_DIR/installed_version"
  cat << 'EOF' > "$npm_config_prefix/bin/flisk"
#!/usr/bin/env bash
if [ -n "$LOG_FILE" ]; then
  echo "flisk $*" >> "$LOG_FILE"
fi
case "$1" in
  --version)
    if [ "$MOCK_VERSION_MISMATCH" = "1" ]; then
      echo "0.0.0-mismatch"
    else
      cat "$STATE_DIR/installed_version"
    fi
    ;;
  --help)
    echo "Usage: flisk [command] [options]"
    ;;
  *)
    exit 0
    ;;
esac
EOF
  chmod +x "$npm_config_prefix/bin/flisk"
  exit 0
fi

if [ "$1" = "uninstall" ] && [ "$2" = "--global" ]; then
  rm -f "$npm_config_prefix/bin/flisk"
  rm -f "$STATE_DIR/installed_version"
  exit 0
fi

echo "unknown npm invocation: $*" >&2
exit 1
`,
    );
    chmodSync(mockNpmPath, 0o755);

    let tarballPath = customTarball;
    if (tarballPath === null) {
      tarballPath = join(root, `flisk-${packageVersion}.tgz`);
      writeFileSync(tarballPath, "fake tarball archive");
    }

    let pkgJsonPath = customPackageJson;
    if (pkgJsonPath === null) {
      pkgJsonPath = join(root, "package.json");
      writeFileSync(
        pkgJsonPath,
        JSON.stringify({ name: "@flisk-sh/flisk", version: packageVersion }),
      );
    }

    const scriptArgs = args !== null
      ? args
      : [posixPath(tarballPath), posixPath(pkgJsonPath)];

    const delimiter = path.delimiter;
    const envPath = [
      mockBin,
      ...((process.env.PATH || "")
        .split(delimiter)
        .filter(
          (d) =>
            !existsSync(join(d, "flisk")) &&
            !existsSync(join(d, "flisk.cmd")) &&
            !existsSync(join(d, "flisk.exe")),
        )),
    ].join(delimiter);

    const result = spawnSync(bashExecutable, [posixPath(scriptPath), ...scriptArgs], {
      env: {
        ...process.env,
        PATH: envPath,
        LOG_FILE: posixPath(logFile),
        STATE_DIR: posixPath(stateDir),
        EXPECTED_VER: packageVersion,
        MOCK_FAIL_INSTALL: failInstall ? "1" : "0",
        MOCK_FAIL_UPGRADE: failUpgrade ? "1" : "0",
        MOCK_VERSION_MISMATCH: versionMismatch ? "1" : "0",
      },
      encoding: "utf8",
    });

    const events = existsSync(logFile)
      ? readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean)
      : [];

    return {
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      tarballPath,
      pkgJsonPath,
      events,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("fails with exit code 2 when required arguments are missing", () => {
  const noArgs = runSmokeTest({ args: [] });
  assert.equal(noArgs.status, 2);
  assert.match(noArgs.stderr, /usage: bash scripts\/package-lifecycle-smoke\.sh <tarball> <cli\/package\.json>/);

  const oneArg = runSmokeTest({ args: ["only-one-arg.tgz"] });
  assert.equal(oneArg.status, 2);
  assert.match(oneArg.stderr, /usage: bash scripts\/package-lifecycle-smoke\.sh <tarball> <cli\/package\.json>/);
});

test("fails with exit code 1 when the packed tarball is missing", () => {
  const result = runSmokeTest({
    customTarball: join(tmpdir(), "nonexistent-flisk-tarball.tgz"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /packed tarball not found:/);
  assert.equal(result.events.length, 0);
});

test("fails with exit code 1 when package.json does not have a version field", () => {
  const root = mkdtempSync(join(tmpdir(), "flisk-missing-version-"));
  try {
    const emptyPkg = join(root, "package.json");
    writeFileSync(emptyPkg, JSON.stringify({ name: "@flisk-sh/flisk", version: "" }));
    const result = runSmokeTest({ customPackageJson: emptyPkg });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no version in/);
    assert.equal(result.events.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runs lifecycle smoke steps in order and exits 0 on success", () => {
  const result = runSmokeTest({
    packageVersion: "1.4.11",
    previousVersion: "1.4.10",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Packed CLI lifecycle smoke passed/);
  assert.match(result.stdout, /packed version: 1\.4\.11/);
  assert.match(result.stdout, /previous published version: 1\.4\.10/);

  assert.equal(result.events.length, 7);
  assert.equal(result.events[0], "npm view @flisk-sh/flisk versions --json");
  assert.equal(result.events[1], "npm install --global @flisk-sh/flisk@1.4.10");
  assert.equal(result.events[2], "flisk --version");
  assert.match(result.events[3], /^npm install --global .*flisk-1\.4\.11\.tgz$/);
  assert.equal(result.events[4], "flisk --version");
  assert.equal(result.events[5], "flisk --help");
  assert.equal(result.events[6], "npm uninstall --global @flisk-sh/flisk");
});

test("exits non-zero and halts execution when installing previous published version fails", () => {
  const result = runSmokeTest({
    failInstall: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /simulated install failure for previous version/);

  // Assert steps ran up to the failed install and then stopped immediately
  assert.deepEqual(result.events, [
    "npm view @flisk-sh/flisk versions --json",
    "npm install --global @flisk-sh/flisk@1.4.10",
  ]);
});

test("exits non-zero and halts execution when upgrading to tarball fails", () => {
  const result = runSmokeTest({
    failUpgrade: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /simulated upgrade failure for tarball/);

  assert.equal(result.events.length, 4);
  assert.equal(result.events[0], "npm view @flisk-sh/flisk versions --json");
  assert.equal(result.events[1], "npm install --global @flisk-sh/flisk@1.4.10");
  assert.equal(result.events[2], "flisk --version");
  assert.match(result.events[3], /^npm install --global .*flisk-1\.4\.11\.tgz$/);
});

test("exits non-zero when flisk version does not match expected version", () => {
  const result = runSmokeTest({
    versionMismatch: true,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /installed flisk reports '0\.0\.0-mismatch', expected '1\.4\.10'/);
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0], "npm view @flisk-sh/flisk versions --json");
  assert.equal(result.events[1], "npm install --global @flisk-sh/flisk@1.4.10");
  assert.equal(result.events[2], "flisk --version");
});
