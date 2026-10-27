// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the test-ports scorer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { guesses, insideString, measure } from "./test-ports.mjs";

test("guesses finds fixed listen ports, Math.random ports and literal loopback fetches", () => {
	const text = [
		"server.listen(0);",
		"server.listen(4800);",
		"app.listen({ port: 3000 });",
		"const port = 4800 + Math.floor(Math.random() * 500);",
		"await fetch('http://127.0.0.1:4800/health');",
		"await fetch(agentUrl(port, '/health'));",
		"await fetch(`http://localhost:${port}/health`);",
	].join("\n");
	assert.deepEqual(
		guesses(text).map((g) => g.line),
		[2, 3, 4, 5],
	);
	assert.match(guesses(text)[0].why, /listen\(4800\)/);
});

test("guesses skips comments and string fixtures that only mention the pattern", () => {
	const text = [
		"// the old test used server.listen(4800)",
		"/* port = 4800 + Math.random() */",
		`"src/api.test.ts": "fetch('http://localhost:4300')",`,
		`expect(x).toContain("CMD bun -e \\"fetch('http://localhost:9090/healthz')\\"");`,
		"const url = 'https://example.com'; // fetch('http://localhost:1')",
	].join("\n");
	assert.deepEqual(guesses(text), []);
});

test("insideString tracks unescaped quotes before a position", () => {
	assert.equal(insideString(`"a": "fetch(`, 7), true);
	assert.equal(insideString(`x = "a"; fetch(`, 9), false);
	assert.equal(insideString(`"say \\"hi\\" fetch(`, 13), true);
});

test("measure reads tracked test files only", () => {
	const root = mkdtempSync(path.join(tmpdir(), "test-ports-"));
	try {
		for (const [rel, body] of Object.entries({
			"cli/src/__tests__/a.test.ts": "server.listen(4800);\n",
			"cli/src/b.spec.mjs": "server.listen(0);\n",
			"cli/src/server.ts": "server.listen(3000);\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 1);
		assert.match(r.findings[0], /^cli\/src\/__tests__\/a\.test\.ts:1 listen\(4800\)/);
		assert.equal(r.summary, "2 test files, 1 guessed ports");
	} finally {
		rmSync(root, { recursive: true });
	}
});
