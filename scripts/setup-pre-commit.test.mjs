// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/setup-pre-commit.sh (#2331).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, "setup-pre-commit.sh");

function findBash() {
  if (process.platform === "win32") {
    const isBash = (p) => {
      if (!p || !existsSync(p)) return false;
      const base = path.basename(p).toLowerCase();
      return base === "bash" || base === "bash.exe";
    };
    const candidates = [
      process.env.SHELL,
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Git", "bin", "bash.exe"),
      process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Git", "bin", "bash.exe"),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (isBash(candidate)) return candidate;
    }
  } else {
    for (const candidate of [process.env.SHELL, "/bin/bash", "/usr/bin/bash"]) {
      if (candidate && existsSync(candidate)) return candidate;
    }
  }
  return "bash";
}

const bashExecutable = findBash();

function posixPath(p) {
  return p.replaceAll("\\", "/");
}

function runSetup({
  preCommitPresent = true,
  preCommitExitCode = 0,
  pipFails = false,
  pipInstallsPreCommit = true,
  pytestFails = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "flisk-setup-pre-commit-test-"));
  try {
    const mockBin = join(root, "mock-bin");
    const logFile = join(root, "events.log");
    mkdirSync(mockBin, { recursive: true });

    if (preCommitPresent) {
      const mockPreCommitPath = join(mockBin, "pre-commit");
      writeFileSync(
        mockPreCommitPath,
        `#!/usr/bin/env bash\nif [ -n "$LOG_FILE" ]; then\n  echo "pre-commit $*" >> "$LOG_FILE"\nfi\nexit ${preCommitExitCode}\n`,
      );
      chmodSync(mockPreCommitPath, 0o755);
    }

    const mockPipPath = join(mockBin, "pip");
    const pipScript = `#!/usr/bin/env bash
if [ -n "$LOG_FILE" ]; then
  echo "pip $*" >> "$LOG_FILE"
fi
if [ "$MOCK_PIP_FAILS" = "1" ]; then
  echo "mock pip failure" >&2
  exit 1
fi
if [ "$MOCK_PIP_INSTALLS_PRE_COMMIT" = "1" ]; then
  cat << 'EOF' > "$MOCK_BIN/pre-commit"
#!/usr/bin/env bash
if [ -n "$LOG_FILE" ]; then
  echo "pre-commit $*" >> "$LOG_FILE"
fi
exit 0
EOF
  chmod +x "$MOCK_BIN/pre-commit"
fi
exit 0
`;
    writeFileSync(mockPipPath, pipScript);
    chmodSync(mockPipPath, 0o755);

    const mockPython3Path = join(mockBin, "python3");
    writeFileSync(
      mockPython3Path,
      `#!/usr/bin/env bash\nif [ -n "$LOG_FILE" ]; then\n  echo "python3 $*" >> "$LOG_FILE"\nfi\nif [ "$MOCK_PYTEST_FAILS" = "1" ]; then\n  exit 1\nfi\nexit 0\n`,
    );
    chmodSync(mockPython3Path, 0o755);

    const delimiter = path.delimiter;
    const envPath = [
      mockBin,
      ...(process.env.PATH || "")
        .split(delimiter)
        .filter((d) => {
          if (!preCommitPresent) {
            return (
              !existsSync(join(d, "pre-commit")) &&
              !existsSync(join(d, "pre-commit.cmd")) &&
              !existsSync(join(d, "pre-commit.exe"))
            );
          }
          return true;
        }),
    ].join(delimiter);

    const result = spawnSync(bashExecutable, [posixPath(scriptPath)], {
      cwd: root,
      env: {
        ...process.env,
        PATH: envPath,
        LOG_FILE: posixPath(logFile),
        MOCK_BIN: posixPath(mockBin),
        MOCK_PIP_FAILS: pipFails ? "1" : "0",
        MOCK_PIP_INSTALLS_PRE_COMMIT: pipInstallsPreCommit ? "1" : "0",
        MOCK_PYTEST_FAILS: pytestFails ? "1" : "0",
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
      events,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("runs pre-commit install when binary is present on PATH", () => {
  const result = runSetup({ preCommitPresent: true });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.events.includes("pre-commit install"));
  assert.equal(result.events.some((event) => event.startsWith("pip")), false);
  assert.match(result.stdout, /Setting up Flisk CLI development environment\.\.\./);
  assert.match(result.stdout, /Installing pre-commit hooks\.\.\./);
  assert.match(result.stdout, /Fast tests passed!/);
  assert.match(result.stdout, /Setup complete! Pre-commit hooks are now installed\./);
  assert.doesNotMatch(result.stdout, /Installing pre-commit\.\.\./);
});

test("asserts clear message and invokes pip when pre-commit binary is missing", () => {
  const result = runSetup({ preCommitPresent: false, pipInstallsPreCommit: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installing pre-commit\.\.\./);
  assert.match(result.stdout, /Installing pre-commit hooks\.\.\./);
  assert.match(result.stdout, /Setup complete! Pre-commit hooks are now installed\./);

  const pipCall = result.events.find((event) => event.startsWith("pip install"));
  assert.ok(pipCall, "pip install must be invoked when pre-commit is missing");
  assert.match(pipCall, /--require-hashes/);
  assert.match(pipCall, /-r .*requirements-pre-commit\.txt/);

  assert.ok(result.events.includes("pre-commit install"));
});

test("halts with non-zero exit code when pip installation fails", () => {
  const result = runSetup({ preCommitPresent: false, pipFails: true });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Installing pre-commit\.\.\./);
  assert.doesNotMatch(result.stdout, /Installing pre-commit hooks\.\.\./);
  assert.doesNotMatch(result.stdout, /Setup complete!/);
  assert.equal(result.events.some((event) => event.startsWith("pre-commit")), false);
});

test("reports fast tests passed when pytest succeeds", () => {
  const result = runSetup({ preCommitPresent: true, pytestFails: false });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Fast tests passed!/);
  assert.doesNotMatch(result.stdout, /Some tests may need dependencies/);
  assert.ok(result.events.includes("python3 -m pytest -m fast --no-cov -q"));
});

test("reports dependency notice and exits 0 when fast tests fail", () => {
  const result = runSetup({ preCommitPresent: true, pytestFails: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Some tests may need dependencies, but pre-commit is installed\./);
  assert.doesNotMatch(result.stdout, /Fast tests passed!/);
  assert.match(result.stdout, /Setup complete! Pre-commit hooks are now installed\./);
  assert.ok(result.events.includes("python3 -m pytest -m fast --no-cov -q"));
});

test("fails with non-zero exit code when pre-commit install fails", () => {
  const result = runSetup({ preCommitPresent: true, preCommitExitCode: 1 });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /Installing pre-commit hooks\.\.\./);
  assert.doesNotMatch(result.stdout, /Setup complete!/);
});
