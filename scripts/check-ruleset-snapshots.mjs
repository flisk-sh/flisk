// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Compare checked-in GitHub ruleset request bodies with the active repository rulesets.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function normalize(value) {
	if (Array.isArray(value)) {
		return value.map(normalize).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
	}
	return value;
}

export function compareRuleset(snapshot, live) {
	const fields = ["name", "target", "enforcement", "bypass_actors", "conditions", "rules"];
	return fields.filter((field) => {
		const expected = snapshot[field];
		const actual = live[field];
		if (field === "bypass_actors") {
			return JSON.stringify(normalize(expected)) !== JSON.stringify(normalize((actual ?? []).map(({ actor_id, actor_type, bypass_mode }) => ({ actor_id, actor_type, bypass_mode }))));
		}
		if (field === "conditions") {
			return JSON.stringify(normalize(expected)) !== JSON.stringify(normalize(actual ?? {}));
		}
		if (field === "rules") {
			const canonical = (rules = []) => rules.map((rule) => ({
				type: rule.type,
				...(rule.parameters === undefined ? {} : { parameters: rule.parameters }),
			}));
			return JSON.stringify(normalize(canonical(expected))) !== JSON.stringify(normalize(canonical(actual)));
		}
		return JSON.stringify(normalize(expected)) !== JSON.stringify(normalize(actual));
	});
}

function main() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const repo = process.env.GITHUB_REPOSITORY ?? "flisk-sh/tdk-cli-core";
	const summaries = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/rulesets?per_page=100`], { encoding: "utf8" }));
	const files = ["main.json", "releases.json"];
	const problems = [];
	for (const file of files) {
		const snapshot = JSON.parse(readFileSync(path.join(root, ".github/rulesets", file), "utf8"));
		const summary = summaries.find((ruleset) => ruleset.name === snapshot.name);
		if (!summary) {
			problems.push(`${file}: live ruleset '${snapshot.name}' was not found`);
			continue;
		}
		const current = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/rulesets/${summary.id}`], { encoding: "utf8" }));
		const mismatches = compareRuleset(snapshot, current);
		if (mismatches.length) problems.push(`${file}: live ruleset differs in ${mismatches.join(", ")}`);
	}
	for (const problem of problems) console.error(`check-ruleset-snapshots: ${problem}`);
	if (problems.length) return 1;
	console.log(`check-ruleset-snapshots: ${files.length} ruleset snapshots match live GitHub rulesets`);
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		process.exitCode = main();
	} catch (error) {
		console.error(`check-ruleset-snapshots: ${error.message}`);
		process.exitCode = 1;
	}
}
