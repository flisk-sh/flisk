// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Tests for the e2e gate expectations: the gate list per CI event, and the rule that a gate is only waited for when its
// workflow can report for that event (#1816).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadJobs } from "./check-ci-inventory.mjs";
import {
	GATES,
	GATES_BY_EVENT,
	gatesForEvent,
	workflowForGate,
} from "./e2e-gate-expectations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const JOBS = loadJobs(WORKFLOWS);

function readWorkflow(file) {
	return YAML.parse(readFileSync(path.join(WORKFLOWS, file), "utf8")) ?? {};
}

// The job that reports a gate, with the triggers of the workflow it lives in.
function gateJob(gate) {
	const meta = GATES[gate];
	return JOBS.find(
		(job) => job.workflow === meta.workflow && job.checkName === meta.job,
	);
}

test("a pull request and a merge queue entry wait for every gate", () => {
	for (const event of ["pull_request", "merge_group"]) {
		assert.deepEqual(gatesForEvent(event), [
			"e2e-journeys",
			"e2e-examples",
			"e2e-platforms",
		]);
	}
});

test("a push to main waits for the journeys gate only", () => {
	// The examples and platforms workflows have no push trigger, so their gates never report on main.
	assert.deepEqual(gatesForEvent("push"), ["e2e-journeys"]);
});

test("a manual dispatch of the CI workflow waits for nothing", () => {
	// Dispatching ci.yml starts no sibling workflow, so no gate reports for that run.
	assert.deepEqual(gatesForEvent("workflow_dispatch"), []);
});

test("an event the CI workflow does not have waits for nothing", () => {
	assert.deepEqual(gatesForEvent("schedule"), []);
	assert.deepEqual(gatesForEvent(""), []);
});

test("every gate names a workflow and every workflow exists", () => {
	for (const [gate, meta] of Object.entries(GATES)) {
		assert.equal(typeof meta.workflow, "string");
		assert.equal(typeof meta.job, "string");
		assert.equal(workflowForGate(gate), meta.workflow);
	}
	assert.equal(workflowForGate("e2e-nothing"), null);
});

test("every gate is waited for by at least one event", () => {
	const waited = new Set(Object.values(GATES_BY_EVENT).flat());
	for (const gate of Object.keys(GATES)) assert.ok(waited.has(gate), `${gate} is never waited for`);
});

test("a gate is only waited for when its workflow triggers on that event", () => {
	for (const [event, gates] of Object.entries(GATES_BY_EVENT)) {
		for (const gate of gates) {
			const job = gateJob(gate);
			assert.ok(job, `${workflowForGate(gate)} has no job named ${GATES[gate].job}`);
			assert.ok(
				job.triggers.includes(event),
				`${workflowForGate(gate)} does not trigger on ${event}, so ${gate} cannot report`,
			);
		}
	}
});

test("the gate workflow has the job that reports the gate name", () => {
	for (const gate of Object.keys(GATES)) {
		assert.ok(gateJob(gate), `${workflowForGate(gate)} has no job named ${GATES[gate].job}`);
	}
});

test("the push trigger of the journeys workflow matches the CI workflow", () => {
	// The CI workflow runs on a push to main, so the journeys gate only reports when the journeys workflow does too.
	const ci = readWorkflow("ci.yml");
	const journeys = readWorkflow("e2e-journeys.yml");
	assert.deepEqual(ci.on.push.branches, journeys.on.push.branches);
});

test("the CI summary job reads the gate list from the script", () => {
	// The list must not be written into the workflow a second time, or the two can drift apart.
	const ci = readFileSync(path.join(WORKFLOWS, "ci.yml"), "utf8");
	assert.match(ci, /wait-for-e2e-gates\.mjs/);
	assert.doesNotMatch(ci, /E2E_GATES:.*e2e-examples/);
});
