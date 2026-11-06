// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const LIB = new URL("../lib.sh", import.meta.url).pathname;

function poll(upLog) {
  const dir = mkdtempSync(join(tmpdir(), "poll-until-"));
  if (upLog !== null) writeFileSync(join(dir, "up.log"), upLog);
  const started = Date.now();
  const r = spawnSync("bash", ["-c", `source "${LIB}"; DIR="${dir}"; poll_until "the api is running" 6 false`], { encoding: "utf8" });
  return { r, seconds: (Date.now() - started) / 1000 };
}

test("poll_until stops at once when flisk up refused to start (Cold start blocked)", () => {
  const { r, seconds } = poll("Cold start blocked. Bun/Prisma/NATS are not the first failure.\nFAIL compose Could not verify Docker\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /flisk up refused to start while waiting for: the api is running/);
  assert.ok(seconds < 4, `returned after ${seconds}s, expected well before the 6s timeout`);
});

test("poll_until still waits out the timeout when up.log shows no refusal", () => {
  const { r, seconds } = poll("starting\n");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /timed out after 6s waiting for: the api is running/);
  assert.ok(seconds >= 6);
});
