// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import test from "node:test";
import { analyze, format } from "./startup-analysis.mjs";

const at = (s) => new Date(Date.UTC(2026, 9, 31, 0, 0, s)).toISOString();
const built = (name, from, to, error) => ({
	metadata: { name },
	status: { updateStatus: error ? "error" : "ok", buildHistory: [{ startTime: at(from), finishTime: at(to), ...(error ? { error } : {}) }] },
});
const waiting = (name) => ({ metadata: { name }, status: { updateStatus: "pending" } });

test("reports wall time, parallelism and idle time", () => {
	const text = JSON.stringify({ items: [built("a", 0, 10), built("b", 0, 10), built("c", 20, 30)] });
	const r = analyze(text);
	assert.equal(r.wallSeconds, 30);
	assert.equal(r.parallelism, 1);
	assert.equal(r.idleSeconds, 10);
	assert.equal(r.slowest[0].seconds, 10);
});

test("a failure with pending resources is reported as stuck, not slow", () => {
	const text = JSON.stringify({ items: [built("init-networks", 0, 1, "exit status 1"), built("golden", 0, 160), waiting("traefik"), waiting("postgres")] });
	const r = analyze(text);
	assert.deepEqual(r.failed, ["init-networks"]);
	assert.deepEqual(r.blocked, ["traefik", "postgres"]);
	assert.match(format(r), /stuck/);
});

test("counts a build still running up to now", () => {
	const text = JSON.stringify({ items: [{ metadata: { name: "slow" }, status: { currentBuild: { startTime: at(0) } } }] });
	const r = analyze(text, Date.UTC(2026, 9, 31, 0, 0, 90));
	assert.equal(r.slowest[0].seconds, 90);
	assert.equal(r.slowest[0].running, true);
});

test("an empty project gives a zero report", () => {
	assert.equal(analyze(JSON.stringify({ items: [] })).wallSeconds, 0);
});
