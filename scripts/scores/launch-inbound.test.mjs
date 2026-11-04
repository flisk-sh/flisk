// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discussionsSince, measure } from "./launch-inbound.mjs";

const NOW = new Date("2026-10-28T12:00:00Z");
const HOUR = 3600 * 1000;
// An ISO time `h` hours before NOW.
const ago = (h) => new Date(NOW.getTime() - h * HOUR).toISOString().replace(".000", "");

const user = (login, authorAssociation) => ({ authorAssociation, author: { login, __typename: "User" } });
const bot = (login) => ({ authorAssociation: "NONE", author: { login, __typename: "Bot" } });
const outsider = user("newcomer", "NONE");
const contributor = user("returning", "CONTRIBUTOR");
const member = user("maintainer", "MEMBER");
const comment = (h, who) => ({ createdAt: ago(h), ...who });

// Search nodes and discussion nodes shaped like the GraphQL the scorers send.
const issue = (number, who, h, { comments = [], state = "OPEN" } = {}) => ({
	__typename: "Issue",
	number,
	createdAt: ago(h),
	state,
	...who,
	comments: { nodes: comments },
});
const pr = (number, who, h, { comments = [], state = "OPEN", mergedAt = null } = {}) => ({
	__typename: "PullRequest",
	number,
	createdAt: ago(h),
	state,
	mergedAt,
	...who,
	comments: { nodes: comments },
	reviews: { nodes: [] },
});
const discussion = (number, who, h, { comments = [], closed = false } = {}) => ({
	number,
	createdAt: ago(h),
	closed,
	...who,
	comments: { nodes: comments.map((c) => ({ replies: { nodes: [] }, ...c })) },
});

const SEARCH = [
	issue(1, outsider, 5.2),
	issue(2, contributor, 3, { comments: [comment(2, member)] }),
	pr(3, outsider, 8, { state: "MERGED", mergedAt: ago(7) }),
	pr(4, contributor, 1),
	// Left out: a maintainer, a bot, and an outsider's issue older than 24 hours (same search day).
	issue(5, member, 2),
	pr(6, bot("dependabot"), 2),
	issue(7, outsider, 30),
	// Closed with no reply: counted, not in the queue.
	issue(8, outsider, 10, { state: "CLOSED" }),
];
const DISCUSSIONS = [
	discussion(10, outsider, 4),
	discussion(11, contributor, 6, { comments: [comment(5, member)] }),
	// A maintainer's reply to somebody else's comment is still an answer.
	discussion(12, outsider, 9, { comments: [{ ...comment(9, contributor), replies: { nodes: [comment(8, member)] } }] }),
	discussion(13, member, 3),
	discussion(14, outsider, 40),
];

// A fake `gh api graphql` answering the issue/PR search (one page) and the discussions query.
function fakeGh({ search = SEARCH, discussions = DISCUSSIONS, enabled = true, fail = false } = {}, queries = []) {
	return (args) => {
		const q = args[3].replace(/^query=/, "");
		queries.push(q);
		if (q.includes("discussions(")) {
			assert.match(q, /discussions\(first: 50, orderBy: \{field: CREATED_AT, direction: DESC\}\)/);
			if (fail) throw new Error("gh: Resource not accessible by integration");
			return { data: { repository: { hasDiscussionsEnabled: enabled, discussions: { nodes: enabled ? discussions : [] } } } };
		}
		return { data: { search: { issueCount: search.length, pageInfo: { hasNextPage: false, endCursor: null }, nodes: search } } };
	};
}

test("counts issues, PRs and discussions from outsiders in 24 hours, with the reply queue oldest first", () => {
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh() });
	assert.equal(r.value, 8);
	assert.equal(r.summary, "3 issues, 2 PRs, 3 discussions in 24 h; 4 with a maintainer reply, 3 waiting");
	assert.deepEqual(r.findings, [
		"#1 issue open 5.2 h, no maintainer reply",
		"#10 discussion open 4 h, no maintainer reply",
		"#4 PR open 1 h, no maintainer reply",
	]);
});

test("maintainers, bots and anything older than 24 hours are left out", () => {
	const gh = fakeGh({ search: [issue(5, member, 2), pr(6, bot("dependabot"), 2), issue(7, outsider, 25)], discussions: [discussion(13, member, 3)] });
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh });
	assert.equal(r.value, 0);
	assert.equal(r.summary, "0 issues, 0 PRs, 0 discussions in 24 h; 0 with a maintainer reply, 0 waiting");
	assert.deepEqual(r.findings, []);
});

test("discussions switched off or unreadable are skipped and the summary says so", () => {
	for (const options of [{ enabled: false }, { fail: true }]) {
		const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(options) });
		assert.equal(r.value, 5);
		assert.equal(
			r.summary,
			"3 issues, 2 PRs, 0 discussions in 24 h; 2 with a maintainer reply, 2 waiting; discussions not counted (disabled or not readable)",
		);
	}
	assert.equal(discussionsSince(fakeGh({ enabled: false }), "flisk-sh/flisk", new Date(NOW - 24 * HOUR)), null);
});

test("a maintainer from docs/project/MAINTAINERS.md counts even when the token reports CONTRIBUTOR", () => {
	const root = mkdtempSync(path.join(tmpdir(), "scores-maintainers-"));
	try {
		mkdirSync(path.join(root, "docs/project"), { recursive: true });
		writeFileSync(path.join(root, "docs/project/MAINTAINERS.md"), "| Name | GitHub id | Company |\n| --- | --- | --- |\n| Hidden | @Hidden | Example |\n");
		const hidden = user("hidden", "CONTRIBUTOR");
		const gh = fakeGh({ search: [issue(1, outsider, 5, { comments: [comment(4, hidden)] }), issue(2, hidden, 3)], discussions: [] });
		const r = measure({ root, repo: "flisk-sh/flisk", now: NOW, gh });
		assert.equal(r.value, 1);
		assert.equal(r.summary, "1 issues, 0 PRs, 0 discussions in 24 h; 1 with a maintainer reply, 0 waiting");
	} finally {
		rmSync(root, { recursive: true });
	}
});
