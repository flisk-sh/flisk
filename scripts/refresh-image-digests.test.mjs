// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pins, refresh } from "./refresh-image-digests.mjs";

const OLD = `sha256:${"a".repeat(64)}`;
const NEW = `sha256:${"b".repeat(64)}`;

function tree(files, fn) {
	const root = mkdtempSync(path.join(tmpdir(), "refresh-digests-"));
	try {
		for (const [rel, body] of Object.entries(files)) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		return fn(root);
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("pins collects only tag plus digest references", () => {
	tree({ "a/Dockerfile": `FROM node:22-alpine@${OLD} AS b\nFROM alpine:3.22\n` }, (root) => {
		assert.deepEqual([...pins(root, ["a/Dockerfile"]).keys()], ["node:22-alpine"]);
	});
});

test("refresh rewrites every file that holds a moved pin and reports the change", () => {
	const files = { "a/Dockerfile": `FROM node:22-alpine@${OLD}\n`, "b/x.star": `x = "FROM node:22-alpine@${OLD}"\nFROM alpine:3.22\n` };
	tree(files, (root) => {
		const calls = [];
		const changes = refresh(root, { files: Object.keys(files), resolve: (ref) => (calls.push(ref), NEW) });
		assert.deepEqual(calls, ["node:22-alpine"]);
		assert.deepEqual(changes, [{ ref: "node:22-alpine", from: OLD.slice(0), to: NEW }].map((c) => ({ ...c, from: `sha256:${"a".repeat(64)}` })));
		assert.match(readFileSync(path.join(root, "a/Dockerfile"), "utf8"), new RegExp(NEW));
		assert.match(readFileSync(path.join(root, "b/x.star"), "utf8"), new RegExp(`node:22-alpine@${NEW}"\\nFROM alpine:3.22`));
	});
});

test("refresh changes nothing when the digest is current, or on a dry run", () => {
	const files = { "a/Dockerfile": `FROM node:22-alpine@${OLD}\n` };
	tree(files, (root) => {
		assert.deepEqual(refresh(root, { files: Object.keys(files), resolve: () => OLD }), []);
		assert.equal(refresh(root, { files: Object.keys(files), resolve: () => NEW, dryRun: true }).length, 1);
		assert.match(readFileSync(path.join(root, "a/Dockerfile"), "utf8"), new RegExp(OLD));
	});
});
