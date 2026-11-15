// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../lib.sh", import.meta.url));
const COMMON = fileURLToPath(new URL("../../resource-types/common.sh", import.meta.url));

function restart(env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "flisk-common-restart-"));
  try {
    const result = spawnSync(
      "bash",
      [
        "-c",
        String.raw`
set -euo pipefail
source "$1"
source "$2"
OUT="$3"
READY_TIMEOUT=5
restarted=false
docker() {
  [ "$1" = inspect ] && [ "$2" = -f ] && [ "$3" = '{{.State.StartedAt}}' ] && [ "$4" = "$BEFORE_ID" ] \
    || die "unexpected docker arguments: $*"
  if [ "$restarted" = false ]; then
    [ "$FAIL_INSPECT" != before ] || return 1
    printf '%s\n' "$STARTED_BEFORE"
  else
    [ "$FAIL_INSPECT" != after ] || return 1
    printf '%s\n' "$STARTED_AFTER"
  fi
}
running_container() {
  [ "$1" = api ] || die "unexpected resource: $1"
  printf '%s\n' "$AFTER_ID"
}
run() {
  [ "$*" = 'restart-api restart api --json' ] || die "unexpected restart arguments: $*"
  RC="$RESTART_EXIT_CODE"
  printf '%s\n' '{"schemaVersion":1,"data":{"resource":"api","restarted":true},"errors":[]}' > "$OUT/restart-api.out"
  restarted=true
}
ready() { printf 'READY\n' > "$OUT/ready"; }
if [ "$WITH_READY" = true ]; then
  common_restart api "$BEFORE_ID" "api ready" ready
else
  common_restart api "$BEFORE_ID"
fi
`,
        "common-restart-test",
        LIB,
        COMMON,
        dir,
      ],
      {
        encoding: "utf8",
        timeout: 10_000,
        env: {
          PATH: process.env.PATH,
          BEFORE_ID: "cid-api",
          AFTER_ID: "cid-api",
          STARTED_BEFORE: "2026-01-01T00:00:00.000000000Z",
          STARTED_AFTER: "2026-01-01T00:00:01.000000000Z",
          WITH_READY: "true",
          FAIL_INSPECT: "",
          RESTART_EXIT_CODE: "0",
          ...env,
        },
      },
    );
    return { ...result, didCheckReady: existsSync(join(dir, "ready")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("common_restart verifies the same container started again, then waits for readiness", () => {
  const result = restart();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.didCheckReady, true);
});

test("common_restart verifies a restart when no readiness command is supplied", () => {
  const result = restart({ WITH_READY: "false" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.didCheckReady, false);
});

test("common_restart rejects a no-op even when the same container is already ready", () => {
  const result = restart({ STARTED_AFTER: "2026-01-01T00:00:00.000000000Z" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /api did not restart: StartedAt is unchanged or missing/);
  assert.equal(result.didCheckReady, false);
});

test("common_restart rejects a replaced container", () => {
  const result = restart({ AFTER_ID: "cid-new" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /api container changed after restart: expected cid-api, got cid-new/);
  assert.equal(result.didCheckReady, false);
});

test("common_restart rejects a container that is no longer running", () => {
  const result = restart({ AFTER_ID: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /api container changed after restart: expected cid-api, got none/);
});

test("common_restart needs a container before attempting the restart", () => {
  const result = restart({ BEFORE_ID: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no running container for api before restart/);
});

for (const when of ["before", "after"]) {
  test(`common_restart fails when inspecting the container ${when} restart fails`, () => {
    const result = restart({ FAIL_INSPECT: when });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`could not inspect api ${when} restart`));
    assert.equal(result.didCheckReady, false);
  });
}

for (const when of ["BEFORE", "AFTER"]) {
  test(`common_restart fails when StartedAt is empty ${when.toLowerCase()} restart`, () => {
    const result = restart({ [`STARTED_${when}`]: "" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing StartedAt|StartedAt is unchanged or missing/);
    assert.equal(result.didCheckReady, false);
  });
}

test("common_restart fails when flisk restart exits nonzero", () => {
  const result = restart({ RESTART_EXIT_CODE: "1" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /flisk restart api exited 1/);
  assert.equal(result.didCheckReady, false);
});
