// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether the agent and mcp resource types still work on a live stack. 🧩 E2E | Resource types
// (.github/workflows/e2e-resource-types.yml) runs one matrix job per suite, named `${group} / ${label}`; the agent and
// mcp suites (tests/e2e/resource-types/{agent,mcp}/suite.json) are the jobs `resource-types / agent` and
// `resource-types / mcp`. The value is the share of those jobs that succeeded over the last 20 completed runs that ran
// one. Only nightly, release (workflow_run) and manual runs are read: they run both suites on main or a published
// package, while a pull request or merge-queue run tests unmerged code and runs the agent leg only when its files
// changed (the mcp leg never), so most of those runs have neither job. A release run whose release failed skips the
// plan and has no job either; it is passed over. Cancelled and skipped jobs are left out.
import { IGNORED, recentRuns } from "./example-boot-success.mjs";
import { round1 } from "./lib.mjs";

export const meta = {
	id: "agent-resource-health",
	title: "Agent and MCP resource-type e2e jobs that passed",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "%",
};

export const WORKFLOW = "e2e-resource-types.yml";
export const RUNS = 20;
// The suite.json triggers both suites share besides "pr": nightly, release and manual.
export const EVENTS = ["schedule", "workflow_run", "workflow_dispatch"];
// Job name -> label: the matrix job name is `${group} / ${label}` (tests/e2e/lib/suite-matrix.mjs).
export const JOBS = { "resource-types / agent": "agent", "resource-types / mcp": "mcp" };
// At most this many jobs calls, so a long stretch of release runs without legs cannot walk the whole history.
export const MAX_SCANNED = 2 * RUNS;

// The jobs of a run's latest attempt, every page in one gh call.
export const runJobs = (gh, repo, id) =>
	gh(["api", `repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate", "--slurp"]).flatMap((p) => p.jobs);

export function measure(ctx) {
	const candidates = EVENTS.flatMap((event) => recentRuns(ctx.gh, ctx.repo, WORKFLOW, { limit: MAX_SCANNED, event }))
		.sort((a, b) => b.created_at.localeCompare(a.created_at))
		.slice(0, MAX_SCANNED);
	const counts = Object.fromEntries(Object.values(JOBS).map((label) => [label, { ok: 0, n: 0 }]));
	const findings = [];
	let runs = 0;
	for (const run of candidates) {
		if (runs >= RUNS) break;
		const jobs = runJobs(ctx.gh, ctx.repo, run.id).filter(
			(j) => j.name in JOBS && j.status === "completed" && !IGNORED.includes(j.conclusion),
		);
		if (!jobs.length) continue;
		runs++;
		for (const job of jobs) {
			const c = counts[JOBS[job.name]];
			c.n++;
			if (job.conclusion === "success") c.ok++;
			else findings.push(`${run.created_at.slice(0, 10)} ${job.name} ${job.conclusion} ${job.html_url}`);
		}
	}
	const n = Object.values(counts).reduce((s, c) => s + c.n, 0);
	if (!n) return { value: null, summary: `no agent or mcp job in the last ${candidates.length} nightly, release or manual runs` };
	const ok = Object.values(counts).reduce((s, c) => s + c.ok, 0);
	const perLabel = Object.entries(counts)
		.map(([label, c]) => `${label} ${c.ok}/${c.n}`)
		.join(", ");
	return {
		value: round1((ok / n) * 100),
		summary: `${ok} of ${n} jobs passed (${perLabel}) over ${runs} nightly, release or manual runs`,
		findings,
	};
}
