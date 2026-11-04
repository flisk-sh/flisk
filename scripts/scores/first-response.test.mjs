// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { firstReply, measure } from "./first-response.mjs";

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
const OPENED = "2026-10-20T00:00:00Z";
// An ISO time `h` hours after OPENED.
const at = (h) => new Date(Date.parse(OPENED) + h * 3600 * 1000).toISOString().replace(".000", "");

const user = (login, authorAssociation) => ({ authorAssociation, author: { login, __typename: "User" } });
const bot = (login, authorAssociation = "NONE") => ({ authorAssociation, author: { login, __typename: "Bot" } });
const comment = (h, who) => ({ createdAt: at(h), ...who });
const review = (h, who) => ({ submittedAt: h === null ? null : at(h), ...who });

// Search nodes shaped like `gh api graphql` output for the fragment first-response.mjs sends.
const issue = (number, who, { comments = [], state = "OPEN", createdAt = OPENED } = {}) => ({
	__typename: "Issue",
	number,
	createdAt,
	state,
	...who,
	comments: { nodes: comments },
});
const pr = (number, who, { comments = [], reviews = [], state = "OPEN", mergedAt = null } = {}) => ({
	__typename: "PullRequest",
	number,
	createdAt: OPENED,
	state,
	mergedAt,
	...who,
	comments: { nodes: comments },
	reviews: { nodes: reviews },
});

const outsider = user("newcomer", "NONE");
const contributor = user("returning", "CONTRIBUTOR");
const member = user("maintainer", "MEMBER");
const owner = user("founder", "OWNER");
const collaborator = user("helper", "COLLABORATOR");

const ITEMS = {
	// First maintainer comment at 2 h; the bot and the other contributor before it do not count.
	1: issue(1, outsider, {
		comments: [comment(0.5, bot("github-actions")), comment(1, contributor), comment(2, member), comment(3, owner)],
	}),
	// A maintainer's review counts on a pull request; a pending review (no submittedAt) or an outsider's does not.
	2: pr(2, contributor, {
		reviews: [review(null, member), review(4, outsider), review(5, member)],
		comments: [comment(6, collaborator)],
	}),
	// Merged without a word at 3 h: the merge is the answer.
	3: pr(3, outsider, { state: "MERGED", mergedAt: at(3) }),
	// Still open with no maintainer reply: listed with its age.
	4: issue(4, outsider, { comments: [comment(1, outsider)] }),
	// Closed by its author with no reply: counted, not listed.
	5: issue(5, contributor, { state: "CLOSED" }),
	// Opened by maintainers and bots: left out.
	6: issue(6, member),
	7: pr(7, bot("dependabot", "CONTRIBUTOR")),
	8: issue(8, collaborator),
	// Same day as the cutoff, but more than 30 days before NOW.
	9: issue(9, outsider, { createdAt: "2026-09-28T06:00:00Z" }),
};

// A fake `gh api graphql` that answers the search the scorer sends: over the 1000-result cap until the maintainer and
// bot authors are excluded, then two pages of what is left.
function fakeGh(queries) {
	return (args) => {
		assert.deepEqual(args.slice(0, 3), ["api", "graphql", "-f"]);
		const body = args[3].replace(/^query=/, "");
		const search = JSON.parse(/search\(query: ("(?:[^"\\]|\\.)*")/.exec(body)[1]);
		const after = /after: "([^"]*)"/.exec(body)?.[1] ?? null;
		queries.push({ search, after });
		const excluded = [...search.matchAll(/-author:(\S+)/g)].map((m) => m[1]);
		const all = Object.values(ITEMS);
		if (!excluded.length) {
			// Paging on through a capped search would never reach the older items.
			if (after) throw new Error("paged a search that is over the cap");
			return { data: { search: { issueCount: 1500, pageInfo: { hasNextPage: true, endCursor: "Y3Vyc29yOjEwMA==" }, nodes: all } } };
		}
		const kept = all.filter((n) => !excluded.includes(n.author.__typename === "Bot" ? `app/${n.author.login}` : n.author.login));
		const pages = { null: kept.slice(0, 3), Y3Vyc29yOjM: kept.slice(3) };
		if (!(String(after) in pages)) throw new Error(`unknown cursor ${after}`);
		const hasNextPage = after === null;
		return {
			data: {
				search: {
					issueCount: kept.length,
					pageInfo: { hasNextPage, endCursor: hasNextPage ? "Y3Vyc29yOjM" : null },
					nodes: pages[after],
				},
			},
		};
	};
}

test("firstReply takes the earliest maintainer comment, review or merge", () => {
	assert.equal(firstReply(ITEMS[1]).toISOString(), "2026-10-20T02:00:00.000Z");
	assert.equal(firstReply(ITEMS[2]).toISOString(), "2026-10-20T05:00:00.000Z");
	assert.equal(firstReply(ITEMS[3]).toISOString(), "2026-10-20T03:00:00.000Z");
	assert.equal(firstReply(ITEMS[4]), null);
	assert.equal(firstReply(issue(10, outsider, { comments: [comment(1, bot("helper-bot", "MEMBER"))] })), null);
});

test("measure is the median hours to a maintainer's answer on items from outside, over 30 days", () => {
	const queries = [];
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(queries) });
	assert.equal(r.value, 3);
	assert.equal(r.summary, "n=3, median 3 h, p90 5 h; 1 open with no maintainer reply (and 1 closed without one), of 5");
	assert.deepEqual(r.findings, ["#4 issue open 8.5 d, no maintainer reply"]);
});

test("measure searches from the cutoff day and excludes the insiders it saw before paging", () => {
	const queries = [];
	measure({ repo: "flisk-sh/flisk", now: NOW, gh: fakeGh(queries) });
	const base = "repo:flisk-sh/flisk created:>=2026-09-28 sort:created-desc";
	const narrowed = `${base} -author:maintainer -author:app/dependabot -author:helper`;
	assert.deepEqual(queries, [
		{ search: base, after: null },
		{ search: narrowed, after: null },
		{ search: narrowed, after: "Y3Vyc29yOjM" },
	]);
});

test("measure leaves out maintainers and bots the search still returns, and has no value without an outsider", () => {
	// Under the cap nothing is excluded in the query, so the items themselves must be filtered.
	const nodes = [ITEMS[6], ITEMS[7], ITEMS[8]];
	const gh = () => ({ data: { search: { issueCount: 3, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } });
	const r = measure({ repo: "flisk-sh/flisk", now: NOW, gh });
	assert.equal(r.value, null);
	assert.equal(r.summary, "no issue or pull request from outside in 30 days");
});

test("a maintainer listed in docs/project/MAINTAINERS.md counts even when the token reports CONTRIBUTOR", () =>
	withMaintainersFile((root) => {
		const hidden = user("hidden", "CONTRIBUTOR");
		const nodes = [issue(20, outsider, { comments: [comment(4, hidden)] }), issue(21, hidden)];
		const queries = [];
		const gh = (args) => {
			queries.push(args[3]);
			return { data: { search: { issueCount: 2, pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
		};
		const r = measure({ root, repo: "flisk-sh/flisk", now: NOW, gh });
		assert.equal(r.value, 4);
		assert.equal(r.summary, "n=1, median 4 h, p90 4 h; 0 open with no maintainer reply, of 1");
		assert.match(queries[0], /sort:created-desc -author:hidden/);
	}));
