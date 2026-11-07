// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Nightly adopter issue reporter. After .github/workflows/nightly-adopters.yml runs on the default branch, opens one issue per
// adopter whose job failed (or comments on its open issue), and closes that issue once the adopter passes again. Each issue
// names the failing step and the job's error annotations, so a red adopter is visible without opening the run.
// red-job-tracker.mjs still tracks the workflow as a whole after three red runs; this reports each adopter on every run.
//   node scripts/nightly-adopter-issues.mjs [--dry-run]
// Reads GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT and GITHUB_SERVER_URL. Needs gh with actions: read and issues: write.
// --dry-run prints each decision and changes nothing.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const FAILED = ["failure", "timed_out"];
export const MARKER = "<!-- nightly-adopter-issue -->";
export const TITLE_PREFIX = "Nightly adopter failing: ";
// GitHub's generic exit-code annotation names an error but not its cause, so it is left out.
const GENERIC = /^Process completed with exit code \d+\.?$/;

// Matrix jobs are named "<Name> (<owner>/<repo>)" in nightly-adopters.yml; any other job (this reporter) is not an adopter.
export function parseAdopterJob(name) {
	const m = /^(.+) \(([\w.-]+\/[\w.-]+)\)$/.exec(name ?? "");
	return m ? { name: m[1], repo: m[2] } : null;
}

export function issueTitle(adopter) {
	return `${TITLE_PREFIX}${adopter.name} (${adopter.repo})`;
}

// The first step that failed, or null (a job cancelled by its timeout can have none).
export function failedStep(job) {
	return (
		(job.steps ?? []).find((s) => FAILED.includes(s.conclusion))?.name ?? null
	);
}

export function errorMessages(annotations) {
	const seen = new Set();
	for (const a of annotations ?? []) {
		if (a.annotation_level !== "failure") continue;
		const msg = String(a.message ?? "").trim();
		if (msg && !GENERIC.test(msg)) seen.add(msg);
	}
	return [...seen];
}

// What to do for one adopter job given its open issue (or null): "create", "comment", "close" or "none".
export function decide(job, issue) {
	if (FAILED.includes(job.conclusion)) return issue ? "comment" : "create";
	if (job.conclusion === "success" && issue) return "close";
	return "none";
}

function details(job, runUrl, errors) {
	const step = failedStep(job);
	const lines = [`- Run: ${runUrl}`, `- Job: ${job.html_url}`];
	if (step) lines.push(`- Failed step: \`${step}\``);
	if (errors.length > 0) {
		lines.push(
			"",
			"Errors:",
			"",
			"```text",
			...errors.map((e) => e.slice(0, 2000)),
			"```",
		);
	}
	return lines;
}

export function issueBody(adopter, job, runUrl, errors) {
	return [
		MARKER,
		`The nightly real-world adopter job for **${adopter.name}** (\`${adopter.repo}\`) failed.`,
		"",
		...details(job, runUrl, errors),
		"",
		"The run's failure-evidence artifact holds the Tilt and Compose logs. Each further failing night is added as a comment,",
		"and this issue closes on the first night the adopter passes.",
	].join("\n");
}

export function commentBody(job, runUrl, errors) {
	return [MARKER, "Failed again.", "", ...details(job, runUrl, errors)].join(
		"\n",
	);
}

export function closeBody(runUrl) {
	return `${MARKER}\nPassed in ${runUrl}. Closing.`;
}

// A transient GitHub 5xx or rate limit, worth one more try (see .claude/memory/MEMORY.md, 2026-10-20 github-script retries).
export function isTransient(message) {
	return /HTTP (429|5\d\d)\b/.test(String(message ?? ""));
}

function ghOnce(args, input) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		input,
		maxBuffer: 64 * 1024 * 1024,
	});
}

function sleep(ms) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function gh(args, input, { retries = 2 } = {}) {
	for (let attempt = 0; ; attempt++) {
		try {
			return ghOnce(args, input);
		} catch (err) {
			if (attempt >= retries || !isTransient(`${err.stderr}${err.message}`))
				throw err;
			sleep(2000 * (attempt + 1));
		}
	}
}

// REST, not `gh issue list --search`: the search index lags, and a rerun minutes later must find the issue it just opened.
function openIssues(repo) {
	const out = gh([
		"api",
		"--paginate",
		`repos/${repo}/issues?state=open&per_page=100`,
		"--jq",
		`.[] | select(.pull_request | not) | select(.title | startswith("${TITLE_PREFIX}")) | [.number, .title] | @tsv`,
	]);
	const issues = new Map();
	for (const line of out.split("\n").filter(Boolean)) {
		const [number, ...title] = line.split("\t");
		issues.set(title.join("\t"), Number(number));
	}
	return issues;
}

function post(path, body, method = "POST", options = undefined) {
	gh(
		["api", "--method", method, path, "--input", "-"],
		JSON.stringify(body),
		options,
	);
}

// Creating is not idempotent: a 5xx can arrive after GitHub made the issue, so re-check by title before trying again.
function createIssue(repo, title, body) {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			post(`repos/${repo}/issues`, { title, body }, "POST", { retries: 0 });
			return;
		} catch (err) {
			if (!isTransient(`${err.stderr}${err.message}`)) throw err;
			sleep(2000 * (attempt + 1));
			if (openIssues(repo).has(title)) return;
		}
	}
	throw new Error(`could not open "${title}"`);
}

function annotations(repo, job) {
	try {
		return JSON.parse(
			gh(["api", `repos/${repo}/check-runs/${job.id}/annotations?per_page=50`]),
		);
	} catch (err) {
		console.warn(`annotations for ${job.name} unavailable: ${err.message}`);
		return [];
	}
}

function main(argv) {
	const dryRun = argv.includes("--dry-run");
	const repo = process.env.GITHUB_REPOSITORY;
	const runId = process.env.GITHUB_RUN_ID;
	const attempt = process.env.GITHUB_RUN_ATTEMPT || "1";
	const server = process.env.GITHUB_SERVER_URL || "https://github.com";
	if (!repo || !runId) {
		console.error("GITHUB_REPOSITORY and GITHUB_RUN_ID are required");
		return 2;
	}
	const runUrl = `${server}/${repo}/actions/runs/${runId}`;
	const jobs = JSON.parse(
		gh([
			"api",
			`repos/${repo}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
		]),
	).jobs;
	const issues = openIssues(repo);
	for (const job of jobs) {
		const adopter = parseAdopterJob(job.name);
		if (!adopter) continue;
		const title = issueTitle(adopter);
		const number = issues.get(title) ?? null;
		const action = decide(job, number);
		console.log(
			`${job.name}: ${job.conclusion} -> ${action}${number ? ` #${number}` : ""}`,
		);
		if (dryRun || action === "none") continue;
		if (action === "close") {
			post(`repos/${repo}/issues/${number}/comments`, {
				body: closeBody(runUrl),
			});
			post(
				`repos/${repo}/issues/${number}`,
				{ state: "closed", state_reason: "completed" },
				"PATCH",
			);
			continue;
		}
		const errors = errorMessages(annotations(repo, job));
		if (action === "comment")
			post(`repos/${repo}/issues/${number}/comments`, {
				body: commentBody(job, runUrl, errors),
			});
		else createIssue(repo, title, issueBody(adopter, job, runUrl, errors));
	}
	return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
