// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Seconds a warm `flisk up` takes until every expected container is healthy, from the newest committed warm-start
// benchmark: the docs/benchmarks/results/*warm-start-<date> folder with the latest date in its name that has a
// summary.json (written by scripts/benchmark/summarize-flisk-up.mjs). The value is the median wall time of its warm
// runs that settled; a run that timed out or could not be set up is not a warm-start time (see
// scripts/benchmark/README.md), so it is a finding instead. The benchmark runs by hand on one machine, so the summary
// names the project, the machine, the flisk version and the date: an old number stays visible as old instead of passing
// for today's.
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { has, median, read, round1 } from "./lib.mjs";

export const meta = {
	id: "warm-start-time",
	title: "Warm flisk up to healthy (newest committed benchmark)",
	source: "files",
	mode: "report",
	better: "lower",
	unit: "s",
};

export const RESULTS = "docs/benchmarks/results";
const FOLDER = /warm-start-.*?(\d{4}-\d{2}-\d{2})/;

// The benchmark folders, newest date first (the name breaks a tie, last first): { dir, date, hasSummary }.
export function benchmarks(root) {
	if (!has(root, RESULTS)) return [];
	const abs = path.join(root, RESULTS);
	return readdirSync(abs)
		.filter((name) => statSync(path.join(abs, name)).isDirectory())
		.map((name) => ({ name, date: FOLDER.exec(name)?.[1] }))
		.filter(({ date }) => date)
		.map(({ name, date }) => ({
			dir: `${RESULTS}/${name}`,
			date,
			hasSummary: has(root, `${RESULTS}/${name}/summary.json`),
		}))
		.sort((a, b) => b.date.localeCompare(a.date) || b.dir.localeCompare(a.dir));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function measure({ root, now }) {
	const all = benchmarks(root);
	const newest = all.find((b) => b.hasSummary);
	if (!newest)
		return { value: null, summary: `no warm-start benchmark with a summary.json in ${RESULTS}`, findings: [] };
	// A newer folder without summary.json (a hand measurement, a run not summarised yet) is not used, and said so.
	const findings = all
		.slice(0, all.indexOf(newest))
		.map((b) => `${b.dir}: no summary.json, so ${newest.dir} is used`);
	let summary;
	try {
		summary = JSON.parse(read(root, `${newest.dir}/summary.json`));
	} catch (err) {
		throw new Error(`${newest.dir}/summary.json does not parse: ${err.message}`);
	}
	const runs = Array.isArray(summary?.runs) ? summary.runs : [];
	const timed = (r) => r.outcome === "settled" && Number.isFinite(r.wallSeconds);
	for (const r of runs.filter((x) => !timed(x))) {
		const why = r.outcome === "settled" ? "settled without a wall time" : (r.outcome ?? "without an outcome");
		findings.push(`${newest.dir}/${r.name}: ${r.kind} run ${why}, not timed`);
	}
	const warm = runs.filter((r) => r.kind === "warm" && timed(r)).map((r) => r.wallSeconds);
	const cold = runs.find((r) => r.kind === "cold" && timed(r));
	const env = summary?.environment ?? {};
	const age = now instanceof Date ? `, ${Math.floor((now - Date.parse(newest.date)) / DAY_MS)} days old` : "";
	const parts = [
		env.project ?? "unknown project",
		`${warm.length} warm runs`,
		cold ? `cold ${round1(cold.wallSeconds)} s` : "no settled cold run",
		`flisk ${env.flisk ?? "?"}`,
		`${env.os ?? "unknown OS"}, ${env.cpus ?? "?"} CPUs`,
		`benchmark of ${newest.date}${age}`,
	];
	if (!warm.length) return { value: null, summary: `no settled warm run: ${parts.join(", ")}`, findings };
	return { value: round1(median(warm)), summary: parts.join(", "), findings };
}
