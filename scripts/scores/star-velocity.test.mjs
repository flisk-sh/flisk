// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_PAGES, measure, starsSince } from "./star-velocity.mjs";

const NOW = new Date("2026-10-28T12:00:00Z");
const HOUR = 3600 * 1000;
// An ISO time `h` hours before NOW.
const ago = (h) => new Date(NOW.getTime() - h * HOUR).toISOString().replace(".000", "");

// A fake `gh api graphql` serving stargazers newest first, 100 to a page, like repository.stargazers(first: 100, DESC).
function fakeGh(starTimes, total = starTimes.length, calls = []) {
	return (args) => {
		assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
		const q = args[3].replace(/^query=/, "");
		assert.match(q, /stargazers\(first: 100, orderBy: \{field: STARRED_AT, direction: DESC\}/);
		const after = /after: "([^"]*)"/.exec(q)?.[1];
		calls.push(after ?? null);
		const start = after ? Number(Buffer.from(after, "base64").toString()) : 0;
		const edges = starTimes.slice(start, start + 100).map((starredAt) => ({ starredAt }));
		const end = start + edges.length;
		const hasNextPage = end < starTimes.length;
		return {
			data: {
				repository: {
					stargazers: {
						totalCount: total,
						pageInfo: { hasNextPage, endCursor: Buffer.from(String(end)).toString("base64") },
						edges,
					},
				},
			},
		};
	};
}

test("counts the last 24 hours, the 24 hours before, and 7 days, over two pages", () => {
	// 120 stars in the last 24 h (so the first page of 100 is all in the window), then 5 in the day before, 3 later in
	// the week, and 4 older than 7 days.
	const times = [
		...Array.from({ length: 120 }, (_, i) => ago(0.1 + (i * 23.8) / 120)),
		...[24.5, 30, 40, 47, 47.9].map(ago),
		...[60, 100, 167].map(ago),
		...[170, 200, 300, 400].map(ago),
	];
	const calls = [];
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(times, 1234, calls) });
	assert.equal(r.value, 120);
	assert.equal(r.summary, "120 in 24 h, 5 in the 24 h before, 128 in 7 d (18.3 a day), 1234 in total");
	// Page two holds the first star older than 7 days, so there is no third request.
	assert.equal(calls.length, 2);
	assert.equal(calls[0], null);
	assert.ok(calls[1]);
});

test("a star exactly 24 hours old belongs to the previous day, one in the future is not counted", () => {
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh([ago(-1), ago(0), ago(23.99), ago(24), ago(48)]) });
	assert.equal(r.value, 2);
	assert.match(r.summary, /^2 in 24 h, 1 in the 24 h before, 4 in 7 d/);
});

test("stops paging once the page reaches stars older than 7 days, and says so when the page cap is hit", () => {
	const calls = [];
	assert.equal(starsSince(fakeGh([ago(1), ago(200)], 2, calls), "flisk-sh/flisk", new Date(NOW - 168 * HOUR)).capped, false);
	assert.equal(calls.length, 1);
	// 100 fresh stars, 100 older than 7 days, then 100 more that must never be asked for.
	const three = [...Array.from({ length: 100 }, () => ago(2)), ...Array.from({ length: 200 }, () => ago(300))];
	const asked = [];
	starsSince(fakeGh(three, 300, asked), "flisk-sh/flisk", new Date(NOW - 168 * HOUR));
	assert.equal(asked.length, 2);
	// Every page newer than 7 days, forever: the cap stops the walk.
	const many = Array.from({ length: 100 * (MAX_PAGES + 5) }, (_, i) => ago(1 + i / 1e6));
	const pages = [];
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(many, many.length, pages) });
	assert.equal(pages.length, MAX_PAGES);
	assert.equal(r.value, 100 * MAX_PAGES);
	assert.match(r.summary, new RegExp(`capped at ${MAX_PAGES} pages, so the counts are lower bounds$`));
});

test("a repository with no stars has a zero, not no data", () => {
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh([]) });
	assert.equal(r.value, 0);
	assert.equal(r.summary, "0 in 24 h, 0 in the 24 h before, 0 in 7 d (0 a day), 0 in total");
});
