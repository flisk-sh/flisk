// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every job in .github/workflows/*.yml sets `timeout-minutes`. Without one a hung job (a container that never turns
// healthy, a prompt waiting for input, a network call with no deadline) holds a runner for GitHub's default of six
// hours, blocks the merge queue behind it and is billed for all of it. A job that only `uses:` a reusable workflow is
// exempt: GitHub rejects timeout-minutes there, and the called workflow's jobs carry their own. A job-level
// expression (`${{ inputs.timeout }}`) counts as set; step-level timeouts do not, since the job can still hang
// between them. scripts/check-ci-inventory.mjs fails on the same rule for jobs not exempted in ci-inventory.json; this
// counts every one, exempt or not. Gate at zero: every job has one today.
import { read } from "./lib.mjs";
import { parseWorkflow, workflowFiles } from "./workflow-permissions.mjs";

export const meta = {
	id: "workflow-timeouts",
	title: "Workflow jobs with no timeout-minutes",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "jobs",
};

// Jobs as { id, line, reusable, timeout } for one parsed workflow.
export function jobTimeouts(workflow) {
	return (workflow.jobs ?? []).map((job) => ({
		id: job.id,
		line: job.line,
		reusable: job.keys.has("uses"),
		timeout: job.keys.has("timeout-minutes"),
	}));
}

export function measure({ root }) {
	const findings = [];
	let total = 0;
	let reusable = 0;
	for (const file of workflowFiles(root)) {
		const workflow = parseWorkflow(read(root, file));
		if (workflow.error) {
			findings.push(`${file}:1 does not parse as YAML (${workflow.error})`);
			continue;
		}
		for (const job of jobTimeouts(workflow)) {
			total++;
			if (job.reusable) reusable++;
			else if (!job.timeout) findings.push(`${file}:${job.line} job ${job.id} has no timeout-minutes`);
		}
	}
	return {
		value: findings.length,
		summary: `${total} jobs (${reusable} reusable-workflow calls exempt), ${findings.length} without timeout-minutes`,
		findings,
	};
}
