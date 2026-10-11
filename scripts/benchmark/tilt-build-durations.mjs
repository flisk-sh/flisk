#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

// Prints how long each Tilt resource took in its latest build, from the running project's Tilt
// (`tilt get uiresources -o json`). Use it to time a `tdk up` by resource: start the project, wait
// for it to settle, then run this script against the project's Tilt port.
//
// Usage: node scripts/benchmark/tilt-build-durations.mjs [--port 10350] [--json]

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		help: { type: "boolean", short: "h" },
		port: { type: "string", default: "10350" },
		json: { type: "boolean", default: false },
	},
});

if (values.help) {
	console.log("Usage: node scripts/benchmark/tilt-build-durations.mjs [--port 10350] [--json]");
	process.exit(0);
}

const result = spawnSync("tilt", ["get", "uiresources", "--port", values.port, "-o", "json"], { encoding: "utf8" });
if (result.status !== 0) {
	console.error(`tilt get uiresources failed on port ${values.port}: ${(result.stderr || result.stdout).trim()}`);
	process.exit(1);
}

const rows = JSON.parse(result.stdout).items
	.map((item) => {
		const build = item.status?.buildHistory?.[0];
		if (!build?.startTime || !build?.finishTime) return null;
		const seconds = (Date.parse(build.finishTime) - Date.parse(build.startTime)) / 1000;
		return {
			resource: item.metadata.name,
			startedAt: build.startTime,
			seconds: Math.round(seconds * 100) / 100,
			error: build.error ?? null,
		};
	})
	.filter(Boolean)
	.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

if (values.json) {
	console.log(JSON.stringify(rows, null, 2));
} else {
	for (const row of rows) {
		const status = row.error ? `FAILED: ${row.error}` : "ok";
		console.log(`${row.startedAt.slice(11, 19)}  ${String(row.seconds).padStart(8)}s  ${row.resource.padEnd(36)} ${status}`);
	}
}
