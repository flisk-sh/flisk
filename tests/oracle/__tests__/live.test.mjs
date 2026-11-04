// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Scaffolds real projects with the CLI in cli/bin and checks the surfaces agree. Slow (doctor), so two shapes only: the one with
// no database and the one that pulls it in through dependsOn. `node tests/oracle/run.mjs --seeds 20` sweeps more.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runSeed } from "../run.mjs";

for (const shape of ["byo-only", "byo-postgres-dep"]) {
	test(`ORACLE: surfaces agree on a ${shape} project`, { timeout: 240_000 }, () => {
		const { failures } = runSeed(1, { shape });
		assert.deepEqual(failures.map((f) => `${f.invariant}: ${f.actual}`), []);
	});
}
