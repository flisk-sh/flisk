// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Checks tests/e2e/axes.json (#1291, tracker #1279): every value an axis can take in cli/ has a leg or an allowlist entry
// with an issue link, every leg names a suite that exists, and interactions name known axes. A source value that is missing
// from axes.json fails the check, so removing a value from the file is caught. Only quoted literals are read from a source:
// bring-your-own in appType comes from the BRING_YOUR_OWN_TYPE constant, so axes.json lists it without a source match.
//   node tests/e2e/lib/check-axes.mjs [<repo root>]
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ISSUE = /^#\d+$/;

// Values one source declares: quoted strings of an array, or the keys of a map, between `start` and `end`.
export function sourceValues(text, source) {
	const from = text.indexOf(source.start);
	if (from < 0) return null;
	const to = text.indexOf(source.end, from + source.start.length);
	const segment = text.slice(from, to < 0 ? undefined : to);
	const pattern =
		source.kind === "array"
			? /"([a-z][\w-]*)"/g
			: /(?:^|\n)\s+"?([a-z][\w-]*)"?\s*:/g;
	return new Set([...segment.matchAll(pattern)].map((m) => m[1]));
}

export function checkAxes({ axes, readSource, legExists }) {
	const problems = [];
	const axisNames = new Set(Object.keys(axes));
	for (const [name, axis] of Object.entries(axes)) {
		const label = `axis ${name}`;
		if (!Array.isArray(axis.groups) || axis.groups.length === 0)
			problems.push(`${label}: no groups`);
		const values = axis.values ?? {};
		if (Object.keys(values).length === 0) problems.push(`${label}: no values`);
		for (const [value, cover] of Object.entries(values)) {
			// "leg" names one suite; "legs" names several (a value covered by more than one suite, #1491).
			const legs = Array.isArray(cover.legs)
				? cover.legs
				: typeof cover.leg === "string"
					? [cover.leg]
					: null;
			const hasAllow = typeof cover.allow === "string";
			if ((legs !== null) === hasAllow || (cover.leg !== undefined && cover.legs !== undefined)) {
				problems.push(
					`${label} value "${value}": needs exactly one of "leg", "legs" or "allow"`,
				);
			} else if (hasAllow && !ISSUE.test(cover.allow)) {
				problems.push(
					`${label} value "${value}": "allow" must be an issue such as #1292`,
				);
			} else if (legs !== null) {
				for (const leg of legs) {
					if (!legExists(leg))
						problems.push(
							`${label} value "${value}": leg "${leg}" has no tests/e2e/${leg}/suite.json`,
						);
				}
			}
		}
		for (const d of axis.defaults ?? []) {
			if (!(d in values))
				problems.push(`${label}: default "${d}" is not a listed value`);
		}
		if (axis.source) {
			const text = readSource(axis.source.file);
			const declared = text === null ? null : sourceValues(text, axis.source);
			if (declared === null) {
				problems.push(
					`${label}: source ${axis.source.file} or its start "${axis.source.start}" not found`,
				);
			} else {
				for (const value of declared) {
					if (!(value in values))
						problems.push(
							`${label}: source value "${value}" (${axis.source.file}) has no entry in axes.json`,
						);
				}
			}
		}
		for (const interaction of axis.interactions ?? []) {
			const names = interaction.axes ?? [];
			if (names.length < 2 || names.some((n) => !axisNames.has(n))) {
				problems.push(
					`${label}: interaction needs two or more known axes, got ${JSON.stringify(names)}`,
				);
			}
			if (
				typeof interaction.reason !== "string" ||
				interaction.reason.trim() === ""
			) {
				problems.push(
					`${label}: interaction ${JSON.stringify(names)} needs a reason`,
				);
			}
		}
	}
	return problems;
}

function main(argv) {
	const root = path.resolve(argv[0] ?? path.join(here, "..", "..", ".."));
	const axes = JSON.parse(
		readFileSync(path.join(root, "tests", "e2e", "axes.json"), "utf8"),
	).axes;
	const problems = checkAxes({
		axes,
		readSource: (file) => {
			const full = path.join(root, file);
			return existsSync(full) ? readFileSync(full, "utf8") : null;
		},
		legExists: (leg) =>
			existsSync(path.join(root, "tests", "e2e", leg, "suite.json")),
	});
	for (const problem of problems) console.error(`check-axes: ${problem}`);
	if (problems.length > 0) {
		console.error(`check-axes: ${problems.length} problem(s)`);
		return 1;
	}
	const values = Object.values(axes).reduce(
		(n, a) => n + Object.keys(a.values).length,
		0,
	);
	console.log(
		`check-axes: ${Object.keys(axes).length} axes, ${values} values, all covered`,
	);
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main(process.argv.slice(2));
}
