// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assignments, measure, scan } from "./public-env-secrets.mjs";

// A stand-in for the CLI heuristic: anything starting with "SECRET" is a credential. Keeps the test off cli/dist.
const judge = (value) => value.startsWith("SECRET");

test("assignments reads env, YAML, JSON, Dockerfile and build-arg forms", () => {
	const names = (l) => assignments(l).map((a) => `${a.name}=${a.value}`);
	assert.deepEqual(names("VITE_A=one"), ["VITE_A=one"]);
	assert.deepEqual(names("  - NEXT_PUBLIC_B=two"), ["NEXT_PUBLIC_B=two"]);
	assert.deepEqual(names("VITE_C: 'three'"), ["VITE_C=three"]);
	assert.deepEqual(names('"VITE_D": "four five"'), ["VITE_D=four five"]);
	assert.deepEqual(names("ENV VITE_E=six"), ["VITE_E=six"]);
	assert.deepEqual(names("--build-arg VITE_F=seven"), ["VITE_F=seven"]);
});

test("assignments ignores constants that merely contain VITE_ and plain mentions", () => {
	for (const line of ["_VITE_BUILD = 'vite build'", "REACT_VITE_FRONTEND = \"\"\"x\"\"\"", "uses `VITE_API_URL` at build time", "load('./a.star', 'X_VITE_Y')"])
		assert.deepEqual(assignments(line), [], line);
});

test("scan reports line and variable name, never the value", () => {
	const hits = scan("VITE_OK=fine\nVITE_BAD=SECRETVALUE123\n", judge);
	assert.deepEqual(hits, [{ line: 2, name: "VITE_BAD" }]);
	assert.equal(JSON.stringify(hits).includes("SECRETVALUE"), false);
});

test("measure scans tracked-style files with the CLI heuristic and skips generated output", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "public-env-"));
	try {
		const put = (rel, body) => {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		};
		put("cli/dist/utils/public-env-secrets.js", "export const isSecretLookingValue = (v) => v.startsWith('SECRET');\n");
		put("docs/a.md", "```\nVITE_KEY=SECRETabc\n```\n");
		put("cli/dist/generated.md", "VITE_KEY=SECRETabc\n");
		put("ok.env", "VITE_URL=http://x\n");
		const r = await measure({ root });
		assert.equal(r.value, 1);
		assert.match(r.findings[0], /^docs\/a\.md:2 VITE_KEY holds a secret-looking value/);
		assert.equal(r.findings[0].includes("SECRETabc"), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("measure throws a build hint when cli/dist is missing", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "public-env-"));
	try {
		await assert.rejects(measure({ root }), /npm --prefix cli run build/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
