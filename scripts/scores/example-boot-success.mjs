// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether the official examples still boot. The share of the last 30 completed runs of the 🚪 E2E | Examples gate
// (.github/workflows/e2e-examples.yml: build the CLI, boot each bundled example, reach a healthy URL) that succeeded.
// merge_group runs come first: they are the last gate before main, so a red one is a real break and not a pull request
// still in progress. Only when the merge queue has no runs are all events used, and the summary says which.
// Cancelled and skipped runs (a newer push superseded them, or nothing ran) say nothing about the examples and are left
// out. The run helpers here are shared with agent-resource-health.mjs and wsl2-smoke.mjs.
import { round1 } from "./lib.mjs";

export const meta = {
	id: "example-boot-success",
	title: "Examples gate runs that booted the examples",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "%",
};

export const WORKFLOW = "e2e-examples.yml";
export const RUNS = 30;
// Runs that never tested anything: superseded, skipped, or a fork's run still waiting for a maintainer to approve it.
export const IGNORED = ["cancelled", "skipped", "action_required"];
const PER_PAGE = 100;
// Enough pages to find `limit` counted runs behind a burst of cancelled ones, without walking the whole history.
const MAX_PAGES = 5;

// The newest completed runs of a workflow file that ran to a verdict, newest first, at most `limit`, as the REST API
// returns them ({ id, event, conclusion, created_at, html_url, ... }). `event` narrows to one trigger.
export function recentRuns(gh, repo, workflow, { limit, event } = {}) {
	const runs = [];
	for (let page = 1; page <= MAX_PAGES && runs.length < limit; page++) {
		const query = `status=completed&per_page=${PER_PAGE}&page=${page}${event ? `&event=${event}` : ""}`;
		const batch = gh(["api", `repos/${repo}/actions/workflows/${workflow}/runs?${query}`]).workflow_runs;
		runs.push(...batch.filter((r) => r.status === "completed" && !IGNORED.includes(r.conclusion)));
		if (batch.length < PER_PAGE) break;
	}
	return runs.slice(0, limit);
}

// Percent of runs that succeeded, or null when there are none.
export const passRate = (runs) =>
	runs.length ? round1((runs.filter((r) => r.conclusion === "success").length / runs.length) * 100) : null;

// One line per run that did not succeed: `<date> <conclusion> <url>`.
export const failedRuns = (runs) =>
	runs.filter((r) => r.conclusion !== "success").map((r) => `${r.created_at.slice(0, 10)} ${r.conclusion} ${r.html_url}`);

export function measure(ctx) {
	let runs = recentRuns(ctx.gh, ctx.repo, WORKFLOW, { limit: RUNS, event: "merge_group" });
	let scope = "merge_group runs";
	if (!runs.length) {
		runs = recentRuns(ctx.gh, ctx.repo, WORKFLOW, { limit: RUNS });
		scope = "runs of every event (no merge_group run)";
	}
	if (!runs.length) return { value: null, summary: `no completed run of ${WORKFLOW}` };
	const ok = runs.filter((r) => r.conclusion === "success").length;
	return {
		value: passRate(runs),
		summary: `${ok} of ${runs.length} ${scope} succeeded, newest ${runs[0].created_at.slice(0, 10)}`,
		findings: failedRuns(runs),
	};
}
