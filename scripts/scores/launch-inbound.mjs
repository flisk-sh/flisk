// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// What launch day brings in, and whether anyone has answered it. Issues, pull requests and discussions opened in the
// last 24 hours by people who are not maintainers (OWNER, MEMBER, COLLABORATOR, or a login in MAINTAINERS.md) and not
// bots. The value is how many there are; the summary says how many already have a maintainer reply, and the findings
// are the ones still waiting with their age in hours, oldest first: the reply queue. Discussions are read only when the
// repository has them enabled and the token may read them; otherwise the summary says they were not counted.
import { maintainerLogins, round1 } from "./lib.mjs";
import { firstReply, isMaintainer, openedSince } from "./first-response.mjs";

export const meta = {
	id: "launch-inbound",
	title: "Issues, pull requests and discussions opened by outsiders in 24 hours",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "items",
};

export const HOURS = 24;
const HOUR = 3600 * 1000;

const isBot = (author) => author?.__typename === "Bot" || /\[bot\]$/.test(author?.login ?? "");
const ACTOR = "authorAssociation author { login __typename }";
// A reply to a comment counts as an answer too, so replies are read with the top-level comments.
const COMMENTS = `comments(first: 100) { nodes { createdAt ${ACTOR} replies(first: 20) { nodes { createdAt ${ACTOR} } } } }`;

// Discussions opened since `since`, as nodes with their comments flattened to one list (the shape firstReply reads), or
// null when the repository has discussions switched off or the call fails (no permission, API error).
export function discussionsSince(gh, repo, since) {
	const [owner, name] = repo.split("/");
	const q = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
		hasDiscussionsEnabled
		discussions(first: 50, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number createdAt closed ${ACTOR} ${COMMENTS} } } } }`;
	let repository;
	try {
		repository = gh(["api", "graphql", "-f", `query=${q}`]).data?.repository;
	} catch {
		return null;
	}
	if (!repository || repository.hasDiscussionsEnabled === false) return null;
	return (repository.discussions?.nodes ?? [])
		.filter((d) => new Date(d.createdAt) >= since)
		.map((d) => ({
			...d,
			comments: { nodes: (d.comments?.nodes ?? []).flatMap((c) => [c, ...(c.replies?.nodes ?? [])]) },
		}));
}

export function measure(ctx) {
	const since = new Date(ctx.now.getTime() - HOURS * HOUR);
	const logins = maintainerLogins(ctx.root);
	const outside = (n) => new Date(n.createdAt) >= since && !isMaintainer(n, logins) && !isBot(n.author);
	const { nodes } = openedSince(ctx.gh, ctx.repo, since, logins);
	const discussionNodes = discussionsSince(ctx.gh, ctx.repo, since);
	const items = [
		...nodes.filter(outside).map((n) => ({ ...n, kind: n.__typename === "PullRequest" ? "PR" : "issue", open: n.state === "OPEN" })),
		...(discussionNodes ?? []).filter(outside).map((n) => ({ ...n, kind: "discussion", open: !n.closed })),
	];
	const count = (kind) => items.filter((i) => i.kind === kind).length;
	const answered = items.filter((i) => firstReply(i, logins));
	const waiting = items
		.filter((i) => !firstReply(i, logins) && i.open)
		.map((i) => ({ i, hours: (ctx.now - new Date(i.createdAt)) / HOUR }))
		.sort((a, b) => b.hours - a.hours);
	const skipped = discussionNodes === null ? "; discussions not counted (disabled or not readable)" : "";
	return {
		value: items.length,
		summary: `${count("issue")} issues, ${count("PR")} PRs, ${count("discussion")} discussions in ${HOURS} h; ${answered.length} with a maintainer reply, ${waiting.length} waiting${skipped}`,
		findings: waiting.map(({ i, hours }) => `#${i.number} ${i.kind} open ${round1(hours)} h, no maintainer reply`),
	};
}
