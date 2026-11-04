// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Pull request CI stays fast. The org shares about 20 concurrent hosted runners, so CI time on a busy day is queue time:
// on 2026-11-01, updating ten pull request branches queued 69 workflow runs behind 14 running ones. Two rules keep the
// queue short, for every workflow that `pull_request` or `merge_group` triggers:
//   1. A top-level `concurrency:` whose `cancel-in-progress` is not `false`, so a new push cancels the run it replaces
//      instead of holding runners for a commit nobody will merge. An expression (`${{ ... }}`) counts as set.
//   2. Every job's `timeout-minutes` is at most MAX_JOB_MINUTES. A longer job belongs in a scheduled or release workflow.
//      An expression counts as within budget (`schedule && 60 || 30`); workflow-timeouts already fails a job with no
//      timeout at all. A job on a self-hosted runner is exempt: it does not take a hosted runner from the shared pool.
// Gate at zero.
import { read } from "./lib.mjs";
import { parseWorkflow, workflowFiles } from "./workflow-permissions.mjs";

export const MAX_JOB_MINUTES = 30;

export const meta = {
	id: "workflow-pr-speed",
	title: "Pull request workflows that cancel superseded runs and keep jobs under 30 minutes",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "problems",
};

// The events a workflow's `on:` names, whether it is a string, a list or a map.
export function triggers(workflow) {
	const on = workflow.keys.get("on")?.value ?? workflow.keys.get("true")?.value;
	if (typeof on === "string") return [on];
	if (Array.isArray(on)) return on.map(String);
	return on && typeof on === "object" ? Object.keys(on) : [];
}

const isExpression = (v) => typeof v === "string" && v.includes("${{");
const selfHosted = (job) => {
	const runsOn = job.keys.get("runs-on")?.value;
	return (Array.isArray(runsOn) ? runsOn : [runsOn]).includes("self-hosted");
};

export function speedProblems(file, workflow) {
	if (workflow.error) return [`${file}:1 does not parse as YAML (${workflow.error})`];
	const events = triggers(workflow);
	if (!events.includes("pull_request") && !events.includes("merge_group")) return [];
	const out = [];
	const concurrency = workflow.keys.get("concurrency");
	const cancel = concurrency?.value?.["cancel-in-progress"];
	if (!concurrency) out.push(`${file}:1 runs on pull requests with no top-level concurrency: (superseded runs keep their runners)`);
	else if (cancel === undefined || cancel === false || cancel === "false")
		out.push(`${file}:${concurrency.line} concurrency does not set cancel-in-progress (superseded runs keep their runners)`);
	for (const job of workflow.jobs) {
		const t = job.keys.get("timeout-minutes");
		if (!t || isExpression(t.value) || selfHosted(job)) continue;
		if (Number(t.value) > MAX_JOB_MINUTES)
			out.push(`${file}:${t.line} job ${job.id} timeout-minutes ${t.value} is over the ${MAX_JOB_MINUTES}-minute pull request budget`);
	}
	return out;
}

export function measure({ root }) {
	let checked = 0;
	const findings = [];
	for (const file of workflowFiles(root)) {
		const workflow = parseWorkflow(read(root, file));
		const problems = speedProblems(file, workflow);
		if (workflow.error || triggers(workflow).some((e) => e === "pull_request" || e === "merge_group")) checked++;
		findings.push(...problems);
	}
	return {
		value: findings.length,
		summary: `${checked} pull request workflows, ${findings.length} that hold runners longer than they need`,
		findings,
	};
}
