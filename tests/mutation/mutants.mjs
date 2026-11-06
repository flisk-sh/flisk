// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Known bugs to inject into the CLI, one at a time, to measure what each bug-finding engine can catch. Every mutant edits the
// TypeScript source (what the unit tests run) and the compiled dist (what ORACLE and FALSIFIER run) with the same replacement, so
// the three are compared on the same bug. `nth` picks the nth match when a line occurs more than once (default 1).
// A mutant whose `find` no longer matches fails the unit test in __tests__/mutants.test.mjs: update it with the code it mirrors.
const VALIDATION = "utils/validation";
const CHECKS = "utils/service-config-checks";
const GRAPH = "utils/dependency-graph";

export const MUTANTS = [
	{ id: "name-limit-253", file: VALIDATION, find: "MAX_NAME_LENGTH = 63;", replace: "MAX_NAME_LENGTH = 253;", bug: "a name may be 253 characters, not 63 (the real defect FALSIFIER found, in a milder form)", unit: ["validation"], falsifier: "invalid-resources-rejected" },
	{ id: "stack-length-unchecked", file: VALIDATION, find: "if (name.length > MAX_NAME_LENGTH) {", nth: 2, replace: "if (false) {", bug: "a stack name's length is never checked", unit: ["validation"], falsifier: "invalid-resources-rejected" },
	{ id: "uppercase-allowed", file: VALIDATION, find: "/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/", replace: "/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/", bug: "uppercase letters are valid in names", unit: ["validation"], falsifier: "invalid-resources-rejected" },
	{ id: "edge-hyphen-allowed", file: VALIDATION, find: "/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/", replace: "/^[a-z0-9-]+$/", bug: "a name may start or end with a hyphen", unit: ["validation"], falsifier: "invalid-resources-rejected" },
	{ id: "first-cycle-ignored", file: CHECKS, find: "const cycles = findDependencyCycles(resources);", replace: "const cycles = findDependencyCycles(resources).slice(1);", bug: "the first dependency cycle found is not reported", unit: ["service-config-checks", "dependency-graph"], falsifier: "dependency-cycles-detected" },
	{ id: "self-dependency-ignored", file: GRAPH, find: "if (byName.has(entry)) {", replace: "if (byName.has(entry) && entry !== resource.name) {", bug: "a resource that depends on itself is not a cycle", unit: ["service-config-checks", "dependency-graph"], falsifier: "dependency-cycles-detected" },
	{ id: "last-dependency-dropped", file: GRAPH, find: "for (const entry of dependsOnOf(resource.config)) {", replace: "for (const entry of dependsOnOf(resource.config).slice(0, -1)) {", bug: "the last dependsOn entry of every resource is dropped from the graph", unit: ["service-config-checks", "dependency-graph"], falsifier: "dependency-cycles-detected" },

	// The Compose exporter is its own repo (flisk-sh/flisk-export, run by `flisk export compose` through npx). These edit its
	// src/compose.ts in a local clone (run.mjs --export-repo <dir>), rebuild it, and point flisk at the clone with
	// FLISK_EXPORT_PACKAGE; its own CI is `npm run typecheck`, `lint`, `build` and `test`, so `npm test` there is its unit tests.
	{ id: "compose-last-env-dropped", repo: "export", file: "src/compose.ts", find: "const envNames = [...values.keys()].filter((k) => ENV_NAME.test(k)).sort();", replace: "const envNames = [...values.keys()].filter((k) => ENV_NAME.test(k)).sort().slice(0, -1);", bug: "the last environment variable of every service is missing from the Compose file", falsifier: "compose-preserves-definitions" },
	{ id: "compose-env-unquoted", repo: "export", file: "src/compose.ts", find: '`      ${key}: ${q(values.get(key) ?? "")}`', replace: '`      ${key}: ${values.get(key) ?? ""}`', bug: "environment values are written without YAML quoting (yes, 007 and k: v change meaning)", falsifier: "compose-preserves-definitions" },
	{ id: "compose-single-dependency-dropped", repo: "export", file: "src/compose.ts", find: "if (dependsOn.length > 0) {", replace: "if (dependsOn.length > 1) {", bug: "a service with exactly one dependency gets no depends_on", falsifier: "compose-preserves-definitions" },
	{ id: "compose-required-secrets-dropped", repo: "export", file: "src/compose.ts", find: "for (const key of strings(record(c.secrets).required)) values.set(key, `\\${${key}}`);", replace: "for (const key of [] as string[]) values.set(key, `\\${${key}}`);", bug: "required secrets are not listed in the Compose environment", falsifier: "compose-preserves-definitions" },
];

// Applies one mutant's replacement to a file's text. Throws when the pattern does not match, so a stale mutant is loud.
export function mutate(text, mutant) {
	const nth = mutant.nth ?? 1;
	let from = -1;
	for (let i = 0; i < nth; i++) {
		from = text.indexOf(mutant.find, from + 1);
		if (from === -1) throw new Error(`mutant ${mutant.id}: "${mutant.find}" occurrence ${nth} not found`);
	}
	return text.slice(0, from) + mutant.replace + text.slice(from + mutant.find.length);
}
