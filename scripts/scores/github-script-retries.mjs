// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Every actions/github-script step retries GitHub's transient errors. The action defaults to `retries: 0`, so one 502
// fails the job. MEMORY.md, 2026-10-20: the hall-of-fame search got `POST /graphql - 502` and the run died on GitHub's
// unicorn HTML page. A step passes when it sets `retries:` (the action's own Octokit retry plugin, which retries 5xx
// and leaves 4xx alone) to a number or an expression, or when its script defines its own retry helper (a function or
// const whose name contains "retry", as contributor-merged.yml and hall-of-fame.yml do). Steps are read from
// .github/workflows and the composite actions in .github/actions. A gate at zero.
import YAML from "yaml";
import { read, walk } from "./lib.mjs";
import { workflowFiles } from "./workflow-permissions.mjs";

export const meta = {
	id: "github-script-retries",
	title: "actions/github-script steps that retry transient GitHub errors",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "steps",
};

const IN_SCRIPT_RETRY = /\b(?:async\s+function|function|const|let)\s+\w*retry\w*\b/i;

// Every github-script step of one workflow or action.yml: { line, where, retries, inScript }.
export function githubScriptSteps(text) {
	const counter = new YAML.LineCounter();
	const doc = YAML.parseDocument(String(text), { lineCounter: counter });
	if (doc.errors.length) return { error: String(doc.errors[0].message).split("\n")[0], steps: [] };
	const out = [];
	const visitSteps = (steps, where) => {
		if (!YAML.isSeq(steps)) return;
		for (const step of steps.items) {
			if (!YAML.isMap(step)) continue;
			const uses = step.get("uses");
			if (typeof uses !== "string" || !/^actions\/github-script@/.test(uses)) continue;
			const inputs = step.get("with", true);
			const retries = YAML.isMap(inputs) ? inputs.get("retries") : undefined;
			const script = YAML.isMap(inputs) ? String(inputs.get("script") ?? "") : "";
			out.push({
				line: counter.linePos(step.range?.[0] ?? 0).line,
				where,
				retries: retries === undefined || retries === null ? null : String(retries),
				inScript: IN_SCRIPT_RETRY.test(script),
			});
		}
	};
	const jobs = doc.get("jobs", true);
	if (YAML.isMap(jobs))
		for (const pair of jobs.items) visitSteps(pair.value?.get?.("steps", true), `job ${pair.key.value}`);
	const runs = doc.get("runs", true);
	if (YAML.isMap(runs)) visitSteps(runs.get("steps", true), "composite action");
	return { steps: out };
}

export const retries = (step) => step.inScript || (step.retries !== null && step.retries !== "0");

export function measure({ root }) {
	const files = [...workflowFiles(root), ...walk(root, ".github/actions", (rel) => /\/action\.ya?ml$/.test(rel))];
	const findings = [];
	let total = 0;
	for (const file of files) {
		const { error, steps } = githubScriptSteps(read(root, file));
		if (error) {
			findings.push(`${file}:1 does not parse as YAML (${error})`);
			continue;
		}
		for (const step of steps) {
			total++;
			if (!retries(step)) {
				findings.push(
					`${file}:${step.line} ${step.where}: actions/github-script with ${step.retries === "0" ? "retries: 0" : "no retries:"}; one GitHub 5xx fails the job (set retries: 3)`,
				);
			}
		}
	}
	return {
		value: findings.length,
		summary: `${total} github-script steps, ${findings.length} without a retry`,
		findings,
	};
}
