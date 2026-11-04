// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many top-level settings service.json has (runtime/engine/schemas/service-schema.json, not `$schema`). Every setting
// is public contract: editors validate it, people write it by hand, and removing one later breaks their files. A ratchet
// where lower is better, so a pull request that adds a setting fails `make test-shell` until it raises the number in
// baseline.json on purpose, where a reviewer sees it. Before adding one, prefer changing what an existing setting means
// for one appType (bring-your-own `port` is the container's own port) or relaxing a rule that forces a workaround.
import { read } from "./lib.mjs";
import { SCHEMA } from "./schema-coverage.mjs";

export const meta = {
	id: "schema-surface",
	title: "service.json top-level settings (new ones need a baseline bump)",
	source: "files",
	mode: "ratchet",
	better: "lower",
	unit: "settings",
};

export function settings(schema) {
	return Object.keys(schema?.properties ?? {})
		.filter((name) => name !== "$schema")
		.sort();
}

export function measure({ root }) {
	const text = read(root, SCHEMA);
	if (!text) return { value: null, summary: `${SCHEMA} not found`, findings: [] };
	const names = settings(JSON.parse(text));
	return {
		value: names.length,
		summary: `${names.length} top-level settings in ${SCHEMA}`,
		findings: [],
	};
}
