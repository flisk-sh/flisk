// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Test debt: skipped, todo and disabled tests in cli/src, tests/ and scripts/**/*.test.mjs (JS/TS: .skip, .todo, xit,
// xdescribe; Python: pytest.mark.skip, pytest.skip, unittest.skip). .claude/memory/MEMORY.md says never to leave a
// .skip on a failing test, so a skip with no reason on its line or the line above (a comment, or an issue reference
// such as #1234) is the finding. Gate at zero unexplained skips (the repo has none); the summary also gives the total.
import { isTestFile, read, walk } from "./lib.mjs";

export const meta = {
	id: "skipped-tests",
	title: "Skipped tests without a reason",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "unexplained skips",
};

const JS_SKIP = /\b(?:(?:it|test|describe)\.(?:skip|todo)|(?:it|test|describe)\.(?:skipIf|runIf)\s*\([^)]*\)\s*\(|xit|xdescribe|xtest)\s*\(/;
const PY_SKIP = /@pytest\.mark\.skip\b|\bpytest\.skip\s*\(|@unittest\.skip\w*\s*\(|\bunittest\.skip\w*\s*\(/;
// A reason is an issue reference or a comment (JS // and /* */, Python #) on the line or the one above.
const ISSUE = /#\d{2,}/;
const COMMENT = /\/\/\s*\S|\/\*|#\s*\S/;

// Exclusions, each a false positive: skipIf/runIf are conditional platform guards, not disabled tests; a runtime
// `ctx.skip(reason)` or `pytest.skip("reason")` inside a test states its reason as the argument (handled below); a
// match after a quote sits inside a string (a fixture in a test about this scorer), not in code.
const inQuotes = (line, idx) => /["'`]/.test(line.slice(0, idx));

export function scan(rel, text) {
	const lines = text.split("\n");
	const py = rel.endsWith(".py");
	const out = [];
	lines.forEach((line, i) => {
		const m = (py ? PY_SKIP : JS_SKIP).exec(line);
		if (!m || inQuotes(line, m.index) || /^\s*(\/\/|#)/.test(line)) return;
		if (/\.(skipIf|runIf)\b/.test(m[0])) return;
		// A runtime skip with a message gives its reason in the call.
		if (/\bpytest\.skip\s*\(\s*["']\w/.test(line)) return;
		const near = `${lines[i - 1] ?? ""}\n${line}`;
		out.push({ rel, line: i + 1, text: line.trim(), explained: ISSUE.test(near) || COMMENT.test(near) });
	});
	return out;
}

export function testFiles(root) {
	const js = (rel) => /\.[cm]?[jt]sx?$/.test(rel) && isTestFile(rel);
	return [
		...walk(root, "cli/src", js),
		...walk(root, "tests", (rel) => js(rel) || /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(rel)),
		...walk(root, "scripts", (rel) => /\.test\.mjs$/.test(rel)),
	];
}

export async function measure({ root }) {
	const hits = testFiles(root).flatMap((rel) => scan(rel, read(root, rel)));
	const bad = hits.filter((h) => !h.explained);
	return {
		value: bad.length,
		summary: `${hits.length} skipped or todo tests, ${bad.length} without a reason`,
		findings: bad.map((h) => `${h.rel}:${h.line} ${h.text}`),
	};
}
