#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

// Turns a run directory written by scripts/benchmark/tdk-up-warm-start.sh into summary.md, summary.json and span.svg.
//
// Usage: node scripts/benchmark/summarize-tdk-up.mjs <run-directory>

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
	console.error("Usage: node scripts/benchmark/summarize-tdk-up.mjs <run-directory>");
	process.exit(2);
}

const readOr = (path, fallback = "") => (existsSync(path) ? readFileSync(path, "utf8") : fallback);
const toSeconds = (hms) => {
	const [h, m, s] = hms.split(":").map(Number);
	return h * 3600 + m * 60 + s;
};

// One line per resource from tilt-build-durations.mjs, in start order: "HH:MM:SS  12.3s  name  ok|FAILED: ...".
// Times are clock times only, so a run that crosses midnight is unwrapped by adding a day when the clock goes back.
const parseDurations = (text) => {
	let day = 0;
	let previous = -1;
	return text
		.split("\n")
		.map((line) => line.match(/^(\d{2}:\d{2}:\d{2})\s+([\d.]+)s\s+(\S+)\s+(.+)$/))
		.filter(Boolean)
		.map(([, start, seconds, resource, status]) => {
			let at = toSeconds(start);
			if (previous >= 0 && at < previous) day += 86400;
			previous = at;
			at += day;
			return {
				resource,
				start: at,
				seconds: Number(seconds),
				failed: !status.trim().startsWith("ok"),
			};
		});
};

const runs = readdirSync(dir)
	.filter((name) => /^(cold|warm)-\d+$/.test(name))
	.sort((a, b) => (a.startsWith("cold") ? -1 : 1) - (b.startsWith("cold") ? -1 : 1) || a.localeCompare(b))
	.map((name) => {
		const runDir = join(dir, name);
		const meta = Object.fromEntries(
			readOr(join(runDir, "run.txt"))
				.split("\n")
				.filter(Boolean)
				.map((line) => line.split("=")),
		);
		const resources = parseDurations(readOr(join(runDir, "durations.txt")));
		const span = resources.length
			? Math.max(...resources.map((r) => r.start + r.seconds)) - Math.min(...resources.map((r) => r.start))
			: null;
		const golden = resources.find((r) => r.resource === "golden-layers-build");
		// Tilt's own log says whether the golden build skipped (a fast completed build is not a skip).
		const goldenLog = readOr(join(runDir, "golden.log"));
		// Anchored to the line the script prints when it skips; the command echoed at the top of the log also contains the words.
		const goldenSkipped = goldenLog ? /^✅ Golden images are up to date \(hash [0-9a-f]+\) - skipping build/m.test(goldenLog) : null;
		const samples = readOr(join(runDir, "vm-samples.txt"))
			.split("\n")
			.filter(Boolean)
			.map((line) => Number(line.split(" ")[1]))
			.filter((n) => Number.isFinite(n) && n > 0);
		return {
			name,
			kind: meta.kind ?? (name.startsWith("cold") ? "cold" : "warm"),
			wallSeconds: Number(readOr(join(runDir, "wall-seconds.txt"), "NaN").trim()),
			spanSeconds: span,
			goldenSeconds: golden ? golden.seconds : null,
			goldenSkipped,
			outcome: meta.outcome ?? "unknown",
			failedResources: resources.filter((r) => r.failed).map((r) => r.resource),
			healthySeen: Number(meta.healthy_seen ?? NaN),
			healthyExpected: Number(meta.healthy_expected ?? NaN),
			vmMinMiB: samples.length ? Math.min(...samples) : null,
			vmPeakMiB: samples.length ? Math.max(...samples) : null,
			resources,
		};
	});

const env = Object.fromEntries(
	readOr(join(dir, "environment.txt"))
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split(/:\s(.*)/).slice(0, 2)),
);
const fmt = (n, digits = 1) => (n === null || Number.isNaN(n) ? "n/a" : Number(n).toFixed(digits));
const services = [...new Set(runs.flatMap((r) => r.resources.map((x) => x.resource)))].filter(
	(name) => /-(api|app|worker)$/.test(name),
);

const lines = [];
lines.push("# tdk up warm-start benchmark", "");
lines.push("| Run | Kind | Outcome | Span (s) | Wall (s) | golden-layers-build (s) | Healthy | Failed resources | Docker VM peak (MiB) |");
lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|");
for (const r of runs) {
	const golden =
		r.goldenSeconds === null ? "n/a" : `${fmt(r.goldenSeconds)}${r.goldenSkipped === true ? " (skipped)" : ""}`;
	const vm = r.vmPeakMiB === null ? "not sampled" : `${r.vmPeakMiB}`;
	const failed = r.failedResources.length ? `${r.failedResources.length} (${r.failedResources.join(", ")})` : "0";
	lines.push(
		`| ${r.name} | ${r.kind} | ${r.outcome} | ${fmt(r.spanSeconds)} | ${fmt(r.wallSeconds, 0)} | ${golden} | ${r.healthySeen}/${r.healthyExpected} | ${failed} | ${vm} |`,
	);
}
lines.push(
	"",
	"Span is from the first Tilt build step to the last build finishing. Wall is from launching `tdk up` until every resource was idle and the expected containers were healthy (outcome `settled`), or until the 30-minute limit (`timeout`). Runs with any other outcome were not timed.",
	"",
);
lines.push("## Build time per service (s)", "");
lines.push(`| Resource | ${runs.map((r) => r.name).join(" | ")} |`);
lines.push(`|---|${runs.map(() => "---:").join("|")}|`);
for (const service of services) {
	const cells = runs.map((r) => {
		const hit = r.resources.find((x) => x.resource === service);
		return hit ? fmt(hit.seconds) : "n/a";
	});
	lines.push(`| ${service} | ${cells.join(" | ")} |`);
}
lines.push("");
lines.push("## Environment", "");
for (const [key, value] of Object.entries(env)) lines.push(`- ${key}: ${value}`);
lines.push("");
writeFileSync(join(dir, "summary.md"), lines.join("\n"));

writeFileSync(
	join(dir, "summary.json"),
	JSON.stringify({ environment: env, runs: runs.map(({ resources, ...rest }) => ({ ...rest, resources })) }, null, 2) + "\n",
);

// A simple horizontal bar chart of span and golden build time per run, no dependencies.
const timed = runs.filter((r) => r.outcome === "settled" && r.spanSeconds !== null);
const barHeight = 22;
const left = 110;
const width = 520;
const maxSeconds = Math.max(1, ...timed.map((r) => r.spanSeconds ?? 0));
const scale = (s) => (s / maxSeconds) * width;
const height = Math.max(1, timed.length) * (barHeight * 2 + 18) + 40;
const svgRows = timed.flatMap((r, i) => {
	const y = 30 + i * (barHeight * 2 + 18);
	const span = scale(r.spanSeconds ?? 0);
	const golden = scale(r.goldenSeconds ?? 0);
	return [
		`<text x="${left - 8}" y="${y + barHeight - 6}" text-anchor="end" font-size="13">${r.name}</text>`,
		`<rect x="${left}" y="${y}" width="${span}" height="${barHeight}" fill="#4f7cac"/>`,
		`<text x="${left + span + 6}" y="${y + barHeight - 6}" font-size="12">${fmt(r.spanSeconds)} s span</text>`,
		`<rect x="${left}" y="${y + barHeight + 4}" width="${golden}" height="${barHeight}" fill="#e0a526"/>`,
		`<text x="${left + golden + 6}" y="${y + barHeight * 2 - 2}" font-size="12">${fmt(r.goldenSeconds)} s golden base</text>`,
	];
});
writeFileSync(
	join(dir, "span.svg"),
	`<svg xmlns="http://www.w3.org/2000/svg" width="${left + width + 180}" height="${height}" font-family="-apple-system, Helvetica, Arial, sans-serif">
<text x="${left}" y="18" font-size="14" font-weight="600">tdk up: span and golden base build per run</text>
${svgRows.join("\n")}
</svg>
`,
);

console.log(`wrote ${join(dir, "summary.md")}, summary.json and span.svg`);
