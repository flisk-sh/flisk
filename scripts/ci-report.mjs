// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Weekly CI cost and health report (#1289, tracker #1279). For each job: run count, p50 and p90 duration, failure,
// cancellation and skip rates, and flaky cases (a failure and a pass of the same job on the same commit). It also reports
// the time from a pull request's push to the aggregate result, and flags every job over its tier's budget:
// gate p90 under 3 minutes, test p90 under 10 minutes, and the pull request aggregate under 25 minutes when e2e suites ran
// and under 10 minutes when none did. Tiers come from .github/ci-inventory.json.
//   node scripts/ci-report.mjs [--days 7] [--max-runs 700] [--json]
// Needs gh with actions: read. Skipped runs are not fetched (a repository's bots produce thousands) and the newest
// --max-runs completed runs are sampled, so the report stays under GITHUB_TOKEN's hourly request limit; the sample size is
// printed in the report.
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadJobs } from "./check-ci-inventory.mjs";

export const BUDGET_SECONDS = { gate: 180, test: 600 };
export const PR_AGGREGATE_SECONDS = { withE2e: 1500, withoutE2e: 600 };
const AGGREGATE_WORKFLOW = "ci.yml";
const E2E_WORKFLOW = "e2e-resource-types.yml";

// Nearest-rank percentile of an ascending list; null for an empty list.
export function percentile(sorted, p) {
	if (sorted.length === 0) return null;
	return sorted[
		Math.min(
			sorted.length - 1,
			Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
		)
	];
}

const seconds = (job) =>
	(new Date(job.completed_at) - new Date(job.started_at)) / 1000;

// Group jobs by workflow file and job name, and compute the rates and percentiles.
export function aggregate(rows) {
	const groups = new Map();
	for (const row of rows) {
		const key = `${row.workflow}\u0000${row.name}`;
		if (!groups.has(key))
			groups.set(key, { workflow: row.workflow, name: row.name, rows: [] });
		groups.get(key).rows.push(row);
	}
	return [...groups.values()].map(({ workflow, name, rows: group }) => {
		const ran = group.filter((r) => r.conclusion !== "skipped");
		const durations = ran
			.filter((r) => r.conclusion === "success" || r.conclusion === "failure")
			.map((r) => r.seconds)
			.filter((s) => Number.isFinite(s) && s >= 0)
			.sort((a, b) => a - b);
		const rate = (c) =>
			group.length === 0
				? 0
				: group.filter((r) => r.conclusion === c).length / group.length;
		return {
			workflow,
			name,
			runs: group.length,
			p50: percentile(durations, 50),
			p90: percentile(durations, 90),
			failure: rate("failure"),
			cancelled: rate("cancelled"),
			skipped: rate("skipped"),
			flaky: flakyCommits(group),
		};
	});
}

// Commits on which this job both failed and passed.
export function flakyCommits(rows) {
	const bySha = new Map();
	for (const r of rows) {
		if (!r.sha) continue;
		const set = bySha.get(r.sha) ?? new Set();
		set.add(r.conclusion);
		bySha.set(r.sha, set);
	}
	return [...bySha.values()].filter(
		(set) => set.has("failure") && set.has("success"),
	).length;
}

// Time from a pull request run's start to its aggregate job finishing, split by whether e2e suites ran for that commit.
export function prAggregates(prRuns) {
	const withE2e = [];
	const withoutE2e = [];
	for (const run of prRuns) {
		if (!Number.isFinite(run.seconds) || run.seconds < 0) continue;
		(run.e2e ? withE2e : withoutE2e).push(run.seconds);
	}
	const stat = (list) => {
		const sorted = list.sort((a, b) => a - b);
		return {
			runs: sorted.length,
			p50: percentile(sorted, 50),
			p90: percentile(sorted, 90),
		};
	};
	return { withE2e: stat(withE2e), withoutE2e: stat(withoutE2e) };
}

// Every job over its tier's budget. tierOf(workflow, name) returns the tier or undefined.
export function overBudget(stats, tierOf) {
	return stats
		.map((s) => ({ ...s, tier: tierOf(s.workflow, s.name) }))
		.filter(
			(s) =>
				s.tier in BUDGET_SECONDS &&
				s.p90 !== null &&
				s.p90 > BUDGET_SECONDS[s.tier],
		)
		.map((s) => ({
			workflow: s.workflow,
			name: s.name,
			tier: s.tier,
			p90: s.p90,
			budget: BUDGET_SECONDS[s.tier],
		}));
}

const fmt = (s) =>
	s === null ? "-" : s < 90 ? `${Math.round(s)}s` : `${(s / 60).toFixed(1)}m`;
const pct = (r) => `${Math.round(r * 100)}%`;

export function render({
	days,
	sampled,
	totalRuns,
	stats,
	over,
	prAgg,
	tierOf,
}) {
	const lines = [`## CI report, last ${days} days`, ""];
	lines.push(
		`Based on ${sampled} completed runs of ${totalRuns} in the window (skipped runs are not fetched; the newest are sampled; the API lists at most 1000 runs per query).`,
		"",
	);
	lines.push("### Over budget", "");
	const prFlags = [];
	if (
		prAgg.withE2e.p90 !== null &&
		prAgg.withE2e.p90 > PR_AGGREGATE_SECONDS.withE2e
	)
		prFlags.push(
			`PR aggregate with e2e: p90 ${fmt(prAgg.withE2e.p90)} over ${fmt(PR_AGGREGATE_SECONDS.withE2e)}`,
		);
	if (
		prAgg.withoutE2e.p90 !== null &&
		prAgg.withoutE2e.p90 > PR_AGGREGATE_SECONDS.withoutE2e
	)
		prFlags.push(
			`PR aggregate without e2e: p90 ${fmt(prAgg.withoutE2e.p90)} over ${fmt(PR_AGGREGATE_SECONDS.withoutE2e)}`,
		);
	if (over.length === 0 && prFlags.length === 0) {
		lines.push(
			"No job or pull request aggregate is over its tier's budget.",
			"",
		);
	} else {
		for (const o of over)
			lines.push(
				`- \`${o.workflow}\` ${o.name} (${o.tier}): p90 ${fmt(o.p90)}, budget ${fmt(o.budget)}`,
			);
		for (const f of prFlags) lines.push(`- ${f}`);
		lines.push("");
	}
	lines.push("### Pull request time to the aggregate result", "");
	lines.push("| | runs | p50 | p90 | budget |", "|---|---|---|---|---|");
	lines.push(
		`| with e2e suites | ${prAgg.withE2e.runs} | ${fmt(prAgg.withE2e.p50)} | ${fmt(prAgg.withE2e.p90)} | ${fmt(PR_AGGREGATE_SECONDS.withE2e)} |`,
	);
	lines.push(
		`| without | ${prAgg.withoutE2e.runs} | ${fmt(prAgg.withoutE2e.p50)} | ${fmt(prAgg.withoutE2e.p90)} | ${fmt(PR_AGGREGATE_SECONDS.withoutE2e)} |`,
		"",
	);
	lines.push(
		"### Per job",
		"",
		"| workflow | job | tier | runs | p50 | p90 | failed | cancelled | skipped | flaky |",
		"|---|---|---|---|---|---|---|---|---|---|",
	);
	for (const s of [...stats].sort((a, b) => b.runs - a.runs)) {
		lines.push(
			`| ${s.workflow} | ${s.name} | ${tierOf(s.workflow, s.name) ?? "-"} | ${s.runs} | ${fmt(s.p50)} | ${fmt(s.p90)} | ${pct(s.failure)} | ${pct(s.cancelled)} | ${pct(s.skipped)} | ${s.flaky} |`,
		);
	}
	return lines.join("\n");
}

function gh(args) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	});
}

function repoName() {
	return process.env.GITHUB_REPOSITORY ?? "flisk-sh/flisk";
}

function fetchRuns(days) {
	const since = new Date(Date.now() - days * 86400 * 1000)
		.toISOString()
		.slice(0, 10);
	const pages = JSON.parse(
		`[${gh([
			"api",
			"--paginate",
			`repos/${repoName()}/actions/runs?per_page=100&status=completed&created=>=${since}`,
			"--jq",
			".workflow_runs[] | {id, path, event, head_sha, conclusion, created_at}",
		])
			.trim()
			.split("\n")
			.filter(Boolean)
			.join(",")}]`,
	);
	return pages;
}

async function fetchJobs(runId) {
	const { stdout } = await promisify(execFile)(
		"gh",
		[
			"api",
			`repos/${repoName()}/actions/runs/${runId}/jobs?per_page=100&filter=latest`,
			"--jq",
			".jobs[] | {name, conclusion, started_at, completed_at}",
		],
		{ maxBuffer: 64 * 1024 * 1024 },
	);
	return JSON.parse(`[${stdout.trim().split("\n").filter(Boolean).join(",")}]`);
}

// Run fn over items with at most `limit` in flight, keeping the results in order.
export async function mapPool(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i]).catch(() => null);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	return results;
}

async function main(argv) {
	const opt = { days: 7, maxRuns: 700, json: false };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--days") opt.days = Number(argv[++i]);
		else if (argv[i] === "--max-runs") opt.maxRuns = Number(argv[++i]);
		else if (argv[i] === "--json") opt.json = true;
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const inventory = JSON.parse(
		readFileSync(path.join(root, ".github", "ci-inventory.json"), "utf8"),
	).jobs;
	const declared = loadJobs(path.join(root, ".github", "workflows"));
	const tierByJob = new Map();
	for (const entry of inventory) {
		const job = declared.find(
			(j) => j.workflow === entry.workflow && j.job === entry.job,
		);
		if (job)
			tierByJob.set(`${entry.workflow}\u0000${job.checkName}`, entry.tier);
	}
	const tierOf = (workflow, name) => tierByJob.get(`${workflow}\u0000${name}`);

	const allRuns = fetchRuns(opt.days);
	const candidates = allRuns
		.filter((r) => r.conclusion !== "skipped")
		.sort((a, b) => b.created_at.localeCompare(a.created_at))
		.slice(0, opt.maxRuns);
	const rows = [];
	const prBySha = new Map(); // sha -> { start, endCi, endE2e } for pull request runs
	const fetched = await mapPool(candidates, 10, (run) => fetchJobs(run.id));
	for (const [index, run] of candidates.entries()) {
		const workflow = path.basename(run.path ?? "");
		const jobs = fetched[index];
		if (!jobs) continue;
		for (const job of jobs) {
			if (!job.started_at || !job.completed_at) continue;
			rows.push({
				workflow,
				name: job.name,
				conclusion: job.conclusion,
				seconds: seconds(job),
				sha: run.head_sha,
			});
		}
		if (
			run.event === "pull_request" &&
			(workflow === AGGREGATE_WORKFLOW || workflow === E2E_WORKFLOW)
		) {
			const entry = prBySha.get(run.head_sha) ?? { start: run.created_at };
			if (run.created_at < entry.start) entry.start = run.created_at;
			const marker =
				workflow === AGGREGATE_WORKFLOW
					? jobs.find((j) => j.name.includes("Summary") && j.completed_at)
					: jobs.find((j) => j.name === "e2e-resource-types" && j.completed_at);
			if (marker)
				entry[workflow === AGGREGATE_WORKFLOW ? "endCi" : "endE2e"] =
					marker.completed_at;
			prBySha.set(run.head_sha, entry);
		}
	}
	// The aggregate result is the later of the CI summary and, when e2e suites ran, the e2e gate.
	const prRuns = [...prBySha.entries()]
		.filter(([, e]) => e.endCi || e.endE2e)
		.map(([sha, e]) => {
			const end = [e.endCi, e.endE2e].filter(Boolean).sort().at(-1);
			return {
				sha,
				e2e: Boolean(e.endE2e),
				seconds: (new Date(end) - new Date(e.start)) / 1000,
			};
		});
	const stats = aggregate(rows);
	const over = overBudget(stats, tierOf);
	const prAgg = prAggregates(prRuns);
	const report = {
		days: opt.days,
		sampled: candidates.length,
		totalRuns: allRuns.length,
		stats,
		over,
		prAgg,
		tierOf,
	};
	console.log(
		opt.json
			? JSON.stringify({ ...report, tierOf: undefined }, null, 2)
			: render(report),
	);
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = await main(process.argv.slice(2));
}
