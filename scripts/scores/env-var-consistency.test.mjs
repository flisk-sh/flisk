// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the env-var-consistency scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { documented, measure, reads } from "./env-var-consistency.mjs";

function run(files, internal = [], distinct = []) {
	const root = mkdtempSync(path.join(tmpdir(), "env-var-"));
	try {
		for (const [rel, body] of Object.entries(files)) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		return measure({ root }, internal, distinct).findings;
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("documented names come from code spans and fences, not prose or families", () => {
	const d = documented("Set `FLISK_A_B` or FLISK_PROSE.\n`FLISK_FAM_*`\n```sh\nFLISK_C=1 flisk up\n```\n");
	assert.deepEqual(d.map((x) => x.name), ["FLISK_C", "FLISK_A_B"]);
});

test("reads are found per language", () => {
	assert.deepEqual(reads("a.ts", 'process.env.FLISK_A; env["x"]; const k = "FLISK_B";').map((r) => r.name), ["FLISK_A", "FLISK_B"]);
	assert.deepEqual(reads("a.star", "os.environ.get('FLISK_C', '')").map((r) => r.name), ["FLISK_C"]);
	assert.deepEqual(reads("a.sh", 'echo "${FLISK_D:-x} $FLISK_E"').map((r) => r.name), ["FLISK_D", "FLISK_E"]);
	assert.deepEqual(reads("a.ps1", "$env:TDK_F").map((r) => r.name), ["TDK_F"]);
});

test("documented but never mentioned in code is a finding; a mention anywhere clears it", () => {
	assert.deepEqual(run({ "docs/a.md": "`FLISK_GONE` and `FLISK_HERE`\n", "scripts/x.sh": "echo $FLISK_HERE\n" }), [
		"docs/a.md:1 FLISK_GONE: documented, but no code mentions it",
	]);
});

test("a unit test mentioning a variable does not count as code", () => {
	assert.equal(run({ "docs/a.md": "`FLISK_T`\n", "cli/src/__tests__/a.test.ts": "FLISK_T\n" }).length, 1);
});

test("shipped code reading an undocumented FLISK_ variable is a finding; scripts and docs clear it", () => {
	const f = run({ "cli/src/a.ts": "process.env.FLISK_SECRET_KNOB;\nprocess.env.FLISK_OK;\n", "docs/a.md": "`FLISK_OK`\n", "scripts/s.sh": "$FLISK_CI\n" });
	assert.deepEqual(f, ["cli/src/a.ts:1 FLISK_SECRET_KNOB: read by the shipped code, but no doc names it"]);
});

test("INTERNAL hides a read and goes stale loudly", () => {
	assert.deepEqual(run({ "cli/src/a.ts": "process.env.FLISK_I;\n" }, [{ name: "FLISK_I", reason: "x" }]), []);
	assert.match(run({}, [{ name: "FLISK_I", reason: "x" }])[0], /INTERNAL entry no longer matches/);
});

test("TDK_X read next to FLISK_X is drift; TDK_X alone is not", () => {
	const f = run({ "tests/a.ps1": "$env:TDK_Z\n", "cli/src/a.ts": "process.env.FLISK_Z;\n", "docs/a.md": "`FLISK_Z`\n" });
	assert.deepEqual(f, ["tests/a.ps1:1 TDK_Z: drift, the code reads FLISK_Z"]);
	assert.deepEqual(run({ "tests/a.ps1": "$env:TDK_Q\n" }), []);
});

test("two spellings of one name and FLISK_/TILT_ twins are findings; DISTINCT clears a twin and goes stale", () => {
	assert.equal(run({ "docs/a.md": "`FLISK_HTTP_PORT` `FLISK_HTTPPORT`\n", "a.sh": "$FLISK_HTTP_PORT $FLISK_HTTPPORT\n" }).length, 1);
	const files = { "docs/a.md": "`FLISK_ENV` `TILT_ENV`\n", "a.sh": "$FLISK_ENV $TILT_ENV\n" };
	assert.equal(run(files).length, 1);
	assert.deepEqual(run(files, [], [{ pair: ["FLISK_ENV", "TILT_ENV"], reason: "x" }]), []);
	assert.match(run({}, [], [{ pair: ["FLISK_ENV", "TILT_ENV"], reason: "x" }])[0], /DISTINCT entry no longer/);
});
