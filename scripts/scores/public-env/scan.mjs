// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Applies a judge (value, name) -> boolean to the public-variable assignments of a file's text. The judge is injected, so
// the scan is tested with a stub and the scorer passes the CLI's real heuristic. A hit keeps the line and the variable
// name; the value is judged and dropped here, so no later step can print it.
import { assignments } from "./parse.mjs";

// The { line, name } of every assignment the judge calls a secret.
export function secretAssignments(text, isSecret) {
	const hits = [];
	text.split("\n").forEach((line, i) => {
		for (const { name, value } of assignments(line)) if (isSecret(value, name)) hits.push({ line: i + 1, name });
	});
	return hits;
}

// How many public assignments the text holds, for the scorer's summary.
export function countAssignments(text) {
	return text.split("\n").reduce((n, line) => n + assignments(line).length, 0);
}
