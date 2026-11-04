// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GOOD_FIRST_ISSUE, measure } from "./contributor-funnel.mjs";

// A checkout whose docs/project/MAINTAINERS.md lists `hidden`, a maintainer the token reports as CONTRIBUTOR.
function withMaintainersFile(fn) {
	const root = mkdtempSync(path.join(tmpdir(), "scores-maintainers-"));
	mkdirSync(path.join(root, "docs/project"), { recursive: true });
	writeFileSync(path.join(root, "docs/project/MAINTAINERS.md"), "| Name | GitHub id | Company |\n| --- | --- | --- |\n| Hidden Maintainer | @Hidden | Example |\n");
	try {
		return fn(root);
	} finally {
		rmSync(root, { recursive: true });
	}
}

const NOW = new Date("2026-10-28T12:00:00Z");
const daysAgo = (d) => new Date(NOW - d * 24 * 3600 * 1000).toISOString().replace(".000", "");

// A node of repository.pullRequests as `gh api graphql` returns it for the fields contributor-funnel.mjs asks for.
const merged = (login, d, authorAssociation = "CONTRIBUTOR", __typename = "User") => ({
	authorAssociation,
	mergedAt: daysAgo(d),
	author: { login, __typename },
});

// A fake gh: the merged pull requests come back in pages of `size`, keyed by cursor; the good first issues as
// `gh issue list --json number` prints them.
function fakeGh(prs, goodFirstIssues, { size = 100, calls = [] } = {}) {
	return (args) => {
		calls.push(args);
		if (args[0] === "issue") return goodFirstIssues.map((number) => ({ number }));
		assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
		const after = /after: "([^"]*)"/.exec(args[3])?.[1];
		const start = after ? Number(after.replace("cursor:", "")) : 0;
		const end = Math.min(start + size, prs.length);
		const hasNextPage = end < prs.length;
		return {
			data: {
				repository: {
					pullRequests: {
						pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor:${end}` : null },
						nodes: prs.slice(start, end),
					},
				},
			},
		};
	};
}

test("measure counts first merges in 90 days and the returning share of the 90-180 day cohort", () => {
	const calls = [];
	const prs = [
		merged("dave", 200),
		merged("carol", 120),
		merged("bob", 100),
		merged("erin", 60),
		merged("erin", 30),
		merged("alice", 10),
		merged("bob", 5),
		merged("dave", 3),
		// Maintainers and bots are not newcomers, whatever their first merge.
		merged("founder", 20, "OWNER"),
		merged("maintainer", 15, "MEMBER"),
		merged("helper", 12, "COLLABORATOR"),
		merged("dependabot", 2, "CONTRIBUTOR", "Bot"),
		merged("renovate[bot]", 4, "NONE"),
		{ authorAssociation: "NONE", mergedAt: daysAgo(1), author: null },
	];
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs, [11, 12, 13], { size: 5, calls }) });
	assert.equal(r.value, 2);
	assert.equal(
		r.summary,
		`2 new; returning: 1 of 2 who first merged 90-180 days ago merged again (50%); 3 open "${GOOD_FIRST_ISSUE}" issues`,
	);
	assert.deepEqual(r.findings, [
		`@erin first merged ${daysAgo(60).slice(0, 10)}, 2 merged`,
		`@alice first merged ${daysAgo(10).slice(0, 10)}, 1 merged`,
	]);
	// Three pages of five, then the good first issues.
	const graphql = calls.filter((a) => a[0] === "api").map((a) => a[3]);
	assert.equal(graphql.length, 3);
	assert.match(graphql[0], /repository\(owner: "flisk-sh", name: "flisk"\)/);
	assert.match(graphql[0], /pullRequests\(states: MERGED, first: 100, orderBy/);
	assert.match(graphql[1], /after: "cursor:5"/);
	assert.match(graphql[2], /after: "cursor:10"/);
	assert.deepEqual(calls.at(-1).slice(0, 8), ["issue", "list", "-R", "flisk-sh/flisk", "--label", "good first issue", "--state", "open"]);
});

test("measure says so when no one first merged 90-180 days ago", () => {
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh([merged("alice", 10)], []) });
	assert.equal(r.value, 1);
	assert.equal(r.summary, `1 new; returning: no one first merged 90-180 days ago yet; 0 open "${GOOD_FIRST_ISSUE}" issues`);
});

test("a maintainer listed in docs/project/MAINTAINERS.md is not a newcomer even when the token reports CONTRIBUTOR", () =>
	withMaintainersFile((root) => {
		const prs = [merged("hidden", 10, "CONTRIBUTOR"), merged("alice", 10)];
		const r = measure({ root, repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(prs, []) });
		assert.equal(r.value, 1);
	}));
