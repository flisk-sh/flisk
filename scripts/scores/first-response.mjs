// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How long an outside contributor waits for a maintainer. Median hours from opening an issue or pull request to the
// first comment (or, on a pull request, review) by an OWNER, MEMBER or COLLABORATOR, over the last 30 days. A merge
// also counts as the answer to a pull request: many small outside PRs are merged without a word, and calling those
// unanswered would bury the ones really waiting. Items opened by maintainers or bots are left out; they say nothing
// about how a newcomer is received. Items with no answer are not in the median; the open ones are listed with their
// age, since they are the ones to answer first.
import { maintainerLogins, median, percentile, round1 } from "./lib.mjs";

export const meta = {
	id: "first-response",
	title: "Hours to a maintainer's first reply",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "h",
};

export const DAYS = 30;
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
// GitHub search returns at most 1000 results per query.
const SEARCH_CAP = 1000;
const HOUR = 3600 * 1000;

const ACTOR = "authorAssociation author { login __typename }";
const COMMENTS = `comments(first: 100) { nodes { createdAt ${ACTOR} } }`;
const REVIEWS = `reviews(first: 100) { nodes { submittedAt ${ACTOR} } }`;
const ITEM = `__typename
	... on Issue { number createdAt state ${ACTOR} ${COMMENTS} }
	... on PullRequest { number createdAt state mergedAt ${ACTOR} ${COMMENTS} ${REVIEWS} }`;

const isBot = (author) => author?.__typename === "Bot" || /\[bot\]$/.test(author?.login ?? "");
// logins: docs/project/MAINTAINERS.md, for maintainers whose org membership the token cannot see.
export const isMaintainer = (node, logins = new Set()) =>
	!isBot(node.author) &&
	(MAINTAINERS.includes(node.authorAssociation) || logins.has(node.author?.login?.toLowerCase()));
// The search qualifier that leaves this author out: bots are searched as app/<name>.
const without = (author) => `-author:${isBot(author) ? `app/${author.login.replace(/\[bot\]$/, "")}` : author.login}`;

function searchPage(gh, query, after) {
	const page = after ? `, after: ${JSON.stringify(after)}` : "";
	const q = `query { search(query: ${JSON.stringify(query)}, type: ISSUE, first: 100${page}) {
		issueCount pageInfo { hasNextPage endCursor } nodes { ${ITEM} } } }`;
	return gh(["api", "graphql", "-f", `query=${q}`]).data.search;
}

// Every issue and pull request opened since `since` (to the day; the caller trims to the hour). The maintainers open
// most items, so a plain search can pass the 1000-result cap; each maintainer or bot seen on a first page is then
// excluded with -author: and the search starts over, which leaves mostly outside authors to page through. The size
// bound keeps the query short; past it the summary says the search was capped.
export function openedSince(gh, repo, since, logins = new Set()) {
	const excluded = new Set([...logins].map((login) => `-author:${login}`));
	const base = [`repo:${repo}`, `created:>=${since.toISOString().slice(0, 10)}`, "sort:created-desc"];
	for (;;) {
		const query = [...base, ...excluded].join(" ");
		let page = searchPage(gh, query);
		const insiders = page.nodes.filter((n) => n.author && (isMaintainer(n, logins) || isBot(n.author)));
		const fresh = insiders.map((n) => without(n.author));
		if (page.issueCount > SEARCH_CAP && fresh.some((q) => !excluded.has(q)) && excluded.size < 20) {
			for (const q of fresh) excluded.add(q);
			continue;
		}
		const nodes = [...page.nodes];
		while (page.pageInfo.hasNextPage) {
			page = searchPage(gh, query, page.pageInfo.endCursor);
			nodes.push(...page.nodes);
		}
		return { nodes, total: page.issueCount };
	}
}

// When a maintainer first answered, or null. Only a maintainer can merge, so the merge needs no author check.
export function firstReply(item, logins = new Set()) {
	const byMaintainer = (n) => isMaintainer(n, logins);
	const times = [
		...(item.comments?.nodes ?? []).filter(byMaintainer).map((c) => c.createdAt),
		...(item.reviews?.nodes ?? []).filter(byMaintainer).map((r) => r.submittedAt),
		item.mergedAt,
	].filter(Boolean);
	return times.length ? new Date(times.sort()[0]) : null;
}

export function measure(ctx) {
	const since = new Date(ctx.now.getTime() - DAYS * 24 * HOUR);
	const logins = maintainerLogins(ctx.root);
	const { nodes, total } = openedSince(ctx.gh, ctx.repo, since, logins);
	const items = nodes.filter((n) => new Date(n.createdAt) >= since && !isMaintainer(n, logins) && !isBot(n.author));
	const hours = [];
	const waiting = [];
	let closedUnanswered = 0;
	for (const item of items) {
		const opened = new Date(item.createdAt);
		const reply = firstReply(item, logins);
		if (reply) hours.push((reply - opened) / HOUR);
		else if (item.state === "OPEN") waiting.push({ item, days: (ctx.now - opened) / HOUR / 24 });
		else closedUnanswered++;
	}
	if (!items.length) return { value: null, summary: `no issue or pull request from outside in ${DAYS} days` };
	const head = hours.length
		? `n=${hours.length}, median ${round1(median(hours))} h, p90 ${round1(percentile(hours, 90))} h`
		: "n=0";
	const closed = closedUnanswered ? ` (and ${closedUnanswered} closed without one)` : "";
	const capped = total > SEARCH_CAP ? `; search capped at ${SEARCH_CAP} of ${total}` : "";
	const kind = (n) => (n.__typename === "PullRequest" ? "PR" : "issue");
	return {
		value: hours.length ? round1(median(hours)) : null,
		summary: `${head}; ${waiting.length} open with no maintainer reply${closed}, of ${items.length}${capped}`,
		findings: waiting
			.sort((a, b) => b.days - a.days)
			.map(({ item, days }) => `#${item.number} ${kind(item)} open ${round1(days)} d, no maintainer reply`),
	};
}
