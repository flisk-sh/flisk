// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE's regression vault: replays every fixture in tests/oracle/regressions/ against the built CLI, strict (no known-gap
// exemptions). A "fixed" fixture must hold; an "open" one must still fail the same way, so the day it is fixed this test says so.
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadRegressions, replayScenario, verdict } from "../lib/vault.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../regressions");

for (const { file, fx } of loadRegressions(dir)) {
	test(`ORACLE regression ${file} (${fx.status})`, { timeout: 240_000 }, () => {
		assert.equal(verdict(file, fx, replayScenario(fx.scenario, fx.invariant)), null);
	});
}
