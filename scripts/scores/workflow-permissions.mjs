// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The GITHUB_TOKEN of every workflow is least-privilege: each .github/workflows/*.yml declares a top-level
// `permissions:` (without one a job inherits the repository default, which may be read and write on everything), and
// no workflow or job grants `write-all`. A compromised step or a poisoned dependency can only do what the token lets
// it, so this is the OpenSSF Scorecard Token-Permissions check, run on every pull request instead of once a week.
// A job narrows or widens the scopes it needs under its own `permissions:`; that is the intended pattern, not a
// finding. Gate at zero.
import YAML from "yaml";
import { read, walk } from "./lib.mjs";

export const meta = {
	id: "workflow-permissions",
	title: "Workflows declare least-privilege token permissions",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "problems",
};

export const workflowFiles = (root) => walk(root, ".github/workflows", (rel) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel));

// A workflow as { error } when it does not parse, or { keys: Map(key -> { line, value }), jobs: [{ id, line, keys }] }
// with 1-based lines, so a finding can point at the key it is about.
export function parseWorkflow(text) {
	const counter = new YAML.LineCounter();
	const doc = YAML.parseDocument(String(text), { lineCounter: counter });
	if (doc.errors.length) return { error: String(doc.errors[0].message).split("\n")[0] };
	const entries = (node) =>
		new Map(
			(YAML.isMap(node) ? node.items : []).map((pair) => [
				String(pair.key?.value ?? pair.key),
				{
					line: counter.linePos(pair.key?.range?.[0] ?? 0).line,
					value: typeof pair.value?.toJSON === "function" ? pair.value.toJSON() : null,
					node: pair.value,
				},
			]),
		);
	const keys = entries(doc.contents);
	const jobs = [...entries(keys.get("jobs")?.node)].map(([id, job]) => ({ id, line: job.line, keys: entries(job.node) }));
	return { keys, jobs };
}

export function permissionProblems(file, workflow) {
	if (workflow.error) return [`${file}:1 does not parse as YAML (${workflow.error})`];
	const out = [];
	const top = workflow.keys.get("permissions");
	if (!top) out.push(`${file}:1 no top-level permissions: (the token gets the repository default)`);
	else if (top.value === "write-all") out.push(`${file}:${top.line} top-level permissions: write-all`);
	for (const job of workflow.jobs) {
		const p = job.keys.get("permissions");
		if (p?.value === "write-all") out.push(`${file}:${p.line} job ${job.id}: permissions: write-all`);
	}
	return out;
}

export function measure({ root }) {
	const files = workflowFiles(root);
	const findings = files.flatMap((file) => permissionProblems(file, parseWorkflow(read(root, file))));
	return {
		value: findings.length,
		summary: `${files.length} workflows, ${findings.length} without least-privilege token permissions`,
		findings,
	};
}
