// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Cancels the runs of merge queue batches that no longer exist. GitHub deletes a batch's gh-readonly-queue/... branch when the
// batch dies (an entry ahead of it left the queue, or main moved), but it leaves the batch's workflow runs behind. They keep
// holding runners, and the runs queued behind them in the same concurrency group never start: on 2026-11-01 two Resource types
// runs of dead batches ran for two hours while 25 more waited, and the live batches queued behind all of them.
//
//   node scripts/cancel-dead-queue-runs.mjs --repo <owner/name> [--dry-run]
//
// A run is cancelled only when its event is merge_group, it is queued or in progress, its branch is under
// gh-readonly-queue/, and that branch no longer exists. Reads the token from GH_TOKEN and shells out to `gh`.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const QUEUE_PREFIX = "gh-readonly-queue/";

// The runs to cancel: merge_group runs on a queue branch for which exists(branch) is false.
export function deadQueueRuns(runs, exists) {
	const known = new Map();
	const branchExists = (branch) => {
		if (!known.has(branch)) known.set(branch, exists(branch));
		return known.get(branch);
	};
	return runs.filter(
		(run) =>
			run.event === "merge_group" &&
			(run.status === "queued" || run.status === "in_progress") &&
			typeof run.head_branch === "string" &&
			run.head_branch.startsWith(QUEUE_PREFIX) &&
			!branchExists(run.head_branch),
	);
}

const gh = (args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function listRuns(repo) {
	const runs = [];
	for (const status of ["queued", "in_progress"]) {
		const out = gh(["api", "--paginate", `repos/${repo}/actions/runs?status=${status}&event=merge_group&per_page=100`, "--jq", ".workflow_runs[] | {id, name, status, event, head_branch}"]);
		for (const line of out.split("\n")) if (line.trim()) runs.push(JSON.parse(line));
	}
	return runs;
}

// matching-refs returns an empty list for a missing branch; a failed call throws, so an API error never reads as "gone".
function branchExists(repo, branch) {
	const out = gh(["api", `repos/${repo}/git/matching-refs/heads/${branch}`, "--jq", "length"]);
	return Number(out.trim()) > 0;
}

function main(argv) {
	const repoAt = argv.indexOf("--repo");
	const repo = repoAt >= 0 ? argv[repoAt + 1] : process.env.GITHUB_REPOSITORY;
	const dryRun = argv.includes("--dry-run");
	if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
		console.error("usage: cancel-dead-queue-runs.mjs --repo <owner/name> [--dry-run]");
		return 2;
	}
	const dead = deadQueueRuns(listRuns(repo), (branch) => branchExists(repo, branch));
	for (const run of dead) {
		console.log(`${dryRun ? "would cancel" : "cancelling"} ${run.id} ${run.name} (${run.head_branch})`);
		if (!dryRun) gh(["run", "cancel", String(run.id), "--repo", repo]);
	}
	console.log(`${dead.length} dead queue run(s)${dryRun ? " found" : " cancelled"}`);
	return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
