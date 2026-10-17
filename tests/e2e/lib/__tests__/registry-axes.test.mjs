// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for tests/e2e/lib/registry-axes.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { registryAxes } from "../registry-axes.mjs";

const repo = path.resolve(import.meta.dirname, "..", "..", "..", "..");

test("the repository's registries declare the languages, frameworks and resource types the matrix needs", () => {
	const axes = registryAxes(repo);
	for (const language of ["bun", "python", "go", "rust"]) assert.ok(axes.language.includes(language), language);
	for (const framework of ["hono", "express", "nestjs"]) assert.ok(axes.httpFramework.includes(framework), framework);
	for (const frontend of ["react", "vue", "tanstack-router"]) assert.ok(axes.frontendFramework.includes(frontend), frontend);
	for (const type of ["backend", "worker", "migrator", "agent"]) assert.ok(axes.appType.includes(type), type);
	assert.deepEqual(axes.agentDurability, ["files", "postgres"]);
});

test("every axis value list is sorted and has no duplicates", () => {
	for (const [axis, values] of Object.entries(registryAxes(repo))) {
		assert.deepEqual(values, [...new Set(values)].sort(), axis);
	}
});

test("a repository without a registry is an error, not an empty axis", () => {
	const dir = mkdtempSync(path.join(tmpdir(), "registry-axes-"));
	try {
		assert.throws(() => registryAxes(dir), /has no|ENOENT/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
