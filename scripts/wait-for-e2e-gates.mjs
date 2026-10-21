// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Waits for the e2e group gates the CI summary job aggregates (#1816). The gates live in their own workflows, so this script
// polls their check runs on the head commit until every gate has finished, and fails when one is missing or did not pass.
//
//   node scripts/wait-for-e2e-gates.mjs [--event <name>] [--sha <sha>] [--repo <owner/name>] [--deadline <seconds>]
//
// The gates to wait for come from the CI event (scripts/e2e-gate-expectations.mjs): a gate that cannot report for that event
// is never waited for. A gate that has not reported yet stops the wait early when its workflow never started for the commit,
// so a broken trigger fails in minutes instead of at the deadline.
//
// Reads the token from GITHUB_TOKEN or GH_TOKEN, writes the gate table to GITHUB_STEP_SUMMARY and exits 1 when a gate is
// missing, unfinished or failed.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gatesForEvent, workflowForGate } from "./e2e-gate-expectations.mjs";

const API = "https://api.github.com";
const DEFAULT_DEADLINE_SECONDS = 1800;
const DEFAULT_GRACE_SECONDS = 600;
const DEFAULT_POLL_SECONDS = 15;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// The check run of a gate with the latest start time, so a re-run of a gate wins over the attempt before it.
export function latestAttempt(runs) {
	let latest = null;
	for (const run of runs) {
		if (!latest) {
			latest = run;
			continue;
		}
		const started = run.started_at ?? "";
		const latestStarted = latest.started_at ?? "";
		if (started > latestStarted || (started === latestStarted && (run.id ?? 0) > (latest.id ?? 0)))
			latest = run;
	}
	return latest;
}

// The state of every gate: passed, failed, running or missing. A skipped gate passes, as a skipped job satisfies a required
// check.
export function gateStates(checkRuns, gates) {
	return gates.map((gate) => {
		const run = latestAttempt(checkRuns.filter((entry) => entry.name === gate));
		if (!run)
			return { gate, state: "missing", conclusion: null, reason: "no check run for the commit" };
		if (run.status !== "completed")
			return { gate, state: "running", conclusion: run.conclusion ?? null, reason: "still running" };
		const conclusion = run.conclusion ?? "unknown";
		return {
			gate,
			state: conclusion === "success" || conclusion === "skipped" ? "passed" : "failed",
			conclusion,
			reason: conclusion === "success" || conclusion === "skipped" ? "" : `the gate reported ${conclusion}`,
		};
	});
}

// The gates that have not finished yet.
export function pendingGates(states) {
	return states.filter((state) => state.state === "running" || state.state === "missing");
}

// Whether a workflow started a run for the commit, so a gate that has not reported can still report later.
export function workflowStarted(workflowRuns, workflowFile) {
	if (!workflowFile) return true;
	const suffix = `.github/workflows/${workflowFile}`;
	return workflowRuns.some((run) => (run.path ?? "").endsWith(suffix));
}

// The gates that will never report: no check run, and the workflow that reports them never started for this commit.
export function neverReporting(states, workflowRuns) {
	return states
		.filter((state) => state.state === "missing")
		.filter((state) => !workflowStarted(workflowRuns, workflowForGate(state.gate)));
}

// A GitHub API call that retries a rate limit or a server error, so one transient 5xx does not fail the run.
export async function apiGet(pathname, token, { attempts = 3, sleep = defaultSleep } = {}) {
	for (let attempt = 1; ; attempt += 1) {
		const response = await fetch(`${API}${pathname}`, {
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${token}`,
				"x-github-api-version": "2022-11-28",
			},
		});
		if (response.ok) return response.json();
		const body = await response.text();
		if (RETRYABLE.has(response.status) && attempt < attempts) {
			await sleep(attempt * 5);
			continue;
		}
		throw new Error(`GET ${pathname} failed with ${response.status}: ${body.slice(0, 200)}`);
	}
}

// The check runs of a commit.
export async function fetchCheckRuns(repo, sha, token, options) {
	const payload = await apiGet(
		`/repos/${repo}/commits/${sha}/check-runs?per_page=100`,
		token,
		options,
	);
	return payload.check_runs ?? [];
}

// The workflow runs of a commit.
export async function fetchWorkflowRuns(repo, sha, token, options) {
	const payload = await apiGet(
		`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`,
		token,
		options,
	);
	return payload.workflow_runs ?? [];
}

function defaultSleep(seconds) {
	return new Promise((resolve) => {
		setTimeout(resolve, seconds * 1000);
	});
}

// The markdown table of the gates and their results.
export function renderTable(states) {
	const label = {
		passed: "✅ passed",
		failed: "❌ failed",
		running: "⏳ running",
		missing: "⚠️ missing",
	};
	const rows = states.map((state) => {
		const result = label[state.state] ?? state.state;
		const conclusion = state.conclusion ? ` (${state.conclusion})` : "";
		return `| ${state.gate} | ${result}${conclusion} |`;
	});
	return ["## E2E group gates", "", "| Gate | Result |", "|---|---|", ...rows, ""].join("\n");
}

// Waits for the gates and returns their states. Stops when every gate finished, when the deadline passes, or when a gate
// cannot report any more because its workflow never started.
export async function waitForGates({
	gates,
	sha,
	repo,
	token,
	deadlineSeconds = DEFAULT_DEADLINE_SECONDS,
	graceSeconds = DEFAULT_GRACE_SECONDS,
	pollSeconds = DEFAULT_POLL_SECONDS,
	now = () => Date.now(),
	sleep = defaultSleep,
	fetchRuns = fetchCheckRuns,
	fetchWorkflows = fetchWorkflowRuns,
}) {
	const startedAt = now();
	for (;;) {
		const checkRuns = await fetchRuns(repo, sha, token);
		const states = gateStates(checkRuns, gates);
		if (pendingGates(states).length === 0) return states;
		const elapsed = (now() - startedAt) / 1000;
		if (elapsed >= deadlineSeconds) {
			for (const state of pendingGates(states))
				state.reason = state.state === "missing" ? "no check run for the commit" : "still running at the deadline";
			return states;
		}
		if (states.some((state) => state.state === "missing")) {
			const workflowRuns = await fetchWorkflows(repo, sha, token);
			const lost = neverReporting(states, workflowRuns);
			if (lost.length > 0 && elapsed >= graceSeconds) {
				for (const state of lost)
					state.reason = "its workflow never started for the commit";
				return states;
			}
		}
		await sleep(pollSeconds);
	}
}

function parseArgs(argv) {
	const args = {
		event: process.env.GITHUB_EVENT_NAME ?? "",
		sha: process.env.HEAD_SHA ?? "",
		repo: process.env.GITHUB_REPOSITORY ?? "",
		deadlineSeconds: DEFAULT_DEADLINE_SECONDS,
		graceSeconds: DEFAULT_GRACE_SECONDS,
	};
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--event") args.event = argv[++i] ?? "";
		else if (argv[i] === "--sha") args.sha = argv[++i] ?? "";
		else if (argv[i] === "--repo") args.repo = argv[++i] ?? "";
		else if (argv[i] === "--deadline") args.deadlineSeconds = Number(argv[++i]);
		else if (argv[i] === "--grace") args.graceSeconds = Number(argv[++i]);
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	return args;
}

async function main(argv) {
	const args = parseArgs(argv);
	const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
	const gates = gatesForEvent(args.event);
	if (gates.length === 0) {
		const message = `No e2e group gate reports for a ${args.event} run; there is nothing to wait for.`;
		console.log(message);
		if (process.env.GITHUB_STEP_SUMMARY)
			appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
		return 0;
	}
	if (!args.sha || !args.repo || !token)
		throw new Error("a commit, a repository and a token are needed to read the gate check runs");
	const states = await waitForGates({
		gates,
		sha: args.sha,
		repo: args.repo,
		token,
		deadlineSeconds: args.deadlineSeconds,
		graceSeconds: args.graceSeconds,
	});
	const table = renderTable(states);
	console.log(table);
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
	const failed = states.filter((state) => state.state !== "passed");
	if (failed.length > 0) {
		for (const state of failed)
			console.error(`::error::The ${state.gate} gate did not pass: ${state.reason}.`);
		return 1;
	}
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		process.exitCode = await main(process.argv.slice(2));
	} catch (error) {
		console.error(`::error::wait-for-e2e-gates: ${error.message}`);
		process.exitCode = 1;
	}
}
