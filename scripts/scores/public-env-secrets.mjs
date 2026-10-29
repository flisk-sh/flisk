// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Next.js (NEXT_PUBLIC_*) and Vite (VITE_*) inline these variables into the JavaScript every visitor downloads, so a
// credential in one is published, not configured. `flisk doctor` warns about that in a user's .env files (#1646). This
// gate holds the repository to the same rule in the places users copy from: env templates, the scaffolding templates
// in cli/templates/, Markdown examples, Compose files, Dockerfiles and the Starlark generators. It reads every tracked
// line that assigns a public variable (`VITE_X=...`, `VITE_X: ...`, `"VITE_X": "..."`, `ENV VITE_X=...`) and judges the
// value with the CLI's own isSecretLookingValue from cli/dist, so the gate and the doctor check can never disagree.
// A finding names the file, the line and the variable, never the value. Gate at zero.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { has, read } from "./lib.mjs";
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

export const HEURISTIC = "cli/dist/utils/public-env-secrets.js";

// The files a user copies public variables from. Generated output (cli/dist, release-dist-*) repeats its source.
export const SCANNED =
	/(^|\/)(\.env(\.[\w.-]+)?|[\w.-]+\.env|Dockerfile[\w.-]*|[\w.-]*compose[\w.-]*\.ya?ml)$|\.(md|mdx|star|ya?ml|sh|toml|json)$/;
const GENERATED = /^(cli\/dist|cli\/dist-bundle|release-dist-[^/]*|\.flisk|\.flisk-out)\//;

// One assignment of a public variable on a line: `KEY=value`, `KEY: value`, `"KEY": "value"`, `ENV KEY=value`,
// `--build-arg KEY=value`, `- KEY=value`. The value is everything up to the end of the token, without its quotes. A
// name glued to a longer identifier (`_VITE_BUILD`, `REACT_VITE_FRONTEND`) is a constant, not a variable.
const ASSIGN =
	/(?:^|[\s"'`{(,-])["']?((?:NEXT_PUBLIC|VITE)_[A-Z0-9_]+)["']?\s*[=:]\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s"'`,;)}#]+))/g;

// Each { name, value } a line assigns to a public variable.
export function assignments(line) {
	const out = [];
	for (const m of line.matchAll(ASSIGN)) out.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] ?? m[5] ?? "" });
	return out;
}

// The secret-looking public assignments in one file's text: { line, name }. The value is judged, then dropped.
export function scan(text, isSecretLookingValue) {
	const out = [];
	text.split("\n").forEach((line, i) => {
		for (const { name, value } of assignments(line)) if (isSecretLookingValue(value, name)) out.push({ line: i + 1, name });
	});
	return out;
}

// The CLI's heuristic module (isPublicEnvVar, isSecretLookingValue), the one `flisk doctor` runs.
export async function loadHeuristic(root) {
	if (!has(root, HEURISTIC)) throw new Error(`${HEURISTIC} is missing: run \`npm --prefix cli run build\``);
	return import(pathToFileURL(path.join(root, HEURISTIC)).href);
}

export async function measure({ root }) {
	const { isSecretLookingValue } = await loadHeuristic(root);
	const files = trackedFiles(root).filter((rel) => SCANNED.test(rel) && !GENERATED.test(rel));
	const findings = [];
	let assigned = 0;
	for (const rel of files) {
		const text = read(root, rel);
		if (!/NEXT_PUBLIC_|VITE_/.test(text)) continue;
		for (const line of text.split("\n")) assigned += assignments(line).length;
		for (const { line, name } of scan(text, isSecretLookingValue))
			findings.push(`${rel}:${line} ${name} holds a secret-looking value; public variables ship in the client bundle`);
	}
	return {
		value: findings.length,
		summary: `${assigned} public variable assignments in ${files.length} files, ${findings.length} secret-looking`,
		findings,
	};
}
