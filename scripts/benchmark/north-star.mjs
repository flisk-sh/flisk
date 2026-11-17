#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The north star measurement GEL gates on (`gel north-star --measure`).
 * Metric: warm start of a backend with Postgres, Flisk process mode vs plain Docker Compose,
 * command launch to every URL answering 200 (median seconds). Prints one JSON line:
 *   {"value": <flisk s>, "baseline": <compose s>, "unit": "s", "runs": N}
 * Needs Docker and a built CLI (npm --prefix cli run build).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runs = process.env.NORTH_STAR_RUNS ?? "5";
const r = spawnSync(process.execPath, [join(here, "compose-comparison.mjs"), "--json", "--stacks", "backend-postgres", "--runs", runs], { encoding: "utf8", maxBuffer: 1 << 26 });
if (r.status !== 0) {
	console.error(r.stderr || r.stdout);
	process.exit(1);
}
const data = JSON.parse(r.stdout);
const row = data.results.find((x) => x.stack === "backend-postgres" || /Postgres/i.test(x.name ?? ""));
const value = row?.fliskWarm?.median;
const baseline = row?.composeWarm?.median;
if (!(value > 0) || !(baseline > 0)) {
	console.error("no warm medians in the comparison output");
	process.exit(1);
}
console.log(JSON.stringify({ value, baseline, unit: "s", runs: Number(runs) }));
