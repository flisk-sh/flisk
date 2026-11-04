// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether the packed CLI still installs and runs. The share of the last 10 completed runs of the 🔄 CI | Packed CLI
// lifecycle smoke (.github/workflows/package-lifecycle-smoke.yml: pack the CLI, install the tarball, create a project,
// up and down) that succeeded. It runs on push to main and on manual dispatch, so the newest run is the state of main.
// Cancelled, skipped and unapproved runs say nothing about the package and are left out (recentRuns, shared with
// example-boot-success.mjs).
import { failedRuns, passRate, recentRuns } from "./example-boot-success.mjs";

export const meta = {
	id: "lifecycle-smoke",
	title: "Packed CLI lifecycle smoke runs that passed",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "%",
};

export const WORKFLOW = "package-lifecycle-smoke.yml";
export const RUNS = 10;

export function measure(ctx) {
	const runs = recentRuns(ctx.gh, ctx.repo, WORKFLOW, { limit: RUNS });
	if (!runs.length) return { value: null, summary: `no completed run of ${WORKFLOW}` };
	const ok = runs.filter((r) => r.conclusion === "success").length;
	const events = [...new Set(runs.map((r) => r.event))].sort().join(", ");
	return {
		value: passRate(runs),
		summary: `n=${runs.length}: ${ok} succeeded; newest ${runs[0].created_at.slice(0, 10)} ${runs[0].conclusion}; events ${events}`,
		findings: failedRuns(runs),
	};
}
