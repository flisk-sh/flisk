// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Yield check: injects each known bug (mutants.mjs) into the CLI and records which engine notices. A bug nobody notices is a gap in
// the tests; a bug only the engines notice is what they add over the unit tests.
//   node tests/mutation/run.mjs [--mutant <id>] [--export-repo <clone of flisk-sh/flisk-export>] [--falsifier-scenarios 25] [--oracle-seeds 3] [--skip oracle,unit] [--out <file>]
// It edits cli/src and cli/dist in place and restores them (also on Ctrl-C), so run it in a worktree you are not editing.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MUTANTS, mutate } from "./mutants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// The files a mutant edits: the CLI's source and dist, or the exporter clone's source.
const paths = (m, exportRepo) => (m.repo === "export" ? [path.join(exportRepo, m.file)] : [path.join(ROOT, "cli/src", `${m.file}.ts`), path.join(ROOT, "cli/dist", `${m.file}.js`)]);

const run = (cmd, args, cwd = ROOT, env = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, FLISK_QUIET_DEPRECATIONS: "1", NO_COLOR: "1", CI: "1", ...env } });

// Points flisk at the local exporter clone for an exporter mutant.
const exportEnv = (m, o) => (m.repo === "export" ? { FLISK_EXPORT_PACKAGE: o.exportRepo } : {});

// An engine exits 0 when it finds nothing and 1 when it finds something, and prints a marker when it does. An uncaught exception also
// exits 1, so exit 1 without the marker is a crash, not a catch; any other status (or none: the process did not start or was killed)
// is an infrastructure error too. Neither may be counted as a catch.
export function classify(result, what, marker) {
	if (result.status === 0) return false;
	if (result.status === 1 && (!marker || marker.test(String(result.stdout)))) return true;
	const how = result.status === 1 ? "crashed (exit 1 without a finding)" : `did not run properly (exit ${result.status ?? result.signal ?? "none"})`;
	throw new Error(`${what} ${how}: ${String(result.stderr || result.stdout || result.error?.message || "").trim().slice(0, 300)}`);
}
// A build that cannot start has no status; any non-zero status is a failure.
export const buildFailed = (result) => result.status !== 0;
export const ENGINES = ["unit", "falsifier", "oracle"];

// Each engine reports whether it noticed: true = the bug was caught.
export const detectors = {
	// The exporter's own tests are its unit tests; the CLI-side mutants run the matching vitest files in cli/.
	unit: (m, o) => classify(m.repo === "export" ? run("npx", ["vitest", "run"], o.exportRepo) : run("npx", ["vitest", "run", ...m.unit.map((n) => `src/utils/__tests__/${n}.test.ts`)], path.join(ROOT, "cli")), "the unit tests", /failed/),
	falsifier: (m, o) => classify(run("node", ["tests/falsifier/run.mjs", "--property", m.falsifier, "--scenarios", String(o.falsifierScenarios), "--seed", "1"], ROOT, exportEnv(m, o)), "FALSIFIER", /FALSIFIED /),
	oracle: (m, o) => classify(run("node", ["tests/oracle/run.mjs", "--seed", "1", "--seeds", String(o.oracleSeeds)], ROOT, exportEnv(m, o)), "ORACLE", /contradiction\(s\)/),
};

// What makes two detector runs the same command, so a baseline covers every mutant that shares it.
export const detectorKey = (e, m) => `${e}|${m.repo ?? "cli"}|${e === "unit" ? (m.unit ?? []).join(",") : e === "falsifier" ? m.falsifier : ""}`;

export function main(argv) {
	const arg = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
	const opts = { falsifierScenarios: Number(arg("--falsifier-scenarios") ?? 25), oracleSeeds: Number(arg("--oracle-seeds") ?? 3), exportRepo: arg("--export-repo") ? path.resolve(arg("--export-repo")) : undefined };
	const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
	const unknownSkip = [...skip].filter((e) => !ENGINES.includes(e));
	if (unknownSkip.length) throw new Error(`unknown engine in --skip: ${unknownSkip.join(", ")}; expected ${ENGINES.join(", ")}`);
	const engines = ENGINES.filter((e) => !skip.has(e));
	const selected = MUTANTS.filter((m) => !arg("--mutant") || m.id === arg("--mutant"));
	if (selected.length === 0) throw new Error(`unknown mutant "${arg("--mutant")}"; expected one of ${MUTANTS.map((m) => m.id).join(", ")}`);
	// Exporter mutants need a clone of flisk-sh/flisk-export with its dependencies installed (npm install there).
	if (arg("--mutant") && selected[0].repo === "export" && !opts.exportRepo) throw new Error(`${selected[0].id} edits the Compose exporter: pass --export-repo <clone of flisk-sh/flisk-export>`);
	const mutants = selected.filter((m) => m.repo !== "export" || opts.exportRepo);
	const saved = new Map();
	let rebuildNeeded = false;
	const rebuild = () => { if (buildFailed(run("npm", ["run", "build"], opts.exportRepo))) rebuildNeeded = true; };
	const restore = () => { for (const [file, text] of saved) writeFileSync(file, text); saved.clear(); };
	// Whatever ends the process, the injected bug must not stay in the files (a signal handler's exit also runs the "exit" handler).
	process.on("exit", restore);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
	const rows = [];
	try {
		// Before any bug goes in, every distinct detector command must find nothing in the unmutated tree; otherwise a failing engine
		// would count as a catch.
		const baselined = new Set();
		for (const m of mutants) for (const e of engines) {
			const key = detectorKey(e, m);
			if (baselined.has(key)) continue;
			baselined.add(key);
			if (detectors[e](m, opts)) throw new Error(`baseline: ${e} already reports a problem on the unmutated tree (${key}); fix that first`);
		}
		for (const m of mutants) {
			const t0 = Date.now();
			for (const file of paths(m, opts.exportRepo)) { const text = readFileSync(file, "utf8"); saved.set(file, text); writeFileSync(file, mutate(text, m)); }
			if (m.repo === "export") rebuild();
			const caught = {};
			for (const e of engines) caught[e] = detectors[e](m, opts);
			restore();
			if (m.repo === "export") rebuild();
			rows.push({ id: m.id, bug: m.bug, caught, seconds: Math.round((Date.now() - t0) / 1000) });
			console.log(`${m.id.padEnd(26)} ${engines.map((e) => `${e}:${caught[e] ? "CAUGHT" : "missed"}`).join("  ")}  (${rows.at(-1).seconds}s)`);
		}
	} finally { restore(); }
	const total = (e) => `${rows.filter((r) => r.caught[e]).length}/${rows.length}`;
	console.log(`\ncaught: ${engines.map((e) => `${e} ${total(e)}`).join(", ")}`);
	const none = rows.filter((r) => engines.every((e) => !r.caught[e]));
	if (none.length) console.log(`caught by nothing: ${none.map((r) => r.id).join(", ")}`);
	if (arg("--out")) writeFileSync(arg("--out"), `${JSON.stringify(rows, null, 2)}\n`);
	if (rebuildNeeded) { console.error(`the exporter clone's source is restored but its build failed: run "npm run build" in ${opts.exportRepo} before using it`); return 1; }
	return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
