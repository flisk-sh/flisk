// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Offline unit tests for the published-schema comparison. No network access: the fetched copy is supplied as a fixture.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { checkPublishedSchema, compareSchemaProperties } from "./check-published-schema-drift.mjs";

// The 18 properties reported missing from https://flisk.sh/schema.service.json in #4202.
const MISSING_FROM_PUBLISHED = [
	"buildArgs",
	"command",
	"configs",
	"container",
	"dev",
	"env",
	"envFile",
	"extraPorts",
	"healthCheck",
	"logging",
	"models",
	"profiles",
	"providers",
	"provides",
	"sidecarOf",
	"toolchain",
	"volumes",
	"webUi",
];

function schemaWith(names, details = {}) {
	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		properties: Object.fromEntries(names.map((name) => [name, details[name] ?? { type: "string" }])),
	};
}

const SOURCE_FIXTURE = schemaWith(["name", ...MISSING_FROM_PUBLISHED]);
const STALE_PUBLISHED_FIXTURE = schemaWith(["name"]);

function withSourceFile(schema, run) {
	const dir = mkdtempSync(path.join(tmpdir(), "flisk-schema-drift-test-"));
	try {
		const sourcePath = path.join(dir, "service-schema.json");
		writeFileSync(sourcePath, JSON.stringify(schema), "utf8");
		return run(sourcePath);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test("matches when source and published have the same property names", () => {
	const published = schemaWith([...MISSING_FROM_PUBLISHED, "name"].reverse(), {
		name: { type: "integer", description: "Different details do not count as drift" },
	});
	const result = compareSchemaProperties(SOURCE_FIXTURE, published);
	assert.equal(result.inSync, true);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.extra, []);
	assert.equal(result.sourceCount, 19);
	assert.equal(result.publishedCount, 19);
});

test("reports every source property missing from the published fixture", () => {
	const result = compareSchemaProperties(SOURCE_FIXTURE, STALE_PUBLISHED_FIXTURE);
	assert.equal(result.inSync, false);
	assert.deepEqual(result.missing, [...MISSING_FROM_PUBLISHED].sort());
	assert.deepEqual(result.extra, []);
});

test("reports published properties that are no longer in the source, sorted", () => {
	const published = schemaWith(["name", "zeta", "alpha"]);
	const result = compareSchemaProperties(STALE_PUBLISHED_FIXTURE, published);
	assert.equal(result.inSync, false);
	assert.deepEqual(result.missing, []);
	assert.deepEqual(result.extra, ["alpha", "zeta"]);
});

test("reports both directions of drift at once", () => {
	const result = compareSchemaProperties(
		schemaWith(["dev", "name"]),
		schemaWith(["name", "legacy"]),
	);
	assert.deepEqual(result.missing, ["dev"]);
	assert.deepEqual(result.extra, ["legacy"]);
});

test("handles empty property sets without drift", () => {
	const result = compareSchemaProperties(schemaWith([]), schemaWith([]));
	assert.equal(result.inSync, true);
	assert.equal(result.sourceCount, 0);
	assert.equal(result.publishedCount, 0);
});

test("rejects schemas with missing or malformed properties", () => {
	assert.throws(() => compareSchemaProperties(null, STALE_PUBLISHED_FIXTURE), /source schema is not a JSON object/);
	assert.throws(() => compareSchemaProperties({ type: "object" }, STALE_PUBLISHED_FIXTURE), /source schema\.properties is not an object/);
	assert.throws(() => compareSchemaProperties(SOURCE_FIXTURE, { properties: [] }), /published schema\.properties is not an object/);
});

test("reads the local source and the fetched fixture without a network", async () => {
	await withSourceFile(SOURCE_FIXTURE, async (sourcePath) => {
		const calls = [];
		const result = await checkPublishedSchema({
			sourcePath,
			url: "https://example.invalid/schema.service.json",
			fetchSchema: async (url, options) => {
				calls.push({ url, options });
				return { ok: true, json: async () => STALE_PUBLISHED_FIXTURE };
			},
		});
		assert.deepEqual(result.missing, [...MISSING_FROM_PUBLISHED].sort());
		assert.equal(calls.length, 1);
		assert.equal(calls[0].url, "https://example.invalid/schema.service.json");
		assert.ok(calls[0].options.signal);
	});
});

test("turns a failed fetch into a diagnostic error", async () => {
	await withSourceFile(SOURCE_FIXTURE, async (sourcePath) => {
		await assert.rejects(
			checkPublishedSchema({
				sourcePath,
				fetchSchema: async () => ({ ok: false, status: 503, statusText: "Service Unavailable" }),
			}),
			/Could not read https:\/\/flisk\.sh\/schema\.service\.json: HTTP 503 Service Unavailable/,
		);
	});
});
