#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Fails when a pinned `node-version:` under .github/ is behind the newest patch release of its line on nodejs.org.
// A pin never takes a Node security fix by itself, so this runs on a schedule (.github/workflows/node-pins.yml).
// The one pin allowed to lag is the `engines.node` floor in cli/package.json, which tests the oldest Node we support.
//   node scripts/check-node-pins.mjs [--root <repo dir>]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INDEX_URL = "https://nodejs.org/dist/index.json";

const parse = (v) => v.replace(/^v/, "").split(".").map(Number);
export const isExact = (v) => /^\d+\.\d+\.\d+$/.test(v);

export function compare(a, b) {
	const [x, y] = [parse(a), parse(b)];
	for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

// Every exact `node-version:` pin, as { file, line, version }. Floating pins ("22", "lts/*", matrix expressions) are skipped.
export function findPins(files) {
	const pins = [];
	for (const { file, text } of files) {
		text.split("\n").forEach((line, i) => {
			const m = line.match(/^\s*(?:-\s*)?node-version:\s*["']?([^\s"'#]+)/);
			if (m && isExact(m[1])) pins.push({ file, line: i + 1, version: m[1] });
		});
	}
	return pins;
}

// The newest release of each major in the nodejs.org index (it is newest first, but do not rely on that).
export function latestByMajor(index) {
	const latest = new Map();
	for (const { version } of index) {
		const v = version.replace(/^v/, "");
		const major = Number(v.split(".")[0]);
		if (!latest.has(major) || compare(v, latest.get(major)) > 0) latest.set(major, v);
	}
	return latest;
}

export function floorOf(enginesNode) {
	const m = /^>=\s*(\d+\.\d+\.\d+)$/.exec(enginesNode ?? "");
	return m ? m[1] : null;
}

// One message per pin that is behind its line's newest release; the engines floor and lines absent from the index are exempt.
export function stalePins(pins, latest, floor) {
	return pins.flatMap(({ file, line, version }) => {
		if (version === floor) return [];
		const newest = latest.get(Number(version.split(".")[0]));
		if (!newest || compare(version, newest) >= 0) return [];
		return [`${file}:${line}: node-version ${version} is behind ${newest}, the newest release of Node ${version.split(".")[0]}`];
	});
}

function main() {
	const args = process.argv.slice(2);
	const root = args.includes("--root") ? args[args.indexOf("--root") + 1] : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const files = [];
	for (const dir of [".github/workflows", ".github/actions"]) {
		const abs = path.join(root, dir);
		const walk = (d) =>
			readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ya?ml$/.test(e.name) ? [path.join(d, e.name)] : []));
		for (const f of walk(abs)) files.push({ file: path.relative(root, f), text: readFileSync(f, "utf8") });
	}
	const floor = floorOf(JSON.parse(readFileSync(path.join(root, "cli/package.json"), "utf8")).engines?.node);
	return fetch(INDEX_URL).then(async (res) => {
		if (!res.ok) throw new Error(`${INDEX_URL}: HTTP ${res.status}`);
		const problems = stalePins(findPins(files), latestByMajor(await res.json()), floor);
		for (const p of problems) console.log(p);
		if (problems.length) {
			console.log(`\n${problems.length} stale Node pin(s). Move them as docs/releasing.md describes, and the matching EXPECTED entries in scripts/scores/action-consistency.mjs.`);
			process.exit(1);
		}
		console.log("Every Node pin is on the newest release of its line.");
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		console.error(e.message);
		process.exit(2);
	});
}
