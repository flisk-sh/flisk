// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the schema-coverage scorer, on fixture repos with a small service schema, generators and tests.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isGenerator, isTest, measure, SCHEMA, schemaItems, words } from "./schema-coverage.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "schema-coverage-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), typeof body === "string" ? body : JSON.stringify(body));
	}
	return root;
}

test("a word is letters, digits and underscores with single inner hyphens", () => {
	const w = words('appType == "bring-your-own" and --port, featuresEnabled: ["api-client"] // healthCheckPath.');
	for (const word of ["appType", "bring-your-own", "port", "featuresEnabled", "api-client", "healthCheckPath"])
		assert.ok(w.has(word), word);
	for (const word of ["bring", "api", "--port", "client"]) assert.ok(!w.has(word), word);
});

test("generator code and tests are told apart by path", () => {
	for (const rel of [
		"runtime/engine/topologies/tilt/x.star",
		"runtime/discovery/scan.star",
		"cli/src/utils/service-manifest.ts",
	])
		assert.equal(isGenerator(rel), true, rel);
	for (const rel of [
		"runtime/engine/topologies/tilt/manifest/tests/test_parser.star",
		"runtime/ext/thing.star",
		"cli/src/utils/__tests__/service-manifest.test.ts",
		"cli/src/types/index.d.ts",
		"cli/src/components/App.tsx",
		"tests/tilt-engine/fixture.star",
	])
		assert.equal(isGenerator(rel), false, rel);
	for (const rel of [
		"tests/tilt-engine/test_x.py",
		"tests/fixtures/api/service.json",
		"cli/src/utils/__tests__/helpers.ts",
		"cli/src/generator/compose.test.ts",
		"runtime/engine/topologies/tilt/manifest/tests/test_parser.star",
		"runtime/engine/assets/docker/wake-gateway/decide.test.ts",
		"runtime/discovery/test_resource_snapshot.py",
	])
		assert.equal(isTest(rel), true, rel);
	for (const rel of ["tests/fuzz/README.md", "tests/requirements.txt", "tests/fuzz/bun.lock", "cli/src/utils/x.ts"])
		assert.equal(isTest(rel), false, rel);
});

test("the items are the top-level properties, the appType values and the features values, through $ref", () => {
	const schema = {
		properties: {
			$schema: { type: "string" },
			appName: { type: "string" },
			appType: { $ref: "#/$defs/appType" },
			featuresEnabled: { type: "array", items: { oneOf: [{ const: "nats" }, { enum: ["redis", 3] }] } },
			restart: { enum: ["no", "always"] },
		},
		$defs: { appType: { $ref: "#/definitions/kinds" } },
		definitions: { kinds: { enum: ["backend", "migrator", "backend"] } },
	};
	assert.deepEqual(schemaItems(schema), [
		{ kind: "property", name: "appName" },
		{ kind: "property", name: "appType" },
		{ kind: "property", name: "featuresEnabled" },
		{ kind: "property", name: "restart" },
		{ kind: "appType", name: "backend" },
		{ kind: "appType", name: "migrator" },
		{ kind: "featuresEnabled", name: "nats" },
		{ kind: "featuresEnabled", name: "redis" },
	]);
});

const SCHEMA_JSON = {
	properties: {
		$schema: { type: "string" },
		appName: { type: "string" },
		appType: { enum: ["backend", "migrator", "bring-your-own"] },
		healthPath: { type: "string" },
		featuresEnabled: { items: { enum: ["nats", "api-client"] } },
	},
};

test("an item is covered when a generator and a test both name it; findings say which side is missing", () => {
	const root = fixture({
		[SCHEMA]: SCHEMA_JSON,
		"runtime/engine/topologies/tilt/generate.star":
			'def gen(s):\n    if s.get("appType") == "backend" or s["appType"] == "bring-your-own":\n        name = s["appName"]\n',
		"runtime/discovery/scan.star": 'FEATURES = ["nats", "api-client"]  # featuresEnabled\n',
		"cli/src/utils/manifest.ts": 'export const kinds = ["migrator"];\n',
		// Test code of each kind.
		"tests/tilt-engine/test_generate.py": 'assert svc["appType"] == "backend"\nassert svc["appName"]\n',
		"tests/fixtures/api/service.json": '{ "appType": "bring-your-own", "featuresEnabled": ["nats"] }',
		"cli/src/utils/__tests__/manifest.test.ts": 'expect(read("healthPath")).toBe("/health");\n',
		"runtime/engine/topologies/tilt/manifest/tests/test_scan.star": 'assert "migrator"\n',
		// Neither generator code nor a test: a Tilt extension, docs, a lockfile, a type declaration.
		"runtime/ext/ide/panel.star": 'api-client = "x"\n',
		"tests/fuzz/README.md": "api-client healthPath\n",
		"tests/fuzz/bun.lock": "api-client\n",
		"cli/src/types/index.d.ts": "healthPath: string;\n",
		"docs/schema.md": "healthPath api-client\n",
	});
	try {
		const result = measure({ root });
		assert.deepEqual(result.findings, [
			'property "healthPath": no generator',
			'featuresEnabled "api-client": no test',
		]);
		// 4 properties ($schema is not one), 3 appType values, 2 features values: 7 of 9.
		assert.equal(result.value, 77.8);
		assert.equal(
			result.summary,
			"7 of 9 schema items read by a generator and named in a test (4 property, 3 appType, 2 featuresEnabled)",
		);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("an item named nowhere has both gaps, and a missing schema is no data", () => {
	const root = fixture({ [SCHEMA]: { properties: { smoke: {} } } });
	const empty = fixture({ "README.md": "" });
	try {
		assert.deepEqual(measure({ root }).findings, ['property "smoke": no generator, no test']);
		assert.equal(measure({ root }).value, 0);
		assert.equal(measure({ root: empty }).value, null);
	} finally {
		rmSync(root, { recursive: true });
		rmSync(empty, { recursive: true });
	}
});

test("this repository: the schema has appType and feature values and the result is stable", () => {
	const first = measure({ root: repoRoot });
	assert.ok(first.value > 0 && first.value <= 100);
	assert.match(first.summary, /\d+ appType, \d+ featuresEnabled\)$/);
	assert.deepEqual(measure({ root: repoRoot }), first);
});
