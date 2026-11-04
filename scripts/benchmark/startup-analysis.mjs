#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

// Explains where a `flisk up` / `flisk demo` start went, from Tilt's `uiresources` JSON. Unlike
// tilt-build-durations.mjs (one row per resource), this answers "what was the wall time spent on":
//   - wall time from the first build start to the last finish;
//   - the resources that never built because something they wait on failed (a failed init-networks looks like a slow start);
//   - the slowest builds and how parallel the run was (sum of durations / wall time; near 1 means serial);
//   - the idle gaps where nothing was building.
//
// Usage: node scripts/benchmark/startup-analysis.mjs [--port 10350 | --file uiresources.json] [--json]

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Builds one row per resource from Tilt's `uiresources` JSON text. */
export function analyze(jsonText, now = Date.now()) {
	const items = JSON.parse(jsonText).items ?? [];
	const built = [];
	const failed = [];
	const pending = [];
	for (const item of items) {
		const name = item.metadata?.name;
		const status = item.status ?? {};
		const build = status.buildHistory?.[0];
		const running = status.currentBuild?.startTime;
		if (build?.startTime && build?.finishTime) {
			const start = Date.parse(build.startTime);
			const end = Date.parse(build.finishTime);
			built.push({ name, start, end, seconds: (end - start) / 1000, error: build.error ?? null });
			if (build.error) failed.push(name);
		} else if (running) {
			built.push({ name, start: Date.parse(running), end: now, seconds: (now - Date.parse(running)) / 1000, error: null, running: true });
		} else if (status.updateStatus === "pending" || status.updateStatus === "in_progress") {
			pending.push(name);
		}
	}
	built.sort((a, b) => a.start - b.start);
	if (built.length === 0) return { wallSeconds: 0, parallelism: 0, slowest: [], idleSeconds: 0, failed, blocked: pending };

	const first = Math.min(...built.map((b) => b.start));
	const last = Math.max(...built.map((b) => b.end));
	const wallSeconds = (last - first) / 1000;
	const busy = built.reduce((sum, b) => sum + b.seconds, 0);

	// Merge the build intervals to find the time when nothing was building.
	let covered = 0;
	let cursor = first;
	for (const b of [...built].sort((a, c) => a.start - c.start)) {
		const from = Math.max(b.start, cursor);
		if (b.end > from) covered += b.end - from;
		cursor = Math.max(cursor, b.end);
	}
	return {
		wallSeconds: round(wallSeconds),
		parallelism: wallSeconds > 0 ? round(busy / wallSeconds) : 0,
		idleSeconds: round(wallSeconds - covered / 1000),
		slowest: [...built].sort((a, b) => b.seconds - a.seconds).slice(0, 5).map((b) => ({ name: b.name, seconds: round(b.seconds), running: Boolean(b.running) })),
		failed,
		// Pending with a failure present: waiting cannot help.
		blocked: failed.length > 0 ? pending : [],
		pending: pending.length,
	};
}

const round = (n) => Math.round(n * 10) / 10;

export function format(report) {
	const lines = [`wall ${report.wallSeconds}s, parallelism ${report.parallelism}x, idle ${report.idleSeconds}s`];
	for (const s of report.slowest) lines.push(`  slow  ${String(s.seconds).padStart(7)}s  ${s.name}${s.running ? " (still running)" : ""}`);
	if (report.failed.length > 0) {
		lines.push(`FAILED: ${report.failed.join(", ")}`);
		lines.push(`  ${report.blocked.length} resources can never start while that stays failed (not slow, stuck)`);
	}
	return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: { port: { type: "string", default: "10350" }, file: { type: "string" }, json: { type: "boolean", default: false } },
	});
	let text;
	if (values.file) {
		text = readFileSync(values.file, "utf8");
	} else {
		const result = spawnSync("tilt", ["get", "uiresources", "--port", values.port, "-o", "json"], { encoding: "utf8" });
		if (result.status !== 0) {
			console.error(`tilt get uiresources failed on port ${values.port}: ${(result.stderr || result.stdout).trim()}`);
			process.exit(1);
		}
		text = result.stdout;
	}
	const report = analyze(text);
	console.log(values.json ? JSON.stringify(report, null, 2) : format(report));
}
