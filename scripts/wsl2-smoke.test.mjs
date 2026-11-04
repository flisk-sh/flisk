// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/wsl2-smoke.sh (#2366).

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
const scriptPath = join(__dirname, "wsl2-smoke.sh");

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

function runWsl2Smoke({
  args = null,
  failDoctor = false,
  doctorNoPort = false,
  failConfigVerify = false,
  upExitBeforeTilt = false,
  upTimeout = false,
  failRoutesReady = false,
  failApiHealth = false,
  failWorkerReady = false,
  failOrdersApp = false,
  failOrderCreate = false,
  failOrderObserve = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "flisk-wsl2-smoke-test-"));
  try {
    const mockBin = join(root, "mock-bin");
    const tmpDir = join(root, "tmp");
    const logFile = join(root, "events.log");
    const envFile = join(root, "env.sh");
    mkdirSync(mockBin, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });

    const realNode = posixPath(process.execPath);

    // Stub node
    const mockNodeScript = `#!/usr/bin/env bash
args=()
for arg in "$@"; do
  if [ -f "$arg" ]; then
    if command -v cygpath >/dev/null 2>&1; then
      args+=("$(cygpath -w "$arg")")
    else
      args+=("$arg")
    fi
  else
    args+=("$arg")
  fi
done
exec "${realNode}" "\${args[@]}"
`;
    writeFileSync(join(mockBin, "node"), mockNodeScript);
    chmodSync(join(mockBin, "node"), 0o755);
    writeFileSync(join(mockBin, "node.exe"), mockNodeScript);
    chmodSync(join(mockBin, "node.exe"), 0o755);

    // Stub sleep
    const mockSleepScript = `#!/usr/bin/env bash
exit 0
`;
    writeFileSync(join(mockBin, "sleep"), mockSleepScript);
    chmodSync(join(mockBin, "sleep"), 0o755);
    writeFileSync(join(mockBin, "sleep.exe"), mockSleepScript);
    chmodSync(join(mockBin, "sleep.exe"), 0o755);

    // Stub flisk
    const mockFliskScript = `#!/usr/bin/env bash
if [ -n "$LOG_FILE" ]; then
  echo "flisk $* (cwd=$(basename "$PWD"))" >> "$LOG_FILE"
fi

case "$1" in
  project)
    if [ "$2" = "example" ]; then
      pdir=""
      shift 2
      while [ "$#" -gt 0 ]; do
        if [ "$1" = "--path" ]; then
          pdir="$2"
          shift 2
        else
          shift
        fi
      done
      if [ -n "$pdir" ]; then
        mkdir -p "$pdir"
        echo "INFISICAL_ENABLED=true" > "$pdir/.env"
      fi
      exit 0
    elif [ "$2" = "--yes" ]; then
      exit 0
    fi
    exit 0
    ;;
  doctor)
    if [ "$MOCK_FAIL_DOCTOR" = "1" ]; then
      echo "doctor check error" >&2
      exit 1
    fi
    if [ "$MOCK_DOCTOR_NO_PORT" = "1" ]; then
      echo "flisk doctor: all checks passed, no port reported"
      exit 0
    fi
    echo "flisk doctor: ingress HTTP 8080, services healthy"
    exit 0
    ;;
  config)
    if [ "$MOCK_FAIL_CONFIG_VERIFY" = "1" ]; then
      echo "config verification error" >&2
      exit 1
    fi
    exit 0
    ;;
  up)
    if [ "$MOCK_UP_EXIT_BEFORE_TILT" = "1" ]; then
      echo "flisk up crash before tilt"
      exit 1
    fi
    if [ "$MOCK_UP_TIMEOUT" = "1" ]; then
      echo "flisk up started without tilt banner"
      command -p sleep 30 &
      wait $!
      exit 0
    fi
    echo "Running tilt up"
    command -p sleep 30 &
    wait $!
    exit 0
    ;;
  down)
    exit 0
    ;;
  *)
    echo "unexpected flisk command: $*" >&2
    exit 1
    ;;
esac
`;
    writeFileSync(join(mockBin, "flisk"), mockFliskScript);
    chmodSync(join(mockBin, "flisk"), 0o755);
    writeFileSync(join(mockBin, "flisk.exe"), mockFliskScript);
    chmodSync(join(mockBin, "flisk.exe"), 0o755);

    // Stub curl
    const mockCurlScript = `#!/usr/bin/env bash
url=""
write_format=""
output_file=""
http_method="GET"

while [ "$#" -gt 0 ]; do
  case "$1" in
    -X)
      http_method="$2"
      shift 2
      ;;
    -H|-d)
      shift 2
      ;;
    -o)
      output_file="$2"
      shift 2
      ;;
    -w)
      write_format="$2"
      shift 2
      ;;
    -fsS|-fsS*|-sS|-s|-fs)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [ -n "$LOG_FILE" ]; then
  echo "curl $http_method $url" >> "$LOG_FILE"
fi

if [ "$MOCK_FAIL_ROUTES_READY" = "1" ]; then
  if [ -n "$write_format" ]; then
    printf '%s' "\${write_format//'%{http_code}'/503}"
  fi
  exit 22
fi

status_code=200
body=""

if [[ "$url" == *"/api/orders/health" ]]; then
  if [ "$MOCK_FAIL_API_HEALTH" = "1" ]; then
    body='{"ok":false}'
  else
    body='{"ok":true}'
  fi
elif [[ "$url" == *"/api/orders/worker-ready" ]]; then
  if [ "$MOCK_FAIL_WORKER_READY" = "1" ]; then
    body='{"ready":false}'
  else
    body='{"ready":true}'
  fi
elif [[ "$url" == *"/orders-app/"* ]] || [[ "$url" == *"/orders-app" ]]; then
  if [ "$MOCK_FAIL_ORDERS_APP" = "1" ]; then
    body='<!DOCTYPE html><html><head><title>Under Maintenance</title></head><body>App</body></html>'
  else
    body='<!DOCTYPE html><html><head><title>Flisk Orders</title></head><body>App</body></html>'
  fi
elif [ "$http_method" = "POST" ]; then
  if [ "$MOCK_FAIL_ORDER_CREATE" = "1" ]; then
    exit 1
  fi
  body='{"order":{"id":"order-wsl2-101","item":"WSL2 smoke test"}}'
else
  # GET order by id
  if [ "$MOCK_FAIL_ORDER_OBSERVE" = "1" ]; then
    body='{"order":{"id":"order-wsl2-101","workerSeenAt":null}}'
  else
    body='{"order":{"id":"order-wsl2-101","workerSeenAt":"2026-10-31T14:15:00Z"}}'
  fi
fi

if [ -n "$output_file" ]; then
  if [ "$output_file" != "/dev/null" ]; then
    printf '%s' "$body" > "$output_file"
  fi
else
  if [ -n "$write_format" ]; then
    formatted="\${write_format//'%{http_code}'/$status_code}"
    printf '%s%s' "$body" "$formatted"
  else
    printf '%s' "$body"
  fi
fi

exit 0
`;
    writeFileSync(join(mockBin, "curl"), mockCurlScript);
    chmodSync(join(mockBin, "curl"), 0o755);
    writeFileSync(join(mockBin, "curl.exe"), mockCurlScript);
    chmodSync(join(mockBin, "curl.exe"), 0o755);

    // Setup BASH_ENV to ensure mockBin precedes everything in MSYS2 / Git Bash
    let bashEnvMockDir = posixPath(mockBin);
    if (/^[A-Za-z]:/.test(bashEnvMockDir)) {
      bashEnvMockDir = bashEnvMockDir.replace(/^([A-Za-z]):/, (m, d) => `/${d.toLowerCase()}`);
    }
    writeFileSync(envFile, `export PATH="${bashEnvMockDir}:$PATH"\n`);

    const scriptArgs = args !== null ? args : [];
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
        BASH_ENV: posixPath(envFile),
        TMPDIR: posixPath(tmpDir),
        LOG_FILE: posixPath(logFile),
        MOCK_FAIL_DOCTOR: failDoctor ? "1" : "0",
        MOCK_DOCTOR_NO_PORT: doctorNoPort ? "1" : "0",
        MOCK_FAIL_CONFIG_VERIFY: failConfigVerify ? "1" : "0",
        MOCK_UP_EXIT_BEFORE_TILT: upExitBeforeTilt ? "1" : "0",
        MOCK_UP_TIMEOUT: upTimeout ? "1" : "0",
        MOCK_FAIL_ROUTES_READY: failRoutesReady ? "1" : "0",
        MOCK_FAIL_API_HEALTH: failApiHealth ? "1" : "0",
        MOCK_FAIL_WORKER_READY: failWorkerReady ? "1" : "0",
        MOCK_FAIL_ORDERS_APP: failOrdersApp ? "1" : "0",
        MOCK_FAIL_ORDER_CREATE: failOrderCreate ? "1" : "0",
        MOCK_FAIL_ORDER_OBSERVE: failOrderObserve ? "1" : "0",
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
  const result = runWsl2Smoke({ args: ["dir-one", "dir-two"] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: bash scripts\/wsl2-smoke\.sh \[WORK_DIRECTORY\]/);
  assert.equal(result.events.length, 0);
});

test("runs all WSL2 smoke verification steps in order and exits 0 on success", () => {
  const result = runWsl2Smoke();
  assert.equal(result.status, 0, result.stderr);

  const expectedOutputs = [
    "flisk doctor: ingress HTTP 8080, services healthy",
    "API health via Traefik: HTTP 200; body: {\"ok\":true}",
    "Worker readiness via Traefik: HTTP 200; body: {\"ready\":true}",
    "Orders app via Traefik: HTTP 200; body: <!DOCTYPE html><html><head><title>Flisk Orders</title></head><body>App</body></html>",
    "Created order order-wsl2-101 through Traefik",
    "NATS worker observed order order-wsl2-101",
    "WSL2 smoke passed; stopping the example",
  ];
  let lastIndex = -1;
  for (const line of expectedOutputs) {
    const idx = result.stdout.indexOf(line);
    assert.notEqual(idx, -1, `Expected stdout to contain "${line}", got:\n${result.stdout}`);
    assert.ok(idx > lastIndex, `Expected "${line}" to appear after previous step in stdout`);
    lastIndex = idx;
  }

  assert.equal(result.events.length, 14);
  assert.match(result.events[0], /^flisk project example --path /);
  assert.equal(result.events[1], "flisk project --yes (cwd=flisk-example)");
  assert.equal(result.events[2], "flisk doctor --strict (cwd=flisk-example)");
  assert.equal(result.events[3], "flisk config verify (cwd=flisk-example)");
  assert.equal(result.events[4], "flisk up shop (cwd=flisk-example)");
  assert.equal(result.events[5], "curl GET http://api.flisk-example.localhost:8080/api/orders/health");
  assert.equal(result.events[6], "curl GET http://api.flisk-example.localhost:8080/api/orders/worker-ready");
  assert.equal(result.events[7], "curl GET http://app.flisk-example.localhost:8080/orders-app/");
  assert.equal(result.events[8], "curl GET http://api.flisk-example.localhost:8080/api/orders/health");
  assert.equal(result.events[9], "curl GET http://api.flisk-example.localhost:8080/api/orders/worker-ready");
  assert.equal(result.events[10], "curl GET http://app.flisk-example.localhost:8080/orders-app/");
  assert.equal(result.events[11], "curl POST http://api.flisk-example.localhost:8080/api/orders");
  assert.equal(result.events[12], "curl GET http://api.flisk-example.localhost:8080/api/orders/order-wsl2-101");
  assert.equal(result.events[13], "flisk down (cwd=flisk-example)");
});

test("runs successfully in a custom work directory and preserves it on exit", () => {
  const customDir = mkdtempSync(join(tmpdir(), "flisk-wsl2-custom-dir-"));
  try {
    const result = runWsl2Smoke({ args: [posixPath(customDir)] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(customDir), true);
  } finally {
    rmSync(customDir, { recursive: true, force: true });
  }
});

test("stops when flisk doctor output does not provide an ingress port", () => {
  const result = runWsl2Smoke({ doctorNoPort: true });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Could not determine the HTTP ingress port from flisk doctor output/,
  );
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when flisk up exits before Tilt starts", () => {
  const result = runWsl2Smoke({ upExitBeforeTilt: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /flisk up exited before Tilt started/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when flisk up does not start Tilt within timeout", () => {
  const result = runWsl2Smoke({ upTimeout: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /flisk up did not start Tilt within 150 seconds/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when routed endpoints do not become healthy", () => {
  const result = runWsl2Smoke({ failRoutesReady: true });
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Routed endpoints did not become healthy at ingress port 8080/,
  );
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when API health via Traefik check fails", () => {
  const result = runWsl2Smoke({ failApiHealth: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /API health via Traefik failed: HTTP 200; body: \{"ok":false\}/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when Worker readiness via Traefik check fails", () => {
  const result = runWsl2Smoke({ failWorkerReady: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Worker readiness via Traefik failed: HTTP 200; body: \{"ready":false\}/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when Orders app via Traefik check fails", () => {
  const result = runWsl2Smoke({ failOrdersApp: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Orders app via Traefik failed: HTTP 200;/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});

test("stops when NATS worker does not observe order", () => {
  const result = runWsl2Smoke({ failOrderObserve: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NATS worker did not observe order order-wsl2-101/);
  assert.ok(result.events.includes("flisk down (cwd=flisk-example)"));
});
