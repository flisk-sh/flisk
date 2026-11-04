// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of service.json settings that both the generators read and a test exercises. The items come from
// runtime/engine/schemas/service-schema.json: its top-level properties (not `$schema`, the editor's pointer to the
// schema), the values of the appType enum and the values of the features enum (featuresEnabled), with $ref followed
// into $defs or definitions. A setting the schema accepts but no generator reads is silently ignored; one no test
// names can break without a red build.
//
// Matching rule: an item is covered when its name appears as a whole word both in generator code
// (runtime/engine/**/*.star, runtime/discovery/**/*.star, non-test cli/src/**/*.ts) and in a test (tests/**, minus its
// docs and lockfiles; cli/src/**/__tests__/**; runtime/**/tests/**; *.test.* and test_*.py files under cli/src and
// runtime). A word is letters, digits and underscores with single inner hyphens, so `bring-your-own` is one word,
// `api-client` does not match `api`, `--port` matches `port`, and a quoted string and an identifier count the same.
// Limits: this is a text search, not data flow. A common word (env, port, type, image, command, vite) always matches
// somewhere, whatever reads it; a comment counts as much as code; and a setting the code reads under another spelling
// (health_check_path for healthCheckPath) is not seen.
import { isTestFile, read, round1, walk } from "./lib.mjs";

export const meta = {
	id: "schema-coverage",
	title: "service.json settings read by a generator and named in a test",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

export const SCHEMA = "runtime/engine/schemas/service-schema.json";

const WORD = /[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/g;

// The words of a text, as the matching rule above defines them.
export const words = (text) => new Set(String(text).match(WORD) ?? []);

// Test code: tests/** (not its README, requirements or lockfiles), and under cli/src and runtime the __tests__ and
// tests folders and *.test.* and pytest's test_*.py / *_test.py files.
export function isTest(rel) {
	if (rel.startsWith("tests/")) return !/\.(md|txt|lock)$/.test(rel);
	return isTestFile(rel) || /^runtime\/(.+\/)?tests\//.test(rel) || /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(rel);
}

export const isGenerator = (rel) =>
	!isTest(rel) &&
	(/^runtime\/(engine|discovery)\/.+\.star$/.test(rel) || (/^cli\/src\/.+\.ts$/.test(rel) && !rel.endsWith(".d.ts")));

// The schema node behind a local $ref ("#/$defs/appType"), followed until it is not a reference.
function resolve(schema, node, seen = new Set()) {
	const ref = node?.$ref;
	if (typeof ref !== "string" || !ref.startsWith("#/") || seen.has(ref)) return node;
	seen.add(ref);
	const target = ref
		.slice(2)
		.split("/")
		.reduce((o, key) => o?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], schema);
	return resolve(schema, target, seen);
}

// The allowed values of a schema node: its enum or const, those of the array items it holds, or of its oneOf/anyOf.
function enumValues(schema, node) {
	const n = resolve(schema, node);
	if (!n || typeof n !== "object") return [];
	if (Array.isArray(n.enum)) return n.enum.filter((v) => typeof v === "string");
	if (typeof n.const === "string") return [n.const];
	if (n.items) return enumValues(schema, n.items);
	return [...(n.oneOf ?? []), ...(n.anyOf ?? [])].flatMap((sub) => enumValues(schema, sub));
}

// The items to cover: { kind: "property", name } for each top-level property, and { kind: <property>, name } for each
// value of appType and of a features property (featuresEnabled, features).
export function schemaItems(schema) {
	const props = schema?.properties ?? {};
	const items = Object.keys(props)
		.filter((name) => !name.startsWith("$"))
		.map((name) => ({ kind: "property", name }));
	for (const prop of Object.keys(props).filter((p) => p === "appType" || /^features/i.test(p)))
		for (const value of [...new Set(enumValues(schema, props[prop]))]) items.push({ kind: prop, name: value });
	return items;
}

export function measure({ root }) {
	const text = read(root, SCHEMA);
	if (!text) return { value: null, summary: `${SCHEMA} not found`, findings: [] };
	const items = schemaItems(JSON.parse(text));
	if (!items.length) return { value: null, summary: `${SCHEMA} has no properties`, findings: [] };
	const corpus = (keep) => {
		const all = new Set();
		for (const rel of [...walk(root, "runtime", keep), ...walk(root, "cli/src", keep), ...walk(root, "tests", keep)])
			for (const w of words(read(root, rel))) all.add(w);
		return all;
	};
	const generated = corpus(isGenerator);
	const tested = corpus(isTest);
	const findings = [];
	let covered = 0;
	for (const { kind, name } of items) {
		const gaps = [!generated.has(name) && "no generator", !tested.has(name) && "no test"].filter(Boolean);
		if (gaps.length) findings.push(`${kind} "${name}": ${gaps.join(", ")}`);
		else covered++;
	}
	const kinds = [...new Set(items.map((i) => i.kind))].map((k) => `${items.filter((i) => i.kind === k).length} ${k}`);
	return {
		value: round1((covered / items.length) * 100),
		summary: `${covered} of ${items.length} schema items read by a generator and named in a test (${kinds.join(", ")})`,
		findings,
	};
}
