// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const LIB = new URL("../lib.sh", import.meta.url).pathname;

function budget(count, each, env = {}) {
  const r = spawnSync("bash", ["-c", `source "${LIB}"; READY_TIMEOUT="\${E2E_READY_TIMEOUT:-1200}"; scaled_ready_timeout ${count} ${each}`], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return Number(r.stdout.trim());
}

test("a small draw keeps the default 20 minutes", () => {
  assert.equal(budget(36, 15), 1200);
});

test("a large draw gets 15s per resource", () => {
  assert.equal(budget(300, 15), 4500);
});

test("E2E_READY_TIMEOUT wins over the scaled budget", () => {
  assert.equal(budget(300, 15, { E2E_READY_TIMEOUT: "90" }), 90);
});
