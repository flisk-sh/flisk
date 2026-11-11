// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How parallel the e2e matrix workflows really run (#3968). For a run: span = first leg start to last leg end,
// longest = the slowest leg, sum = all leg durations. span / longest is 1.0 when every leg runs at once and grows when
// legs wait for a free runner; sum / span is the average number of legs running at the same time.
// Usage: node scripts/scores/ci-parallelism.mjs <run-id> [--repo owner/name]
import { pathToFileURL } from "node:url";
import { ghJson, median, round1 } from "./lib.mjs";

export const meta = {
	id: "ci-parallelism",
	title: "Median span / longest leg of the e2e matrix workflows (merge_group)",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "x",
};

export const TARGET = 1.3;
export const RUNS_PER_WORKFLOW = 5;

// Jobs of each workflow that are not matrix legs: planning, secret check and the gate that only waits.
export const WORKFLOWS = [
	{
		file: "e2e-resource-types.yml",
		nonLegs: ["Plan the resource-type suites", "e2e-resource-types"],
	},
	{
		file: "e2e-journeys.yml",
		nonLegs: [
			"Check the licensed journey secret",
			"Choose the journeys to run",
			"e2e-journeys",
		],
	},
];

const seconds = (from, to) => (new Date(to) - new Date(from)) / 1000;

// Parallelism of one run from its `jobs` (gh run view --json jobs). Skipped and unfinished jobs are not legs.
export function runParallelism(jobs, nonLegs = []) {
	const legs = jobs.filter(
		(j) =>
			!nonLegs.includes(j.name) &&
			j.startedAt &&
			j.completedAt &&
			j.conclusion !== "skipped",
	);
	if (!legs.length) return null;
	const durations = legs.map((j) => seconds(j.startedAt, j.completedAt));
	const start = Math.min(...legs.map((j) => +new Date(j.startedAt)));
	const end = Math.max(...legs.map((j) => +new Date(j.completedAt)));
	const span = (end - start) / 1000;
	const longest = Math.max(...durations);
	const sum = durations.reduce((a, b) => a + b, 0);
	if (!longest || !span) return null;
	return {
		legs: legs.length,
		sum: Math.round(sum),
		longest: Math.round(longest),
		span: Math.round(span),
		spanOverLongest: round1(span / longest),
		average: round1(sum / span),
	};
}

export function runLine(id, p) {
	return `run ${id}: ${p.legs} legs, sum ${p.sum} s, longest ${p.longest} s, span ${p.span} s, span/longest ${p.spanOverLongest}x, ${p.average} legs at once`;
}

export function measure(ctx) {
	const ratios = [];
	const findings = [];
	for (const { file, nonLegs } of WORKFLOWS) {
		const runs = ctx.gh([
			"run",
			"list",
			"--repo",
			ctx.repo,
			"--workflow",
			file,
			"--event",
			"merge_group",
			"--status",
			"completed",
			"--limit",
			String(RUNS_PER_WORKFLOW),
			"--json",
			"databaseId",
		]);
		for (const { databaseId } of runs) {
			const { jobs } = ctx.gh([
				"run",
				"view",
				String(databaseId),
				"--repo",
				ctx.repo,
				"--json",
				"jobs",
			]);
			const p = runParallelism(jobs, nonLegs);
			if (!p) continue;
			ratios.push(p.spanOverLongest);
			if (p.spanOverLongest > TARGET)
				findings.push(`${file} ${runLine(databaseId, p)}`);
		}
	}
	if (!ratios.length)
		return {
			value: null,
			summary: "no completed merge_group e2e run",
			findings: [],
		};
	const over = ratios.filter((r) => r > TARGET).length;
	return {
		value: round1(median(ratios)),
		summary: `n=${ratios.length} runs, ${over} over ${TARGET}x (target: under ${TARGET}x in 4 of 5)`,
		findings,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const args = process.argv.slice(2);
	const i = args.indexOf("--repo");
	const repo = i >= 0 ? args.splice(i, 2)[1] : "flisk-sh/flisk";
	const id = args[0];
	if (!id) {
		console.error(
			"usage: node scripts/scores/ci-parallelism.mjs <run-id> [--repo owner/name]",
		);
		process.exit(2);
	}
	const { jobs, workflowName } = ghJson([
		"run",
		"view",
		id,
		"--repo",
		repo,
		"--json",
		"jobs,workflowName",
	]);
	const nonLegs = WORKFLOWS.flatMap((w) => w.nonLegs);
	const p = runParallelism(jobs, nonLegs);
	console.log(
		p
			? `${workflowName}: ${runLine(id, p)}`
			: `run ${id}: no completed matrix legs`,
	);
}
