// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ENV_FILE, measure, scan } from "./tracked-secrets.mjs";

// Built at runtime so this file holds no credential-shaped literal of its own.
const fakeGithub = `ghp_${"a".repeat(36)}`;
const fakeKey = `-----BEGIN ${"RSA "}PRIVATE KEY-----`;

test("ENV_FILE matches real environment files, not the documented copies", () => {
	for (const rel of [".env", "examples/shop/.env.local", "cli/.env.production"]) assert.equal(ENV_FILE.test(rel), true, rel);
	for (const rel of [".env.example", "examples/.env.sample", "a/.env.template", "docs/env.md", "a/.envrc"])
		assert.equal(ENV_FILE.test(rel), false, rel);
});

test("scan finds provider tokens and private keys, and an .npmrc token that is not an env reference", () => {
	assert.deepEqual(scan("a.ts", `const t = "${fakeGithub}";\n${fakeKey}\n`), [
		{ line: 1, what: "GitHub token" },
		{ line: 2, what: "private key" },
	]);
	assert.deepEqual(scan(".npmrc", "//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n"), []);
	assert.equal(scan(".npmrc", "//registry.npmjs.org/:_authToken=abcdef123456\n").length, 1);
	assert.deepEqual(scan("a.ts", 'const placeholder = "ghp_xxx";\n'), []);
});

test("measure reports .env files and credentials outside git, honours ALLOWED, flags a stale entry", () => {
	const root = mkdtempSync(path.join(tmpdir(), "tracked-secrets-"));
	try {
		mkdirSync(path.join(root, "app"), { recursive: true });
		writeFileSync(path.join(root, "app/.env"), "X=1\n");
		writeFileSync(path.join(root, "app/.env.example"), "X=\n");
		writeFileSync(path.join(root, "app/key.pem"), `${fakeKey}\n`);
		assert.equal(measure({ root }, []).value, 2);
		const { findings } = measure({ root }, [
			{ file: "app/key.pem", reason: "fixture" },
			{ file: "gone.pem", reason: "old" },
		]);
		assert.deepEqual(findings, [
			"app/.env: environment file is tracked; keep it out of git and commit a .env.example",
			"gone.pem: ALLOWED entry no longer matches anything; remove it",
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
