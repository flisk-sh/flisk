// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Post-merge failure reporter (#2897). When a pull request workflow finishes red for the head commit of a pull request that
// was already merged, comments on the pull request and opens (or updates) one issue per pull request, so a merge with red
// checks is never silent. Run by .github/workflows/report-post-merge-failures.yml on `workflow_run`; reads the event from
// GITHUB_EVENT_PATH and never checks out pull request code.
//   node scripts/report-post-merge-failures.mjs [--dry-run]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FAILED = ["failure", "timed_out"];
export const MARKER = "<!-- post-merge-failure-report -->";

export function issueTitle(prNumber) {
	return `Merged with red checks: #${prNumber}`;
}

// A run is worth reporting when it failed, was triggered by a pull request, and ran on the pull request's final head commit
// (a failure on an earlier commit was superseded) and that pull request is merged.
export function shouldReport(run, pr) {
	if (!FAILED.includes(run.conclusion)) return false;
	if (run.event !== "pull_request" && run.event !== "pull_request_target")
		return false;
	return Boolean(pr?.merged_at) && pr.head?.sha === run.head_sha;
}

// The jobs that really failed. A run with none is not a red check: GitHub closes a fork's runs still waiting for approval as
// `failure`, with no jobs, the moment the pull request merges, and jobs cancelled by the merge end `cancelled`. The start time is
// deliberately not used: jobs that start after an early merge still run the pull request's tests, and those failures are real.
export function redJobs(jobs) {
	return jobs.filter((job) => FAILED.includes(job.conclusion));
}

// The issue every reporter of a merge settles on: the oldest open one with exactly this title.
export function canonicalIssue(issues, title) {
	const matching = issues.filter((issue) => issue.title === title).map((issue) => issue.number);
	return matching.length > 0 ? Math.min(...matching) : null;
}

export function commentBody(run) {
	return [
		MARKER,
		`**${run.name}** finished \`${run.conclusion}\` after this pull request was merged: ${run.html_url}`,
		"",
		"A tracking issue lists every check that failed for this merge.",
	].join("\n");
}

export function issueBody(pr, run) {
	return [
		`#${pr.number} (${pr.title}) was merged with a failing check.`,
		"",
		`- ${run.name}: ${run.conclusion} - ${run.html_url}`,
		"",
		"Fix forward, or revert the merge. Each further failing check on this commit is added as a comment.",
	].join("\n");
}

function gh(args, input) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		input,
		maxBuffer: 64 * 1024 * 1024,
	});
}

// Pull requests of the run: the payload lists them for same-repo branches only, so fall back to the commit's pull requests.
function pullRequestNumbers(run, repo) {
	const direct = (run.pull_requests ?? []).map((p) => p.number);
	if (direct.length > 0) return direct;
	const found = JSON.parse(gh(["api", `repos/${repo}/commits/${run.head_sha}/pulls`]));
	return found.map((p) => p.number);
}

// Every workflow that fails for a merge runs its own reporter at the same moment, so several can find no issue and each create one.
// A concurrency group cannot serialize them (it keeps one pending run and cancels the rest, which would lose reports). Instead, a
// reporter that created an issue looks again and closes its own if an older one exists, so they all converge on the oldest.
export function fileIssue(pr, run, api) {
	const title = issueTitle(pr.number);
	const line = `${run.name}: ${run.conclusion} - ${run.html_url}`;
	const existing = canonicalIssue(api.list(), title);
	if (existing !== null) {
		api.comment(existing, line);
		return existing;
	}
	const created = api.create(title, issueBody(pr, run));
	const canonical = canonicalIssue(api.list(), title) ?? created;
	if (canonical === created) return created;
	api.comment(canonical, line);
	api.close(created, canonical);
	return canonical;
}

// A plain listing, not --search: the search index lags behind by seconds, which is the window the reporters race in.
const issueApi = {
	list: () => JSON.parse(gh(["issue", "list", "--state", "open", "--limit", "1000", "--json", "number,title"])),
	comment: (number, body) => gh(["issue", "comment", String(number), "--body-file", "-"], body),
	create: (title, body) => {
		const url = gh(["issue", "create", "--title", title, "--body-file", "-"], body).trim();
		return Number(url.split("/").pop());
	},
	close: (number, canonical) =>
		gh(["issue", "close", String(number), "--reason", "not planned", "--comment", `Duplicate of #${canonical}.`]),
};

function runJobs(run, repo) {
	const lines = gh([
		"api",
		"--paginate",
		`repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
		"--jq",
		".jobs[] | {conclusion}",
	]);
	return lines.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function hasComment(prNumber, run) {
	const comments = JSON.parse(
		gh(["pr", "view", String(prNumber), "--json", "comments", "--jq", ".comments"]),
	);
	return comments.some((c) => c.body.includes(MARKER) && c.body.includes(run.html_url));
}

function main(argv) {
	const dryRun = argv.includes("--dry-run");
	const repo = process.env.GITHUB_REPOSITORY;
	const run = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).workflow_run;
	if (!FAILED.includes(run.conclusion)) {
		console.log(`${run.name}: ${run.conclusion}, nothing to report`);
		return 0;
	}
	for (const number of pullRequestNumbers(run, repo)) {
		const pr = JSON.parse(gh(["api", `repos/${repo}/pulls/${number}`]));
		if (!shouldReport(run, pr)) {
			console.log(`#${number}: not merged or not its head commit, skipped`);
			continue;
		}
		if (redJobs(runJobs(run, repo)).length === 0) {
			console.log(`#${number}: ${run.name} ${run.conclusion}, but no job failed, skipped`);
			continue;
		}
		console.log(`#${number}: ${run.name} ${run.conclusion} after merge`);
		if (dryRun) continue;
		if (!hasComment(number, run))
			gh(["pr", "comment", String(number), "--body-file", "-"], commentBody(run));
		fileIssue(pr, run, issueApi);
	}
	return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
