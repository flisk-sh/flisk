// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { WINDOW_DAYS, cycleHours, measure, mergedPulls } from "./cycle-time.mjs";

const NOW = new Date("2026-11-02T12:00:00Z");
const HOUR = 3600 * 1000;
const ago = (days, hours = 0) => new Date(NOW.getTime() - (days * 24 + hours) * HOUR).toISOString();

// Fake GitHub GraphQL API for PR queries.
function fakeGh(prs, capped = false) {
	return (args) => {
		assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
		const q = args[3].replace(/^query=/, "");
		assert.match(q, /pullRequests\(first: 100/);
		const edges = prs.map((pr) => ({
			node: {
				number: pr.number,
				title: pr.title,
				createdAt: pr.createdAt,
				mergedAt: pr.mergedAt,
				linkedIssues: pr.linkedIssues ? { nodes: [{ number: pr.linkedIssues }] } : { nodes: [] },
			},
		}));
		return {
			data: {
				repository: {
					pullRequests: {
						totalCount: prs.length,
						pageInfo: { hasNextPage: capped, endCursor: "cursor" },
						edges,
					},
				},
			},
		};
	};
}

test("cycleHours calculates hours between created and merged", () => {
	const created = new Date("2026-10-28T10:00:00Z");
	const merged = new Date("2026-10-30T16:00:00Z");
	assert.equal(cycleHours(created, merged), 54);
});

test("cycleHours returns 0 for same instant", () => {
	const time = new Date("2026-10-28T10:00:00Z");
	assert.equal(cycleHours(time, time), 0);
});

test("mergedPulls fetches and filters PRs merged within 30 days", () => {
	const prs = [
		{
			number: 1,
			title: "New feature",
			createdAt: ago(20, 12),
			mergedAt: ago(5, 6),
			linkedIssues: 100,
		},
		{
			number: 2,
			title: "Bug fix",
			createdAt: ago(15),
			mergedAt: ago(2),
			linkedIssues: null,
		},
		{
			number: 3,
			title: "Old PR",
			createdAt: ago(40),
			mergedAt: ago(35),
			linkedIssues: 200,
		},
	];
	const result = mergedPulls(fakeGh(prs), "flisk-sh/flisk", NOW);
	assert.equal(result.nodes.length, 2);
	assert.equal(result.nodes[0].number, 1);
	assert.equal(result.nodes[1].number, 2);
	assert.equal(result.capped, false);
});

test("mergedPulls excludes unmerged PRs", () => {
	const prs = [
		{ number: 1, title: "Merged", createdAt: ago(10), mergedAt: ago(5), linkedIssues: 100 },
		{ number: 2, title: "Still open", createdAt: ago(10), mergedAt: null, linkedIssues: 100 },
	];
	const result = mergedPulls(fakeGh(prs), "flisk-sh/flisk", NOW);
	assert.equal(result.nodes.length, 1);
	assert.equal(result.nodes[0].number, 1);
});

test("measure returns median, p90, and findings for merged PRs", () => {
	const prs = [
		{ number: 1, title: "Fast merge", createdAt: ago(20, 12), mergedAt: ago(20), linkedIssues: 100 },
		{ number: 2, title: "Medium merge", createdAt: ago(15), mergedAt: ago(10), linkedIssues: 101 },
		{ number: 3, title: "Slow merge 1", createdAt: ago(10), mergedAt: ago(3), linkedIssues: 102 },
		{ number: 4, title: "Slow merge 2", createdAt: ago(8), mergedAt: ago(1), linkedIssues: 103 },
		{ number: 5, title: "Unlinked", createdAt: ago(7), mergedAt: ago(2), linkedIssues: null },
	];
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs) });
	assert.equal(typeof result.value, "number");
	assert(result.value > 0);
	assert.match(result.summary, /n=5, median \d+ h, p90 \d+ h; 1 with no linked issue/);
	assert.equal(Array.isArray(result.findings), true);
	assert(result.findings.length <= 5);
	for (const finding of result.findings) {
		assert.match(finding, /#\d+ took \d+ h to merge/);
	}
});

test("measure returns null value and summary when no PRs merged in 30 days", () => {
	const prs = [];
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs) });
	assert.equal(result.value, null);
	assert.equal(result.summary, "no pull request merged in 30 days");
	assert.deepEqual(result.findings, []);
});

test("measure includes cap status in summary when API is capped", () => {
	const prs = Array.from({ length: 100 }, (_, i) => ({
		number: i + 1,
		title: `PR ${i + 1}`,
		createdAt: ago(25),
		mergedAt: ago(10 + (i % 20)),
		linkedIssues: 100 + i,
	}));
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs, true) });
	assert.match(result.summary, /; capped at 1000 results$/);
});

test("measure counts only slow PRs (> 24h) in findings", () => {
	const prs = [
		{ number: 1, title: "Fast", createdAt: ago(1), mergedAt: ago(0.5), linkedIssues: 100 },
		{ number: 2, title: "Slow", createdAt: ago(10), mergedAt: ago(5), linkedIssues: 101 },
		{ number: 3, title: "Very slow", createdAt: ago(15), mergedAt: ago(8), linkedIssues: 102 },
	];
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs) });
	assert(result.findings.length <= 2);
	for (const finding of result.findings) {
		assert.match(finding, /#\d+ took \d+ h to merge/);
	}
});

test("findings are ordered slowest first, limited to 5 items", () => {
	const prs = Array.from({ length: 10 }, (_, i) => ({
		number: i + 1,
		title: `PR ${i + 1}`,
		createdAt: ago(20 + i),
		mergedAt: ago(10 + i),
		linkedIssues: 100 + i,
	}));
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs) });
	assert(result.findings.length <= 5);
	const hours = result.findings.map((f) => {
		const match = f.match(/took (\d+) h/);
		return match ? parseInt(match[1]) : 0;
	});
	for (let i = 1; i < hours.length; i++) {
		assert(hours[i] <= hours[i - 1], "findings should be ordered slowest first");
	}
});

test("PR created and merged on day boundaries", () => {
	const prs = [
		{
			number: 1,
			title: "Day boundary",
			createdAt: new Date("2026-10-28T23:59:00Z").toISOString(),
			mergedAt: new Date("2026-10-29T00:01:00Z").toISOString(),
			linkedIssues: 100,
		},
	];
	const result = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs) });
	assert.equal(typeof result.value, "number");
	assert(result.value < 1);
	assert.match(result.summary, /n=1, median 0 h, p90 0 h; 0 with no linked issue/);
});
