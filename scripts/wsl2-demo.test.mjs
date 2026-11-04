// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/wsl2-demo.sh (#2367).

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
const scriptPath = join(__dirname, "wsl2-demo.sh");

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

function runWsl2Demo({
  args = null,
  failDemoExit = false,
  missingStackUpMessage = false,
  skipCreateProjectDir = false,
  failStatusCmd = false,
  unreadyResource = false,
  emptyServices = false,
  failHttp = false,
  failDown = false,
  leftoverContainer = "",
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "flisk-wsl2-demo-test-"));
  try {
    const mockBin = join(root, "mock-bin");
    const homeDir = join(root, "home");
    const evidenceDir = join(root, "evidence");
    const stateDir = join(root, "state");
    const logFile = join(root, "events.log");
    mkdirSync(mockBin, { recursive: true });
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(stateDir, { recursive: true });

    const realNode = posixPath(process.execPath);

    // Stub node so inline `node -e` checks run under the current Node binary.
    const mockNodePath = join(mockBin, "node");
    writeFileSync(
      mockNodePath,
      `#!/usr/bin/env bash
exec "${realNode}" "$@"
`,
    );
    chmodSync(mockNodePath, 0o755);

    // Stub docker: record `docker ps` calls and optionally emit a leftover container on the second call.
    const mockDockerPath = join(mockBin, "docker");
    writeFileSync(
      mockDockerPath,
      `#!/usr/bin/env bash
echo "docker $*" >> "$LOG_FILE"
count_file="$STATE_DIR/docker_ps_count"
count=0
if [ -f "$count_file" ]; then
  count="$(cat "$count_file")"
fi
count=$((count + 1))
echo "$count" > "$count_file"
echo "existing-container"
if [ "$count" -ge 2 ] && [ -n "$MOCK_LEFTOVER_CONTAINER" ]; then
  echo "$MOCK_LEFTOVER_CONTAINER"
fi
`,
    );
    chmodSync(mockDockerPath, 0o755);

    // Stub flisk: handle demo, status --json, networks --json, and down.
    const mockFliskPath = join(mockBin, "flisk");
    writeFileSync(
      mockFliskPath,
      `#!/usr/bin/env bash
echo "flisk $* (cwd=$(basename "$PWD"))" >> "$LOG_FILE"
case "$1" in
  demo)
    if [ "$MOCK_FAIL_DEMO_EXIT" = "1" ]; then
      echo "simulated demo failure"
      exit 1
    fi
    if [ "$MOCK_SKIP_PROJECT_DIR" != "1" ]; then
      mkdir -p "$HOME/.flisk/flisk-demo"
    fi
    if [ "$MOCK_MISSING_STACK_UP" = "1" ]; then
      echo "Demo finished without expected banner"
    else
      echo "The stack is up"
    fi
    exit 0
    ;;
  status)
    if [ "$MOCK_FAIL_STATUS_CMD" = "1" ]; then
      echo "status command error" >&2
      exit 1
    fi
    if [ "$MOCK_UNREADY_RESOURCE" = "1" ]; then
      cat << 'JSON'
{"data":{"resources":[{"name":"web-frontend","status":"ready","url":"http://web.localhost:8080"},{"name":"api-backend","status":"error","statusReason":"crash loop"}]}}
JSON
    else
      cat << 'JSON'
{"data":{"resources":[{"name":"web-frontend","status":"ready","url":"http://web.localhost:8080"},{"name":"api-backend","status":"ready","url":"https://api.localhost"}]}}
JSON
    fi
    exit 0
    ;;
  networks)
    if [ "$MOCK_EMPTY_SERVICES" = "1" ]; then
      echo '{"data":{"services":[]}}'
    else
      cat << 'JSON'
{"data":{"services":[{"name":"web-frontend","url":"http://web.localhost:8080"},{"name":"api-backend","url":"https://api.localhost"}]}}
JSON
    fi
    exit 0
    ;;
  down)
    if [ "$MOCK_FAIL_DOWN" = "1" ]; then
      echo "simulated down failure" >&2
      exit 1
    fi
    echo "Stack stopped"
    exit 0
    ;;
  *)
    echo "unexpected flisk command: $*" >&2
    exit 1
    ;;
esac
`,
    );
    chmodSync(mockFliskPath, 0o755);

    // Stub curl: record `--resolve <mapping> <url>` and simulate HTTP codes per endpoint.
    const mockCurlPath = join(mockBin, "curl");
    writeFileSync(
      mockCurlPath,
      `#!/usr/bin/env bash
resolve_val=""
target_url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --resolve)
      resolve_val="$2"
      shift 2
      ;;
    -s|-o|-w|--max-time)
      if [ "$1" = "-s" ]; then
        shift
      else
        shift 2
      fi
      ;;
    *)
      target_url="$1"
      shift
      ;;
  esac
done
echo "curl --resolve $resolve_val $target_url" >> "$LOG_FILE"
if [ "$MOCK_FAIL_HTTP" = "1" ]; then
  printf '503'
  exit 0
fi
if [ "$target_url" = "https://api.localhost" ]; then
  printf '404'
  exit 0
fi
printf '200'
`,
    );
    chmodSync(mockCurlPath, 0o755);

    const scriptArgs = args !== null ? args : [posixPath(evidenceDir)];
    const delimiter = path.delimiter;
    const envPath = [
      mockBin,
      ...(process.env.PATH || "")
        .split(delimiter)
        .filter(
          (d) =>
            !existsSync(join(d, "flisk")) &&
            !existsSync(join(d, "flisk.cmd")) &&
            !existsSync(join(d, "flisk.exe")),
        ),
    ].join(delimiter);

    const result = spawnSync(bashExecutable, [posixPath(scriptPath), ...scriptArgs], {
      cwd: root,
      env: {
        ...process.env,
        PATH: envPath,
        HOME: posixPath(homeDir),
        LOG_FILE: posixPath(logFile),
        STATE_DIR: posixPath(stateDir),
        MOCK_FAIL_DEMO_EXIT: failDemoExit ? "1" : "0",
        MOCK_MISSING_STACK_UP: missingStackUpMessage ? "1" : "0",
        MOCK_SKIP_PROJECT_DIR: skipCreateProjectDir ? "1" : "0",
        MOCK_FAIL_STATUS_CMD: failStatusCmd ? "1" : "0",
        MOCK_UNREADY_RESOURCE: unreadyResource ? "1" : "0",
        MOCK_EMPTY_SERVICES: emptyServices ? "1" : "0",
        MOCK_FAIL_HTTP: failHttp ? "1" : "0",
        MOCK_FAIL_DOWN: failDown ? "1" : "0",
        MOCK_LEFTOVER_CONTAINER: leftoverContainer,
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

test("fails with exit code 2 when more than one argument is provided", () => {
  const result = runWsl2Demo({ args: ["dir-one", "dir-two"] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: bash scripts\/wsl2-demo\.sh \[EVIDENCE_DIRECTORY\]/);
  assert.equal(result.events.length, 0);
});

test("runs all WSL2 demo verification steps in order and exits 0 on success", () => {
  const result = runWsl2Demo();

  assert.equal(result.status, 0, result.stderr);

  const expectedOutputs = [
    "Running the one-command demo (it clones the starter, installs the dependencies and builds the images)",
    "The stack is up",
    "web-frontend: ready http://web.localhost:8080",
    "api-backend: ready https://api.localhost",
    "web-frontend: http://web.localhost:8080 -> / (HTTP 200)",
    "api-backend: https://api.localhost -> /health (HTTP 200)",
    "Stopping the stack the demo started",
    "WSL2 demo passed: the demo started the stack, every service answered and flisk down stopped it",
  ];
  let lastIndex = -1;
  for (const line of expectedOutputs) {
    const idx = result.stdout.indexOf(line);
    assert.notEqual(idx, -1, `Expected stdout to contain "${line}", got:\n${result.stdout}`);
    assert.ok(idx > lastIndex, `Expected "${line}" to appear after previous step in stdout`);
    lastIndex = idx;
  }

  assert.equal(result.events.length, 9);
  assert.equal(result.events[0], "docker ps --format {{.Names}}");
  assert.match(result.events[1], /^flisk demo \(cwd=.*\)$/);
  assert.equal(result.events[2], "flisk status --json (cwd=flisk-demo)");
  assert.equal(result.events[3], "flisk networks --json (cwd=flisk-demo)");
  assert.equal(
    result.events[4],
    "curl --resolve web.localhost:8080:127.0.0.1 http://web.localhost:8080",
  );
  assert.equal(
    result.events[5],
    "curl --resolve api.localhost:443:127.0.0.1 https://api.localhost",
  );
  assert.equal(
    result.events[6],
    "curl --resolve api.localhost:443:127.0.0.1 https://api.localhost/health",
  );
  assert.equal(result.events[7], "flisk down (cwd=flisk-demo)");
  assert.equal(result.events[8], "docker ps --format {{.Names}}");
});

test("stops immediately when flisk demo exits non-zero", () => {
  const result = runWsl2Demo({ failDemoExit: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /WSL2 demo: the demo exited with 1/);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0], "docker ps --format {{.Names}}");
  assert.match(result.events[1], /^flisk demo /);
});

test("stops immediately when flisk demo output does not report the stack is up", () => {
  const result = runWsl2Demo({ missingStackUpMessage: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /WSL2 demo: the demo did not report that the stack came up/);
  assert.equal(result.events.length, 2);
});

test("stops after flisk status when a resource is not ready", () => {
  const result = runWsl2Demo({ unreadyResource: true });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /1 resource\(s\) are not ready: api-backend \(error: crash loop\)/);
  assert.match(result.stderr, /WSL2 demo: the demo left the stack in a state that is not ready/);
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0], "docker ps --format {{.Names}}");
  assert.match(result.events[1], /^flisk demo /);
  assert.equal(result.events[2], "flisk status --json (cwd=flisk-demo)");
});

test("stops before flisk down when a routed service fails all HTTP probes", () => {
  const result = runWsl2Demo({ failHttp: true });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /WSL2 demo: web-frontend did not answer at http:\/\/web\.localhost:8080/,
  );
  assert.deepEqual(result.events.slice(2), [
    "flisk status --json (cwd=flisk-demo)",
    "flisk networks --json (cwd=flisk-demo)",
    "curl --resolve web.localhost:8080:127.0.0.1 http://web.localhost:8080",
    "curl --resolve web.localhost:8080:127.0.0.1 http://web.localhost:8080/health",
    "curl --resolve web.localhost:8080:127.0.0.1 http://web.localhost:8080/ready",
  ]);
});

test("fails when containers started by the demo are still running after flisk down", () => {
  const result = runWsl2Demo({ leftoverContainer: "flisk-demo-leftover" });

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /WSL2 demo: the demo left containers running after flisk down: flisk-demo-leftover/,
  );
  assert.equal(result.events.length, 9);
});
