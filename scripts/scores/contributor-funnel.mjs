// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether people who show up keep contributing. The value is the number of new contributors: authors whose first
// merged pull request is from the last 90 days, leaving out maintainers (OWNER, MEMBER, COLLABORATOR, or listed in
// docs/project/MAINTAINERS.md, since the Actions token cannot see a private org membership) and bots, who
// are not arriving. The summary adds the returning rate (of the people whose first merge was 90 to 180 days ago, the
// share who merged again in the last 90 days) and how many open "good first issue" issues wait for the next newcomer.
import { maintainerLogins, round1 } from "./lib.mjs";

export const meta = {
	id: "contributor-funnel",
	title: "New contributors in the last 90 days",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "people",
};

export const WINDOW_DAYS = 90;
export const GOOD_FIRST_ISSUE = "good first issue";
export const MAINTAINERS = ["OWNER", "MEMBER", "COLLABORATOR"];
const DAY = 24 * 3600 * 1000;

const isBot = (author) => author.__typename === "Bot" || /\[bot\]$/.test(author.login);

// Every merged pull request, oldest first, as { authorAssociation, mergedAt, author { login __typename } }. The whole
// history is read: a first merge is only right when every older merge is in the list too.
export function mergedPulls(gh, repo) {
	const [owner, name] = repo.split("/");
	const nodes = [];
	let after = null;
	do {
		const page = after ? `, after: ${JSON.stringify(after)}` : "";
		const q = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
			pullRequests(states: MERGED, first: 100${page}, orderBy: { field: CREATED_AT, direction: ASC }) {
				pageInfo { hasNextPage endCursor } nodes { authorAssociation mergedAt author { login __typename } } } } }`;
		const prs = gh(["api", "graphql", "-f", `query=${q}`]).data.repository.pullRequests;
		nodes.push(...prs.nodes);
		after = prs.pageInfo.hasNextPage ? prs.pageInfo.endCursor : null;
	} while (after);
	return nodes;
}

export function measure(ctx) {
	const logins = maintainerLogins(ctx.root);
	const merges = new Map();
	for (const pr of mergedPulls(ctx.gh, ctx.repo)) {
		// A deleted account has no author; it cannot come back either.
		if (!pr.author || isBot(pr.author) || MAINTAINERS.includes(pr.authorAssociation)) continue;
		if (logins.has(pr.author.login.toLowerCase())) continue;
		if (!pr.mergedAt || new Date(pr.mergedAt) > ctx.now) continue;
		merges.set(pr.author.login, [...(merges.get(pr.author.login) ?? []), new Date(pr.mergedAt)]);
	}
	const recent = new Date(ctx.now - WINDOW_DAYS * DAY);
	const earlier = new Date(ctx.now - 2 * WINDOW_DAYS * DAY);
	const fresh = [];
	let cohort = 0;
	let returned = 0;
	for (const [login, dates] of merges) {
		const first = new Date(Math.min(...dates));
		if (first >= recent) fresh.push({ login, first, count: dates.length });
		else if (first >= earlier) {
			cohort++;
			if (dates.some((d) => d >= recent)) returned++;
		}
	}
	const open = ctx.gh(
		["issue", "list", "-R", ctx.repo, "--label", GOOD_FIRST_ISSUE, "--state", "open", "--limit", "1000", "--json", "number"],
	);
	const before = `first merged ${WINDOW_DAYS}-${2 * WINDOW_DAYS} days ago`;
	const returning = cohort
		? `${returned} of ${cohort} who ${before} merged again (${round1((returned / cohort) * 100)}%)`
		: `no one ${before} yet`;
	return {
		value: fresh.length,
		summary: `${fresh.length} new; returning: ${returning}; ${open.length} open "${GOOD_FIRST_ISSUE}" issues`,
		findings: fresh
			.sort((a, b) => a.first - b.first)
			.map((c) => `@${c.login} first merged ${c.first.toISOString().slice(0, 10)}, ${c.count} merged`),
	};
}
