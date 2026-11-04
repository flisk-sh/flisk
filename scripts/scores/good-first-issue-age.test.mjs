// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { measure } from "./good-first-issue-age.mjs";

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
const REPO = "flisk-sh/flisk";
const daysAgo = (d) => new Date(NOW - d * 24 * 3600 * 1000).toISOString().replace(".000", "");

const user = (login, authorAssociation) => ({ authorAssociation, author: { login, __typename: "User" } });
const comment = (d, who) => ({ createdAt: daysAgo(d), ...who });
// A search node shaped like `gh api graphql` output for the fragment good-first-issue-age.mjs sends.
const issue = (number, age, comments = []) => ({ number, createdAt: daysAgo(age), comments: { nodes: comments } });

const member = user("maintainer", "MEMBER");
const hidden = user("hidden", "CONTRIBUTOR");
const outsider = user("newcomer", "NONE");
const helperBot = { authorAssociation: "MEMBER", author: { login: "helper-bot", __typename: "Bot" } };

// A fake `gh api graphql` that serves the search in pages of `size`, keyed by cursor.
function fakeGh(nodes, { size = 100, queries = [] } = {}) {
	return (args) => {
		assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
		queries.push(args[3]);
		const after = /after: "([^"]*)"/.exec(args[3])?.[1];
		const start = after ? Number(after.replace("cursor:", "")) : 0;
		const end = Math.min(start + size, nodes.length);
		const hasNextPage = end < nodes.length;
		return {
			data: { search: { issueCount: nodes.length, pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor:${end}` : null }, nodes: nodes.slice(start, end) } },
		};
	};
}

const NODES = [
	// A maintainer answered 40 days ago, then only an outsider: not recent.
	issue(1, 120, [comment(40, member), comment(10, outsider)]),
	// Answered 5 days ago by a maintainer the token cannot see; recent only when MAINTAINERS.md lists them.
	issue(2, 60, [comment(5, hidden)]),
	// A bot and an outsider never count.
	issue(3, 30, [comment(2, helperBot), comment(1, outsider)]),
	// A member answered 20 days ago, after an older answer.
	issue(4, 10, [comment(25, member), comment(20, member)]),
	issue(5, 2),
];

test("median age, p90 and the recently answered share, with maintainers from MAINTAINERS.md", () =>
	withMaintainersFile((root) => {
		const queries = [];
		const r = measure({ root, repo: REPO, now: NOW, gh: fakeGh(NODES, { size: 2, queries }) });
		assert.equal(r.value, 30);
		assert.equal(r.summary, "n=5, median 30 d, p90 120 d; 2 of 5 (40%) had a maintainer comment in the last 30 days");
		assert.deepEqual(r.findings, [
			"#1 120 d, last maintainer reply 40 d ago",
			"#2 60 d, last maintainer reply 5 d ago",
			"#3 30 d, last maintainer reply never",
			"#4 10 d, last maintainer reply 20 d ago",
			"#5 2 d, last maintainer reply never",
		]);
		// Three pages of two, one search for the exact label, each issue with its last comments.
		assert.equal(queries.length, 3);
		assert.match(queries[0], /search\(query: "repo:flisk-sh\/flisk is:issue is:open label:\\"good first issue\\"", type: ISSUE, first: 100\)/);
		assert.match(queries[0], /comments\(last: 100\)/);
		assert.match(queries[2], /after: "cursor:4"/);
	}));

test("without MAINTAINERS.md a CONTRIBUTOR's comment is not a maintainer reply", () => {
	const r = measure({ root: "/nonexistent", repo: REPO, now: NOW, gh: fakeGh(NODES) });
	assert.equal(r.summary, "n=5, median 30 d, p90 120 d; 1 of 5 (20%) had a maintainer comment in the last 30 days");
	assert.equal(r.findings[1], "#2 60 d, last maintainer reply never");
});

test("only the 10 oldest are listed, and no open issue has no value", () => {
	const many = Array.from({ length: 12 }, (_, i) => issue(100 + i, i + 1));
	const r = measure({ root: "/nonexistent", repo: REPO, now: NOW, gh: fakeGh(many) });
	assert.equal(r.findings.length, 10);
	assert.equal(r.findings[0], "#111 12 d, last maintainer reply never");
	const empty = measure({ root: "/nonexistent", repo: REPO, now: NOW, gh: fakeGh([]) });
	assert.equal(empty.value, null);
	assert.equal(empty.summary, 'no open "good first issue" issue');
});
