// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Next.js (NEXT_PUBLIC_*) and Vite (VITE_*) inline these variables into the JavaScript every visitor downloads, so a
// credential in one is published, not configured. `flisk doctor` warns users about it (#1646); this gate holds the
// repository to the same rule where users copy from: env templates, Markdown, Compose, Dockerfiles, YAML, shell and
// Starlark. Parsing is public-env/parse.mjs, the judgement is the CLI's own heuristic (public-env/cli-heuristic.mjs), and
// a finding names file, line and variable, never the value. Gate at zero. See docs/scoreboard/public-env-secrets.md.
import { read } from "./lib.mjs";
import { loadJudge } from "./public-env/cli-heuristic.mjs";
import { countAssignments, secretAssignments } from "./public-env/scan.mjs";
import { trackedFiles } from "./tracked-secrets.mjs";

export const meta = {
	id: "public-env-secrets",
	title: "No secret-looking values in tracked NEXT_PUBLIC_* / VITE_* examples",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "findings",
};

// Files a user copies public variables from. Generated output repeats its source, so it is skipped.
export const SCANNED =
	/(^|\/)(\.env(\.[\w.-]+)?|[\w.-]+\.env|Dockerfile[\w.-]*|[\w.-]*compose[\w.-]*\.ya?ml)$|\.(md|mdx|star|ya?ml|sh|toml|json)$/;
export const GENERATED = /^(cli\/dist|cli\/dist-bundle|release-dist-[^/]*|\.flisk|\.flisk-out)\//;

export const isScanned = (rel) => SCANNED.test(rel) && !GENERATED.test(rel);

const message = (rel, { line, name }) => `${rel}:${line} ${name} holds a secret-looking value; public variables ship in the client bundle`;

export async function measure({ root }, { judge } = {}) {
	const isSecret = judge ?? (await loadJudge(root));
	const files = trackedFiles(root).filter(isScanned);
	const findings = [];
	let assigned = 0;
	for (const rel of files) {
		const text = read(root, rel);
		assigned += countAssignments(text);
		for (const hit of secretAssignments(text, isSecret)) findings.push(message(rel, hit));
	}
	return {
		value: findings.length,
		summary: `${assigned} public variable assignments in ${files.length} files, ${findings.length} secret-looking`,
		findings,
	};
}
