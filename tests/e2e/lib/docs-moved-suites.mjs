// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The e2e guide's "moved suites" sentence is derived from the suite folders, not hand-maintained:
// compare the list in the English guide and both translations with tests/e2e/resource-types/*/suite.json.
// Used by check-docs.mjs (D3) and __tests__/docs-moved-suites.test.mjs.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const GUIDES = [
	"docs/contributing/05-write-e2e.md",
	"docs/contributing/translations/05-write-e2e-ja.md",
	"docs/contributing/translations/05-write-e2e-ko.md",
];

// Old wording claimed that a single suite had moved. Keep these from creeping back in next to a new list.
const STALE = [/has moved so far/i, /移動したのは/, /`resource-types\/[^`]+`만\s*이전되었습니다/];

export function movedSuites(root) {
	const dir = path.join(root, "tests", "e2e", "resource-types");
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, "suite.json")))
		.map((entry) => entry.name)
		.sort();
}

export function checkMovedSuiteDocs(root) {
	const expected = movedSuites(root);
	if (expected.length === 0) return ["tests/e2e/resource-types: no suite folders with suite.json found"];
	const expectedList = expected.map((name) => `\`${name}\``).join(", ");
	const problems = [];

	for (const guide of GUIDES) {
		const file = path.join(root, guide);
		if (!existsSync(file)) {
			problems.push(`${guide}: missing guide`);
			continue;
		}
		const lines = readFileSync(file, "utf8").split(/\r?\n/);
		for (const line of lines) {
			if (STALE.some((pattern) => pattern.test(line))) {
				problems.push(`${guide}: stale "only one suite has moved" sentence; list all ${expected.length} moved suites`);
			}
		}

		// Every moved suite is named as an inline-code token on one line, in the same sorted order as the folders.
		const candidates = lines.filter((line) => expected.every((name) => line.includes(`\`${name}\``)));
		if (candidates.length !== 1) {
			problems.push(
				`${guide}: expected exactly one line listing all ${expected.length} moved suites (${expectedList}), found ${candidates.length}`,
			);
			continue;
		}
		const line = candidates[0];
		const colon = Math.max(line.indexOf(":"), line.indexOf("："));
		if (colon < 0 || !new RegExp(`\\b${expected.length}\\b`).test(line)) {
			problems.push(`${guide}: moved-suite line must give the count ${expected.length} and a colon-separated list`);
			continue;
		}
		const tokens = [...line.slice(colon + 1).matchAll(/`([^`]+)`/g)].map((match) => match[1]);
		if (tokens.length !== expected.length || tokens.some((name, index) => name !== expected[index])) {
			const found = tokens.map((name) => `\`${name}\``).join(", ") || "empty";
			problems.push(`${guide}: moved-suite list is ${found}; expected ${expectedList}`);
		}
	}
	return problems;
}
