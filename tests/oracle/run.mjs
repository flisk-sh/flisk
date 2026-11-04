// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// ORACLE: scaffold generated projects from seeds and fail when two Flisk surfaces contradict each other about one.
//   node tests/oracle/run.mjs [--seed <n>] [--seeds <how many>] [--shape <shape>] [--count <n>] [--out <dir>] [--keep]
// A failing seed replays with `--seed <n> --shape <shape>`, which is printed with every failure. Failures are also written to
// <out>/oracle-failures.json (the shared bug-memory shape).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkScenario } from "./lib/invariants.mjs";
import { drawScenario } from "./lib/scenario.mjs";
import { collectSurfaces, makeProjectDir, scaffold } from "./lib/surfaces.mjs";

export function runSeed(seed, opts = {}) {
	const scenario = drawScenario(seed, opts);
	const dir = makeProjectDir(seed);
	try {
		scaffold(scenario, dir);
		return { scenario, failures: checkScenario(collectSurfaces(dir), scenario, { project: path.basename(path.dirname(dir)) }) };
	} finally {
		if (!opts.keep) rmSync(path.dirname(dir), { recursive: true, force: true });
	}
}

function main(argv) {
	const arg = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
	const first = Number(arg("--seed") ?? process.env.ORACLE_SEED ?? Math.floor(Math.random() * 2 ** 31));
	const seeds = Number(arg("--seeds") ?? 1);
	const out = arg("--out");
	const all = [];
	for (let i = 0; i < seeds; i++) {
		const seed = first + i;
		const { scenario, failures } = runSeed(seed, { shape: arg("--shape"), count: arg("--count") ? Number(arg("--count")) : undefined, keep: argv.includes("--keep") });
		console.log(`seed ${seed} shape ${scenario.shape} (${scenario.resources.length} resources): ${failures.length === 0 ? "surfaces agree" : `${failures.length} contradiction(s)`}`);
		for (const f of failures) console.log(`  ${f.invariant}\n    expected: ${f.expected}\n    actual:   ${f.actual}\n    replay:   ${f.reproduction}`);
		all.push(...failures);
	}
	if (out) { mkdirSync(out, { recursive: true }); writeFileSync(path.join(out, "oracle-failures.json"), `${JSON.stringify(all, null, 2)}\n`); }
	return all.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
