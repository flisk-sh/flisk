// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// cli/pnpm-lock.yaml names the same dependency ranges as cli/package.json. MEMORY.md, 2026-10-20: the pnpm lockfile had
// drifted by 8 specifiers and `pnpm install --frozen-lockfile` failed in cli/, while bun.lock (what CI installs from)
// was fine, so nothing noticed. Compared: every dependencies, devDependencies, optionalDependencies and
// peerDependencies entry of cli/package.json against the `specifier:` the lockfile records for the root importer, both
// ways (a range changed, a dependency added, or one removed but still locked). Fix a finding with
// `pnpm install --lockfile-only` in cli/. Skipped when cli/ has no pnpm lockfile. A gate at zero.
import YAML from "yaml";
import { has, read } from "./lib.mjs";

export const meta = {
	id: "lockfile-drift",
	title: "cli/package.json ranges that cli/pnpm-lock.yaml does not match",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "specifiers",
};

const SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

// name -> range, from package.json.
export function declared(pkg) {
	return new Map(SECTIONS.flatMap((s) => Object.entries(pkg?.[s] ?? {})));
}

// name -> specifier, from a pnpm lockfile's root importer (lockfile v6+ `importers['.']`, or the older top level).
export function locked(lock) {
	const root = lock?.importers?.["."] ?? lock ?? {};
	return new Map(
		SECTIONS.flatMap((s) =>
			Object.entries(root[s] ?? {}).map(([name, entry]) => [
				name,
				typeof entry === "object" ? entry.specifier : root.specifiers?.[name],
			]),
		),
	);
}

export function drift(pkg, lock) {
	const want = declared(pkg);
	const got = locked(lock);
	const out = [];
	for (const [name, range] of want) {
		if (!got.has(name)) out.push(`${name}@${range} is in package.json but not in the lockfile`);
		else if (got.get(name) !== range)
			out.push(`${name} is ${range} in package.json but ${got.get(name)} in the lockfile`);
	}
	for (const name of got.keys()) if (!want.has(name)) out.push(`${name} is locked but no longer in package.json`);
	return out;
}

export function measure({ root }) {
	if (!has(root, "cli/pnpm-lock.yaml")) return { value: null, summary: "no cli/pnpm-lock.yaml", findings: [] };
	let pkg;
	let lock;
	try {
		pkg = JSON.parse(read(root, "cli/package.json"));
		lock = YAML.parse(read(root, "cli/pnpm-lock.yaml"));
	} catch (error) {
		return {
			value: 1,
			summary: "cli/package.json or cli/pnpm-lock.yaml does not parse",
			findings: [`cli/pnpm-lock.yaml:1 ${error.message}`],
		};
	}
	const findings = drift(pkg, lock).map((f) => `cli/pnpm-lock.yaml: ${f} (run pnpm install --lockfile-only in cli/)`);
	return {
		value: findings.length,
		summary: `${declared(pkg).size} declared dependencies, ${findings.length} the pnpm lockfile does not match`,
		findings,
	};
}
