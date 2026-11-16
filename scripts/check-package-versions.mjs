#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Fails when package.json or cli/package.json carries a version that is not a plain x.y.z, or when the two differ.
// Release 1.4.66 (#4320) wrote the string "undefined" into both, `flisk import` then refused to run
// ("installed Flisk core (undefined) is older than the required 1.3.104"), and every nightly adopter went red.
//   node scripts/check-package-versions.mjs [--root <repo dir>]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILES = ["package.json", "cli/package.json"];
export const isSemver = (v) => typeof v === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v);

// Problems for a list of { file, version }; empty when every version is valid and they all agree.
export function problems(entries) {
	const out = [];
	for (const { file, version } of entries) {
		if (!isSemver(version)) out.push(`${file}: version is ${JSON.stringify(version)}, expected x.y.z`);
	}
	const valid = entries.filter((e) => isSemver(e.version));
	if (valid.length > 1 && new Set(valid.map((e) => e.version)).size > 1) {
		out.push(`versions differ: ${valid.map((e) => `${e.file}=${e.version}`).join(", ")}`);
	}
	return out;
}

export function readEntries(root) {
	return FILES.map((file) => ({ file, version: JSON.parse(readFileSync(path.join(root, file), "utf8")).version }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const i = process.argv.indexOf("--root");
	const root = i > 0 ? process.argv[i + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const found = problems(readEntries(root));
	if (found.length) {
		for (const p of found) console.error(`check-package-versions: ${p}`);
		process.exit(1);
	}
	console.log("check-package-versions: ok");
}
