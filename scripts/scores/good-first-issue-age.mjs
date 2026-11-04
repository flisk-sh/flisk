// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether "good first issue" issues are still fresh and looked after. The value is the median age in days of the open
// issues with that label; the summary adds p90 and the share a maintainer commented on in the last 30 days. An old
// issue nobody answers is a dead end for the newcomer who picks it up. A maintainer is OWNER, MEMBER or COLLABORATOR, or
// listed in docs/project/MAINTAINERS.md, since the Actions token reports a private org member as CONTRIBUTOR; bots are
// not. One GraphQL search reads 100 issues with their last 100 comments, so a few calls cover the whole label.
import { maintainerLogins, median, percentile, round1 } from "./lib.mjs";

export const meta = {
	id: "good-first-issue-age",
	title: "Median age of open good first issues",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "days",
};

export const LABEL = "good first issue";
export const RECENT_DAYS = 30;
export const OLDEST = 10;
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
const DAY = 24 * 3600 * 1000;

const isBot = (author) => author?.__typename === "Bot" || /\[bot\]$/.test(author?.login ?? "");
export const isMaintainer = (node, logins = new Set()) =>
	!isBot(node.author) &&
	(MAINTAINERS.includes(node.authorAssociation) || logins.has(node.author?.login?.toLowerCase()));

// Every open issue with the label, as { number, createdAt, comments { nodes { createdAt authorAssociation author } } }.
export function openIssues(gh, repo) {
	const query = `repo:${repo} is:issue is:open label:${JSON.stringify(LABEL)}`;
	const nodes = [];
	let after = null;
	do {
		const page = after ? `, after: ${JSON.stringify(after)}` : "";
		const q = `query { search(query: ${JSON.stringify(query)}, type: ISSUE, first: 100${page}) {
			pageInfo { hasNextPage endCursor } nodes { ... on Issue { number createdAt
			comments(last: 100) { nodes { createdAt authorAssociation author { login __typename } } } } } } }`;
		const search = gh(["api", "graphql", "-f", `query=${q}`]).data.search;
		nodes.push(...search.nodes);
		after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
	} while (after);
	return nodes;
}

export function measure(ctx) {
	const logins = maintainerLogins(ctx.root);
	const issues = openIssues(ctx.gh, ctx.repo).map((issue) => {
		const replies = (issue.comments?.nodes ?? []).filter((c) => isMaintainer(c, logins)).map((c) => c.createdAt);
		const last = replies.length ? new Date(replies.sort().at(-1)) : null;
		return {
			number: issue.number,
			age: (ctx.now - new Date(issue.createdAt)) / DAY,
			sinceReply: last ? (ctx.now - last) / DAY : null,
		};
	});
	if (!issues.length) return { value: null, summary: `no open "${LABEL}" issue` };
	const ages = issues.map((i) => i.age);
	const recent = issues.filter((i) => i.sinceReply !== null && i.sinceReply <= RECENT_DAYS).length;
	const share = round1((recent / issues.length) * 100);
	return {
		value: round1(median(ages)),
		summary:
			`n=${issues.length}, median ${round1(median(ages))} d, p90 ${round1(percentile(ages, 90))} d; ` +
			`${recent} of ${issues.length} (${share}%) had a maintainer comment in the last ${RECENT_DAYS} days`,
		findings: issues
			.sort((a, b) => b.age - a.age || a.number - b.number)
			.slice(0, OLDEST)
			.map(
				(i) =>
					`#${i.number} ${Math.floor(i.age)} d, last maintainer reply ${i.sinceReply === null ? "never" : `${Math.floor(i.sinceReply)} d ago`}`,
			),
	};
}
