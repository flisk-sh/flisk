// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Prints the GitHub Actions matrix for one e2e group: the suites in tests/e2e/<group>/*/suite.json whose triggers include the
// given trigger (#1290, tracker #1279). The group workflow reads it with fromJSON(needs.plan.outputs.matrix).
//   node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<tests/e2e dir>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The suites of one group that run for a trigger, as a matrix `include` list. Sorted by name so the matrix is stable.
export function selectSuites(e2eDir, group, trigger) {
	const groupDir = path.join(e2eDir, group);
	if (!existsSync(groupDir)) return [];
	return readdirSync(groupDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const file = path.join(groupDir, entry.name, "suite.json");
			if (!existsSync(file)) return null;
			const suite = JSON.parse(readFileSync(file, "utf8"));
			return { suite, file };
		})
		.filter(
			(x) =>
				x &&
				Array.isArray(x.suite.triggers) &&
				x.suite.triggers.includes(trigger),
		)
		.map((x) => ({
			suite: x.suite.suite,
			timeoutMinutes: x.suite.timeoutMinutes,
		}))
		.sort((a, b) => a.suite.localeCompare(b.suite));
}

function main(argv) {
	const [group, trigger, dir] = argv;
	if (!group || !trigger) {
		console.error(
			"usage: node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<tests/e2e dir>]",
		);
		return 2;
	}
	const e2eDir = path.resolve(
		dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
	);
	console.log(
		JSON.stringify({ include: selectSuites(e2eDir, group, trigger) }),
	);
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main(process.argv.slice(2));
}
