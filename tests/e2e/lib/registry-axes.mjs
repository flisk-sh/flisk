// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Prints the matrix axis values the CLI's registries declare, as JSON (#1290, openspec task 3b.5). The changes job in ci.yml runs
// it and exposes the result as an output, so a matrix built from it always matches the code. Values come from the same sources
// tests/e2e/axes.json names; check-axes.mjs still fails when a source value has no entry in axes.json.
//   node tests/e2e/lib/registry-axes.mjs [<repo root>]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceValues } from "./check-axes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// Axis name -> source, for the axes whose values come from code. Mirrors tests/e2e/axes.json.
export const SOURCES = {
	appType: { file: "cli/src/utils/constants.ts", start: "export const VALID_RESOURCE_TYPES", end: "] as const", kind: "array" },
	language: { file: "cli/src/backend-languages/registry.ts", start: "export const BACKEND_LANGUAGES", end: "\n};", kind: "map" },
	httpFramework: { file: "cli/src/backend-frameworks/registry.ts", start: "export const BACKEND_FRAMEWORKS", end: "\n};", kind: "map" },
	frontendFramework: { file: "cli/src/frontend-frameworks/registry.ts", start: "export const FRONTEND_FRAMEWORKS", end: "\n};", kind: "map" },
	agentRuntime: { file: "cli/src/agent-runtimes/registry.ts", start: "export const AGENT_RUNTIMES", end: "\n};", kind: "map" },
	agentDurability: { file: "cli/src/agent-runtimes/registry.ts", start: "export const AGENT_DURABILITY_OPTIONS", end: "] as const", kind: "array" },
	infraService: { file: "cli/src/utils/constants.ts", start: "export const OPTIONAL_INFRA_SERVICES", end: "] as const", kind: "array" },
};

// Values of every source axis, sorted, keyed by axis name. An axis whose source is missing is an error, not an empty list.
export function registryAxes(root) {
	const out = {};
	for (const [axis, source] of Object.entries(SOURCES)) {
		const text = readFileSync(path.join(root, source.file), "utf8");
		const values = sourceValues(text, source);
		if (values === null) throw new Error(`${axis}: ${source.file} has no "${source.start}"`);
		out[axis] = [...values].sort();
	}
	return out;
}

function main(argv) {
	const root = path.resolve(argv[0] ?? path.join(here, "..", "..", ".."));
	console.log(JSON.stringify(registryAxes(root)));
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
