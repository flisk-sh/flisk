#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Stacklytics data: merges the timings.jsonl every e2e leg writes (tests/e2e/lib/lib.sh `timing`) with the catalog of stacks in
// tests/e2e/axes.json into one stack-timings.json, which flisk.sh/benchmarks reads. Every language, HTTP framework, frontend
// framework, resource type, ORM and bring-your-own variant the axes list is in the file: one with a leg and timings is
// "measured", one whose leg ran but wrote nothing is "no-data", one nothing runs yet is "coming-soon".
//
//   node scripts/benchmark/collect-stack-timings.mjs --timings <dir> --out stack-timings.json \
//     [--axes tests/e2e/axes.json] [--previous <old stack-timings.json>] [--matrix <matrix json>] \
//     [--commit <sha>] [--trigger nightly] [--runner ubuntu-latest] [--run-url <url>] [--now <iso>] [--summary <markdown file to append>]
//
// Metrics (ms): scaffold (flisk resource), listed (flisk up -> status lists the url), cold_start (first flisk up -> route answers
// 200), warm_start (flisk down, flisk up again with images cached -> 200), hot_reload (null until a leg measures it).
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const METRICS = ["scaffold", "listed", "cold_start", "warm_start", "hot_reload"];
export const HISTORY_DAYS = 60;

// How an axis value maps to the matrix leg that measures it (tests/e2e/lib/suite-matrix.mjs labels). `null` leg = nothing runs yet.
const AXES = [
	{ axis: "language", id: "languages", title: "Backend languages", leg: (v) => v },
	{ axis: "httpFramework", id: "http", title: "HTTP frameworks (Bun)", leg: (v) => (v === "hono" ? "bun" : `bun-${v}`) },
	{ axis: "frontendFramework", id: "frontend", title: "Frontend frameworks", leg: (v) => `frontend-${v}` },
	{
		axis: "appType",
		id: "types",
		title: "Resource types",
		// backend, frontend and bring-your-own are covered by the groups around it.
		skip: new Set(["backend", "frontend", "bring-your-own"]),
		leg: (v) => (v === "database" ? null : v),
	},
	{ axis: "orm", id: "orm", title: "ORMs", leg: (v) => v },
	{ axis: "byoVariant", id: "byo", title: "Bring your own container", leg: (v) => `bring-your-own-${v}` },
	{ axis: "infraService", id: "infra", title: "Infrastructure services", leg: () => null },
];

/** Every timings.jsonl under a directory, parsed into records; bad lines are skipped. */
export function readTimings(dir) {
	const records = [];
	const walk = (d) => {
		for (const name of readdirSync(d)) {
			const file = path.join(d, name);
			if (statSync(file).isDirectory()) walk(file);
			else if (name === "timings.jsonl") {
				for (const line of readFileSync(file, "utf8").split("\n")) {
					if (!line.trim()) continue;
					try {
						const r = JSON.parse(line);
						if (r && typeof r.leg === "string" && typeof r.metric === "string" && Number.isFinite(r.ms) && r.ms >= 0) records.push(r);
					} catch {}
				}
			}
		}
	};
	if (existsSync(dir)) walk(dir);
	return records;
}

const median = (xs) => {
	const s = [...xs].sort((a, b) => a - b);
	const m = Math.floor(s.length / 2);
	return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** One value per (leg, metric): scaffold is the median of its readings (a suite may scaffold several resources), the rest the first. */
export function summarize(records) {
	const byLeg = new Map();
	for (const r of [...records].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
		const legs = byLeg.get(r.leg) ?? new Map();
		legs.set(r.metric, [...(legs.get(r.metric) ?? []), r.ms]);
		byLeg.set(r.leg, legs);
	}
	const out = new Map();
	for (const [leg, metrics] of byLeg) {
		const m = {};
		for (const [metric, values] of metrics) m[metric] = metric === "scaffold" ? median(values) : values[0];
		out.set(leg, m);
	}
	return out;
}

/** The catalog: every value of the axes the page shows, with the leg that measures it. */
export function catalog(axesJson) {
	const stacks = [];
	for (const g of AXES) {
		const values = Object.keys(axesJson?.axes?.[g.axis]?.values ?? {});
		for (const name of values) {
			if (g.skip?.has(name)) continue;
			stacks.push({ id: g.leg(name) ?? `${g.axis}:${name}`, name, group: g.id, axis: g.axis, hasLeg: g.leg(name) !== null });
		}
	}
	return { groups: AXES.map(({ id, title }) => ({ id, title })), stacks };
}

const dayOf = (iso) => String(iso).slice(0, 10);

/**
 * Builds stack-timings.json. `ran` is the set of leg labels the run's matrix selected (null when unknown): a selected leg that wrote
 * no timings is "no-data" (it failed or has no hooks), not "coming-soon".
 */
export function build({ records, axes, previous = null, ran = null, commit = "", trigger = "", runner = "", runUrl = "", now = new Date().toISOString() }) {
	const summary = summarize(records);
	const { groups, stacks: catalogued } = catalog(axes);
	const known = new Set(catalogued.map((s) => s.id));
	const all = [...catalogued];
	// A leg that is measured but no axis lists (the combined suite, a new suite) still shows, under "Other suites".
	for (const leg of summary.keys()) if (!known.has(leg)) all.push({ id: leg, name: leg, group: "other", axis: null, hasLeg: true });
	const withOther = all.some((s) => s.group === "other") ? [...groups, { id: "other", title: "Other suites" }] : groups;
	const prev = new Map((previous?.stacks ?? []).map((s) => [s.id, s]));
	const out = all.map((s) => {
		const m = summary.get(s.id) ?? null;
		const metrics = Object.fromEntries(METRICS.map((k) => [k, m?.[k] ?? null]));
		const old = prev.get(s.id);
		let history = (old?.history ?? []).filter((h) => h.date !== dayOf(now));
		if (m) history.push({ date: dayOf(now), commit, ...metrics });
		history = history.slice(-HISTORY_DAYS);
		const status = m ? "measured" : ran?.has(s.id) ? "no-data" : "coming-soon";
		// A stack measured on an earlier night keeps its last numbers when a PR-sized run skipped its leg.
		const latest = m ? metrics : (old?.metrics ?? metrics);
		return { id: s.id, name: s.name, group: s.group, axis: s.axis, status: m || old?.status === "measured" ? "measured" : status, metrics: latest, history };
	});
	return { schema: 1, generated: now, commit, trigger, runner, runUrl, metrics: METRICS, groups: withOther, stacks: out };
}

const seconds = (ms) => (ms == null ? "-" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

/** The markdown table a workflow run shows in its job summary: one row per stack that ran, then how many are coming soon. */
export function summaryMarkdown(result) {
	const rows = result.stacks.filter((s) => s.status !== "coming-soon");
	const lines = ["## Stack timings", "", `Commit \`${String(result.commit).slice(0, 7)}\` on ${result.runner || "a runner"} (${result.trigger || "run"}). Cold start is the first \`flisk up\` to a 200 through Traefik; warm start is \`flisk down\` then \`flisk up\` with the images cached.`, ""];
	lines.push("| Stack | Scaffold | Cold start | Warm start |", "|---|---:|---:|---:|");
	for (const s of rows) {
		const m = s.metrics;
		lines.push(`| ${s.name}${s.group === "other" ? ` (${s.id})` : ""}${s.status === "no-data" ? " (no data)" : ""} | ${seconds(m.scaffold)} | ${seconds(m.cold_start ?? m.listed)} | ${seconds(m.warm_start)} |`);
	}
	lines.push("", `${result.stacks.filter((s) => s.status === "coming-soon").length} more stacks are listed as coming soon.`, "");
	return lines.join("\n");
}

function parseArgs(argv) {
	const a = {};
	for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[++i];
	return a;
}

/** The leg labels a plan job's matrix selected, from `{"include":[{"label":...}]}` (or null when no file). */
export function ranLegs(file) {
	if (!file || !existsSync(file)) return null;
	try {
		const m = JSON.parse(readFileSync(file, "utf8"));
		return new Set((m.include ?? []).map((l) => l.label));
	} catch {
		return null;
	}
}

function main() {
	const a = parseArgs(process.argv.slice(2));
	if (!a.timings || !a.out) {
		console.error("usage: collect-stack-timings.mjs --timings <dir> --out <file> [--axes f] [--previous f] [--matrix f] [--commit sha] [--trigger t] [--runner r] [--run-url u]");
		process.exit(2);
	}
	const here = path.dirname(fileURLToPath(import.meta.url));
	const axes = JSON.parse(readFileSync(a.axes ?? path.join(here, "../../tests/e2e/axes.json"), "utf8"));
	let previous = null;
	if (a.previous && existsSync(a.previous)) {
		try {
			previous = JSON.parse(readFileSync(a.previous, "utf8"));
		} catch {}
	}
	const result = build({
		records: readTimings(a.timings),
		axes,
		previous,
		ran: ranLegs(a.matrix),
		commit: a.commit ?? "",
		trigger: a.trigger ?? "",
		runner: a.runner ?? "",
		runUrl: a["run-url"] ?? "",
		now: a.now ?? new Date().toISOString(),
	});
	writeFileSync(a.out, `${JSON.stringify(result, null, "\t")}\n`);
	if (a.summary) appendFileSync(a.summary, summaryMarkdown(result));
	const count = (s) => result.stacks.filter((x) => x.status === s).length;
	console.log(`stack timings: ${count("measured")} measured, ${count("no-data")} no data, ${count("coming-soon")} coming soon -> ${a.out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
