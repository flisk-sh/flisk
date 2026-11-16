// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const RUN_SH = fileURLToPath(new URL("../../resource-types/worker/run.sh", import.meta.url));

function runWorkerW4(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "flisk-worker-restart-"));
  try {
    const binDir = join(dir, "bin");
    const e2eRoot = join(dir, "e2e");
    const stateFile = join(dir, "restarted");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(e2eRoot, "worker", "worker"), { recursive: true });

    const fliskBin = join(binDir, "flisk");
    writeFileSync(
      fliskBin,
      `#!/usr/bin/env bash
set -euo pipefail
: >"${stateFile}"
printf '%s\n' '{"schemaVersion":1,"data":{"resource":"worker","restarted":true},"errors":[]}'
`,
    );
    chmodSync(fliskBin, 0o755);

    const dockerBin = join(binDir, "docker");
    writeFileSync(
      dockerBin,
      `#!/usr/bin/env bash
set -euo pipefail
restarted=false
[ -f "${stateFile}" ] && restarted=true
case "\${1:-}" in
  ps)
    if [ "$restarted" = true ]; then printf '%s\n' "$AFTER_ID"; else printf '%s\n' "$BEFORE_ID"; fi
    ;;
  inspect)
    if [ "$restarted" = true ]; then printf '%s\n' "$STARTED_AFTER"; else printf '%s\n' "$STARTED_BEFORE"; fi
    ;;
  logs)
    printf 'worker worker started\n'
    if [ "$restarted" = true ] && [ "$EMIT_NEW_LOG" = true ]; then
      printf 'worker worker started\n'
    fi
    ;;
  *)
    echo "unexpected docker call: $*" >&2
    exit 1
    ;;
esac
`,
    );
    chmodSync(dockerBin, 0o755);

    return spawnSync("bash", [RUN_SH, "W4"], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        PATH: `${binDir}:${process.env.PATH}`,
        E2E_ROOT: e2eRoot,
        WORKER_LOG_TIMEOUT: "1",
        BEFORE_ID: "cid-worker-1",
        AFTER_ID: "cid-worker-1",
        STARTED_BEFORE: "2026-01-01T00:00:00.000000000Z",
        STARTED_AFTER: "2026-01-01T00:00:02.000000000Z",
        EMIT_NEW_LOG: "true",
        ...env,
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("worker W4 passes when container id is kept, StartedAt advances, and a new start line is logged", () => {
  const result = runWorkerW4();
  assert.equal(result.status, 0, result.stderr);
});

test("worker W4 rejects a no-op restart with unchanged StartedAt even when historical logs exist", () => {
  const result = runWorkerW4({
    STARTED_AFTER: "2026-01-01T00:00:00.000000000Z",
    EMIT_NEW_LOG: "false",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /worker did not restart: StartedAt is unchanged or missing/);
});

test("worker W4 rejects a restart that updates StartedAt without logging a new start line", () => {
  const result = runWorkerW4({ EMIT_NEW_LOG: "false" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /timed out.*worker logged 'worker started' after restart/);
});

test("worker W4 rejects a replaced container", () => {
  const result = runWorkerW4({ AFTER_ID: "cid-worker-2" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /worker container was replaced by the restart/);
});
