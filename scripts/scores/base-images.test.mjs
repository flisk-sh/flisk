// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the base-images scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { check, imageName, isStage, lineOf, measure, scanLine } from "./base-images.mjs";

const NOW = new Date("2026-11-14T00:00:00Z");
const DIGEST = `@sha256:${"a".repeat(64)}`;

function run(files, allowed = []) {
	const root = mkdtempSync(path.join(tmpdir(), "base-images-"));
	try {
		for (const [rel, body] of Object.entries(files)) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		return measure({ root, now: NOW }, allowed);
	} finally {
		rmSync(root, { recursive: true });
	}
}

const doc = (...rows) => `## Images\n\n${rows.map((r) => `| \`${r[0]}\` | \`${r[1]}\` |`).join("\n")}\n`;

test("scanLine reads FROM, image: and quoted image literals, and skips comments, SQL and imports", () => {
	assert.deepEqual(scanLine(`FROM --platform=linux/amd64 node:22-alpine${DIGEST} AS build`)[0], { repo: "node", tag: "22-alpine", digest: DIGEST, from: true });
	assert.equal(scanLine("    image: redis:7.4-alpine # cache")[0].tag, "7.4-alpine");
	assert.equal(scanLine('const base_image = x if y else "golang:1.27-bookworm"')[0].repo, "golang");
	assert.equal(scanLine('  "image": "mongo:8.0",')[0].tag, "8.0");
	assert.deepEqual(scanLine("# FROM node:12"), []);
	assert.deepEqual(scanLine('pool.query("SELECT * FROM items ORDER BY id")'), []);
	assert.deepEqual(scanLine('import fs from "node:fs"'), []);
});

test("imageName and lineOf normalise registries and tags", () => {
	assert.equal(imageName("docker.io/library/node"), "node");
	assert.equal(imageName("mcr.microsoft.com/dotnet/sdk"), "dotnet");
	assert.equal(lineOf("traefik", "v3.7.14"), "3.7");
	assert.equal(lineOf("debian", "bookworm-slim"), "bookworm");
	assert.equal(lineOf("unknown", "1"), null);
});

test("check flags no tag, :latest without a digest, EOL and unknown lines; passes :latest with a digest", () => {
	assert.equal(check({ repo: "alpine" }, "f:1", NOW).length, 1);
	assert.equal(check({ repo: "foo", tag: "latest" }, "f:1", NOW).length, 1);
	assert.deepEqual(check({ repo: "foo", tag: "latest", digest: DIGEST }, "f:1", NOW), []);
	assert.match(check({ repo: "nginx", tag: "1.27-alpine" }, "f:1", NOW)[0], /end of life on 2025-06-24/);
	assert.match(check({ repo: "node", tag: "20-alpine" }, "f:1", NOW)[0], /end of life/);
	assert.match(check({ repo: "golang", tag: "1.99" }, "f:1", NOW)[0], /not in EOL/);
	assert.deepEqual(check({ repo: "node", tag: "22-alpine" }, "f:1", NOW), []);
	assert.deepEqual(check({ repo: "foo", tag: "1.0" }, "f:1", NOW), []);
});

test("isStage tells a stage name from an image", () => {
	assert.equal(isStage({ repo: "base" }, new Set()), true);
	assert.equal(isStage({ repo: "l4_backend_runtime" }, new Set()), true);
	assert.equal(isStage({ repo: "alpine" }, new Set()), false);
	assert.equal(isStage({ repo: "alpine", tag: "3.22" }, new Set(["alpine"])), false);
});

test("measure passes a supported, listed image and ignores stage names", () => {
	const r = run({
		"runtime/a.star": 'x = "FROM node:22-alpine\\n"\n"FROM base"\n',
		"examples/e/Dockerfile": `FROM golang:1.27-alpine${DIGEST} AS base\nFROM base\n`,
		"docs/security.md": doc(["node", "22-alpine"]),
	});
	assert.deepEqual(r.findings, []);
	assert.equal(r.value, 0);
});

test("measure fails on an EOL tag, :latest, an unlisted image and a stale ALLOWED entry", () => {
	const r = run({
		"runtime/a.star": 'a = "FROM nginx:1.27-alpine"\nb = "FROM redis:latest"\nc = "FROM traefik:v3.7.14"\n',
		"docs/security.md": doc(["nginx", "1.27-alpine"], ["redis", "latest"]),
	}, [{ ref: "gone:1", reason: "x" }]);
	const text = r.findings.join("\n");
	assert.match(text, /nginx:1.27-alpine: nginx 1.27 reached end of life/);
	assert.match(text, /redis:latest has no digest/);
	assert.match(text, /traefik:v3.7.14 is not in the image inventory/);
	assert.match(text, /gone:1: ALLOWED entry no longer matches/);
});

test("an ALLOWED entry silences its image", () => {
	const r = run({ "examples/e/Dockerfile": "FROM node:18\n", "docs/security.md": "" }, [{ ref: "node:18", reason: "pinned on purpose" }]);
	assert.deepEqual(r.findings, []);
});
