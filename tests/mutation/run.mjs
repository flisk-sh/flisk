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

// Each engine reports whether it noticed: true = the bug was caught.
export const detectors = {
	// The exporter's own tests are its unit tests; the CLI-side mutants run the matching vitest files in cli/.
	unit: (m, o) => (m.repo === "export" ? run("npx", ["vitest", "run"], o.exportRepo) : run("npx", ["vitest", "run", ...m.unit.map((n) => `src/utils/__tests__/${n}.test.ts`)], path.join(ROOT, "cli"))).status !== 0,
	falsifier: (m, o) => run("node", ["tests/falsifier/run.mjs", "--property", m.falsifier, "--scenarios", String(o.falsifierScenarios), "--seed", "1"], ROOT, exportEnv(m, o)).status !== 0,
	oracle: (m, o) => run("node", ["tests/oracle/run.mjs", "--seed", "1", "--seeds", String(o.oracleSeeds)], ROOT, exportEnv(m, o)).status !== 0,
};

export function main(argv) {
	const arg = (f) => { const i = argv.indexOf(f); return i === -1 ? undefined : argv[i + 1]; };
	const opts = { falsifierScenarios: Number(arg("--falsifier-scenarios") ?? 25), oracleSeeds: Number(arg("--oracle-seeds") ?? 3), exportRepo: arg("--export-repo") ? path.resolve(arg("--export-repo")) : undefined };
	const skip = new Set((arg("--skip") ?? "").split(",").filter(Boolean));
	const engines = Object.keys(detectors).filter((e) => !skip.has(e));
	// Exporter mutants need a clone of flisk-sh/flisk-export with its dependencies installed (npm install there).
	const mutants = MUTANTS.filter((m) => (!arg("--mutant") || m.id === arg("--mutant")) && (m.repo !== "export" || opts.exportRepo));
	if (mutants.length === 0) throw new Error(`unknown mutant "${arg("--mutant")}"; expected one of ${MUTANTS.map((m) => m.id).join(", ")}`);
	const saved = new Map();
	const restore = () => { for (const [file, text] of saved) writeFileSync(file, text); saved.clear(); };
	process.on("SIGINT", () => { restore(); process.exit(130); });
	const rows = [];
	try {
		for (const m of mutants) {
			const t0 = Date.now();
			for (const file of paths(m, opts.exportRepo)) { const text = readFileSync(file, "utf8"); saved.set(file, text); writeFileSync(file, mutate(text, m)); }
			if (m.repo === "export") run("npm", ["run", "build"], opts.exportRepo);
			const caught = {};
			for (const e of engines) caught[e] = detectors[e](m, opts);
			restore();
			if (m.repo === "export") run("npm", ["run", "build"], opts.exportRepo);
			rows.push({ id: m.id, bug: m.bug, caught, seconds: Math.round((Date.now() - t0) / 1000) });
			console.log(`${m.id.padEnd(26)} ${engines.map((e) => `${e}:${caught[e] ? "CAUGHT" : "missed"}`).join("  ")}  (${rows.at(-1).seconds}s)`);
		}
	} finally { restore(); }
	const total = (e) => `${rows.filter((r) => r.caught[e]).length}/${rows.length}`;
	console.log(`\ncaught: ${engines.map((e) => `${e} ${total(e)}`).join(", ")}`);
	const none = rows.filter((r) => engines.every((e) => !r.caught[e]));
	if (none.length) console.log(`caught by nothing: ${none.map((r) => r.id).join(", ")}`);
	if (arg("--out")) writeFileSync(arg("--out"), `${JSON.stringify(rows, null, 2)}\n`);
	return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
