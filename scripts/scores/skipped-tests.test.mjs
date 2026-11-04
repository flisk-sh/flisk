// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the skipped-tests scorer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { measure, scan } from "./skipped-tests.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The fixtures spell the forbidden words with a placeholder so this file does not skip anything itself.
const real = (text) => text.replaceAll("SKIP", "skip").replaceAll("TODO", "todo").replaceAll("x_it", "xit").replaceAll("PYMARK", "@pytest.mark");

test("scan finds each skip form and tells explained from unexplained", () => {
	const js = real(`
it.SKIP("a", () => {});
// flaky on Windows
test.SKIP("b", () => {});
describe.SKIP("c", () => {}); // see #1234
const gap = 1;
x_it("d", () => {});
it.TODO("e");
it.SKIPIf(process.platform === "win32")("f", () => {});
const s = "it.SKIP(";
`);
	assert.deepEqual(scan("a.test.ts", js).map((h) => [h.line, h.explained]), [
		[2, false],
		[4, true],
		[5, true],
		[7, false],
		[8, false],
	]);
	const py = real(`
PYMARK.SKIP
def test_a(): pass
# needs docker
PYMARK.SKIP(reason='x')
pytest.SKIP('runtime reason')
pytest.SKIP()
`);
	assert.deepEqual(scan("test_a.py", py).map((h) => [h.line, h.explained]), [[2, false], [5, true], [7, false]]);
});

test("measure walks cli/src, tests and scripts test files only", async () => {
	const root = mkdtempSync(path.join(tmpdir(), "skipped-tests-"));
	try {
		for (const [rel, body] of Object.entries({
			"cli/src/a.test.ts": 'it.skip("x", () => {});\n',
			"cli/src/a.ts": 'it.skip("not a test file", () => {});\n',
			"tests/test_b.py": "# flaky #77\n@pytest.mark.skip\n",
			"scripts/c.test.mjs": 'test.todo("y");\n',
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = await measure({ root });
		assert.equal(r.value, 2);
		assert.deepEqual(r.findings.map((f) => f.split(" ")[0]), ["cli/src/a.test.ts:1", "scripts/c.test.mjs:1"]);
		assert.match(r.summary, /3 skipped or todo tests, 2 without a reason/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("this repository: stable", async () => {
	const first = await measure({ root: repoRoot });
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
