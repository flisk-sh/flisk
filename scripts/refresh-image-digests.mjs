#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Re-resolves every `name:tag@sha256:...` pin in the engine, the CLI, the release image and the examples to the digest
// the tag points at now, and rewrites the references in place. A pin that is never refreshed stops taking the base
// image's patches, so .github/workflows/refresh-image-digests.yml runs this weekly and opens a pull request.
// Usage: node scripts/refresh-image-digests.mjs [--dry-run]
// Needs `docker buildx` (the registry lookup is `docker buildx imagetools inspect`). Changing a golden layer line changes
// the golden Dockerfile hash, so the golden images are republished when the pull request merges.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { engineFiles, exampleFiles, scanLine } from "./scores/base-images.mjs";

// The digest of a manifest list (or single manifest) that `ref` (`name:tag`) points at today.
export function resolveDigest(ref, attempts = 4) {
	for (let i = 1; ; i++) {
		try {
			const out = execFileSync("docker", ["buildx", "imagetools", "inspect", ref, "--format", "{{json .Manifest}}"], {
				encoding: "utf8",
				timeout: 60_000,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const digest = JSON.parse(out).digest;
			if (!/^sha256:[0-9a-f]{64}$/.test(digest ?? "")) throw new Error(`${ref}: no digest in the registry answer`);
			return digest;
		} catch (err) {
			if (i >= attempts) throw new Error(`${ref}: ${String(err.stderr || err.message).trim().split("\n")[0]}`);
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000 * i); // a registry rate limit (429) clears in seconds
		}
	}
}

// Every distinct pin in the files: Map of `repo:tag` to the set of digests written for it.
export function pins(root, files) {
	const found = new Map();
	for (const rel of files) {
		for (const line of readFileSync(path.join(root, rel), "utf8").split("\n")) {
			for (const ref of scanLine(line)) {
				if (!ref.tag || !ref.digest) continue;
				const key = `${ref.repo}:${ref.tag}`;
				found.set(key, (found.get(key) ?? new Set()).add(ref.digest.slice(1)));
			}
		}
	}
	return found;
}

// Rewrites the files; returns the list of { ref, from, to } changes. `resolve` is injectable for tests.
export function refresh(root, { dryRun = false, resolve = resolveDigest, files } = {}) {
	const list = files ?? [...engineFiles(root), ...exampleFiles(root)];
	const changes = [];
	const target = new Map();
	for (const [ref, digests] of pins(root, list)) {
		const now = resolve(ref);
		target.set(ref, now);
		for (const old of digests) if (old !== now) changes.push({ ref, from: old, to: now });
	}
	if (!changes.length || dryRun) return changes;
	for (const rel of list) {
		const file = path.join(root, rel);
		let text = readFileSync(file, "utf8");
		const before = text;
		for (const [ref, now] of target) text = text.replace(new RegExp(`${escape(ref)}@sha256:[0-9a-f]{64}`, "g"), `${ref}@${now}`);
		if (text !== before) writeFileSync(file, text);
	}
	return changes;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const changes = refresh(root, { dryRun: process.argv.includes("--dry-run") });
	for (const c of changes) console.log(`${c.ref}: ${c.from.slice(0, 19)} -> ${c.to.slice(0, 19)}`);
	console.log(changes.length ? `${changes.length} digest(s) ${process.argv.includes("--dry-run") ? "would change" : "refreshed"}` : "all digests current");
}
