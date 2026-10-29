// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkNames, measure } from "./doctor-check-docs.mjs";

test("checkNames takes CheckResult names, once each, and not other name: fields", () => {
	const src = `return {\n    name: "Docker Versions",\n    didPass: true,\n};\nreturn { name: "Tilt CLI", didPass: true };\n  name: "Docker Versions",\nconst x = { name: "lowercase" };\n`;
	assert.deepEqual(checkNames(src), ["Docker Versions"]);
});

test("measure counts a check as documented when troubleshooting.md names it, in any case", () => {
	const root = mkdtempSync(path.join(tmpdir(), "doctor-docs-"));
	try {
		const put = (rel, body) => {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		};
		put("cli/src/commands/doctor.ts", '  name: "Docker Versions",\n  name: "Tilt CLI",\n');
		put("cli/src/commands/__tests__/doctor.test.ts", '  name: "Ignored Test Check",\n');
		put("docs/troubleshooting.md", "## docker versions\n");
		const r = measure({ root });
		assert.equal(r.value, 50);
		assert.deepEqual(r.findings, ['docs/troubleshooting.md: no entry for the "Tilt CLI" check']);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("measure reports no data when no check names are found, and throws without the page", () => {
	const root = mkdtempSync(path.join(tmpdir(), "doctor-docs-"));
	try {
		assert.throws(() => measure({ root }), /troubleshooting\.md is missing/);
		mkdirSync(path.join(root, "docs"));
		writeFileSync(path.join(root, "docs/troubleshooting.md"), "x");
		assert.equal(measure({ root }).value, null);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
