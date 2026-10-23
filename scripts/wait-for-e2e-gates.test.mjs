// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Tests for the e2e gate wait: how a gate's state is read, when the wait gives up and what the summary table says (#1816).
import assert from "node:assert/strict";
import test from "node:test";
import {
	apiGet,
	gateStates,
	latestAttempt,
	neverReporting,
	pendingGates,
	renderTable,
	waitForGates,
	workflowStarted,
} from "./wait-for-e2e-gates.mjs";

// A clock the test drives, so the wait never sleeps for real.
function fakeClock() {
	let time = 0;
	return {
		now: () => time,
		sleep: async (seconds) => {
			time += seconds * 1000;
		},
	};
}

const checkRun = (name, status, conclusion, startedAt, id = 1) => ({
	name,
	status,
	conclusion,
	started_at: startedAt,
	id,
});

test("the latest attempt of a gate wins over the ones before it", () => {
	const runs = [
		checkRun("e2e-examples", "completed", "failure", "2026-10-21T10:00:00Z", 1),
		checkRun("e2e-examples", "completed", "success", "2026-10-21T11:00:00Z", 2),
	];
	assert.equal(latestAttempt(runs).conclusion, "success");
});

test("a re-run of a gate that starts in the same second wins on the id", () => {
	const runs = [
		checkRun("e2e-examples", "completed", "failure", "2026-10-21T10:00:00Z", 7),
		checkRun("e2e-examples", "completed", "success", "2026-10-21T10:00:00Z", 8),
	];
	assert.equal(latestAttempt(runs).conclusion, "success");
});

test("a gate that passed or was skipped passes", () => {
	const states = gateStates(
		[
			checkRun("e2e-journeys", "completed", "success", "2026-10-21T10:00:00Z"),
			checkRun("e2e-examples", "completed", "skipped", "2026-10-21T10:00:00Z"),
		],
		["e2e-journeys", "e2e-examples", "e2e-platforms"],
	);
	assert.equal(states[0].state, "passed");
	assert.equal(states[1].state, "passed");
	assert.equal(states[2].state, "missing");
});

test("a gate that failed or was cancelled fails", () => {
	const states = gateStates(
		[
			checkRun("e2e-journeys", "completed", "failure", "2026-10-21T10:00:00Z"),
			checkRun("e2e-examples", "completed", "cancelled", "2026-10-21T10:00:00Z"),
		],
		["e2e-journeys", "e2e-examples"],
	);
	assert.equal(states[0].state, "failed");
	assert.equal(states[1].state, "failed");
});

test("a gate that has not finished is running, not failed", () => {
	const states = gateStates(
		[checkRun("e2e-journeys", "in_progress", null, "2026-10-21T10:00:00Z")],
		["e2e-journeys"],
	);
	assert.equal(states[0].state, "running");
	assert.deepEqual(
		pendingGates(states).map((state) => state.gate),
		["e2e-journeys"],
	);
});

test("a workflow that started a run for the commit can still report", () => {
	const runs = [{ path: ".github/workflows/e2e-examples.yml", status: "queued" }];
	assert.equal(workflowStarted(runs, "e2e-examples.yml"), true);
	assert.equal(workflowStarted(runs, "e2e-platforms.yml"), false);
});

test("a missing gate whose workflow never started can never report", () => {
	const states = [
		{ gate: "e2e-examples", state: "missing" },
		{ gate: "e2e-platforms", state: "running" },
	];
	const lost = neverReporting(states, []);
	assert.deepEqual(
		lost.map((state) => state.gate),
		["e2e-examples"],
	);
});

test("the wait ends as soon as every gate has finished", async () => {
	const clock = fakeClock();
	let calls = 0;
	const states = await waitForGates({
		gates: ["e2e-journeys"],
		sha: "abc",
		repo: "flisk-sh/flisk",
		token: "token",
		now: clock.now,
		sleep: clock.sleep,
		fetchRuns: async () => {
			calls += 1;
			return [checkRun("e2e-journeys", "completed", "success", "2026-10-21T10:00:00Z")];
		},
	});
	assert.equal(calls, 1);
	assert.equal(states[0].state, "passed");
});

test("the wait polls until a running gate finishes", async () => {
	const clock = fakeClock();
	let calls = 0;
	const states = await waitForGates({
		gates: ["e2e-journeys"],
		sha: "abc",
		repo: "flisk-sh/flisk",
		token: "token",
		pollSeconds: 15,
		now: clock.now,
		sleep: clock.sleep,
		fetchRuns: async () => {
			calls += 1;
			if (calls < 3)
				return [checkRun("e2e-journeys", "in_progress", null, "2026-10-21T10:00:00Z")];
			return [checkRun("e2e-journeys", "completed", "success", "2026-10-21T10:00:00Z")];
		},
	});
	assert.equal(calls, 3);
	assert.equal(states[0].state, "passed");
});

test("the wait gives up early when the gate workflow never started", async () => {
	const clock = fakeClock();
	const states = await waitForGates({
		gates: ["e2e-examples"],
		sha: "abc",
		repo: "flisk-sh/flisk",
		token: "token",
		graceSeconds: 60,
		pollSeconds: 15,
		deadlineSeconds: 1800,
		now: clock.now,
		sleep: clock.sleep,
		fetchRuns: async () => [],
		fetchWorkflows: async () => [],
	});
	assert.equal(states[0].state, "missing");
	assert.match(states[0].reason, /never started/);
	// Four polls of 15 seconds, not the whole half hour.
	assert.equal(clock.now() / 1000, 60);
});

test("the wait keeps going while the gate workflow has a run", async () => {
	const clock = fakeClock();
	const states = await waitForGates({
		gates: ["e2e-examples"],
		sha: "abc",
		repo: "flisk-sh/flisk",
		token: "token",
		graceSeconds: 60,
		pollSeconds: 15,
		deadlineSeconds: 60,
		now: clock.now,
		sleep: clock.sleep,
		fetchRuns: async () => [],
		fetchWorkflows: async () => [{ path: ".github/workflows/e2e-examples.yml" }],
	});
	assert.equal(states[0].state, "missing");
	assert.match(states[0].reason, /no check run/);
	assert.equal(clock.now() / 1000, 60);
});

test("the table names every gate and its result", () => {
	const table = renderTable([
		{ gate: "e2e-journeys", state: "passed", conclusion: "success" },
		{ gate: "e2e-examples", state: "failed", conclusion: "failure" },
		{ gate: "e2e-platforms", state: "missing", conclusion: null },
	]);
	assert.match(table, /\| e2e-journeys \| ✅ passed \(success\) \|/);
	assert.match(table, /\| e2e-examples \| ❌ failed \(failure\) \|/);
	assert.match(table, /\| e2e-platforms \| ⚠️ missing \|/);
});

test("a server error is retried and a client error is not", async () => {
	const original = globalThis.fetch;
	let calls = 0;
	globalThis.fetch = async () => {
		calls += 1;
		if (calls < 3) return { ok: false, status: 500, text: async () => "boom" };
		return { ok: true, status: 200, json: async () => ({ ok: true }) };
	};
	try {
		const payload = await apiGet("/repos/flisk-sh/flisk", "token", {
			sleep: async () => {},
		});
		assert.deepEqual(payload, { ok: true });
		assert.equal(calls, 3);
	} finally {
		globalThis.fetch = original;
	}

	globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => "missing" });
	try {
		await assert.rejects(
			() => apiGet("/repos/flisk-sh/flisk", "token", { sleep: async () => {} }),
			/404/,
		);
	} finally {
		globalThis.fetch = original;
	}
});
