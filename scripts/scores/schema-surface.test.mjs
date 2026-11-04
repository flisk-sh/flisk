// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the schema-surface scorer: it counts top-level service.json settings, and the ratchet fails on a new one.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SCHEMA } from "./schema-coverage.mjs";
import { measure, meta, settings } from "./schema-surface.mjs";

function fixture(schema) {
	const root = mkdtempSync(path.join(tmpdir(), "schema-surface-"));
	mkdirSync(path.dirname(path.join(root, SCHEMA)), { recursive: true });
	writeFileSync(path.join(root, SCHEMA), JSON.stringify(schema));
	return root;
}

test("counts top-level properties, not $schema and not nested ones", () => {
	const schema = { properties: { $schema: {}, appName: {}, port: {}, traefik: { properties: { host: {} } } } };
	assert.deepEqual(settings(schema), ["appName", "port", "traefik"]);
	assert.equal(measure({ root: fixture(schema) }).value, 3);
});

test("a missing schema has no value instead of a wrong count", () => {
	const root = mkdtempSync(path.join(tmpdir(), "schema-surface-empty-"));
	assert.equal(measure({ root }).value, null);
});

test("is a ratchet where lower is better, so one more setting is a regression", () => {
	assert.equal(meta.mode, "ratchet");
	assert.equal(meta.better, "lower");
	assert.equal(meta.tolerance, undefined);
});
