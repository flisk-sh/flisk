// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How fast GitHub stars arrive: new stars in the last 24 hours, with the total, the last 7 days and the 24 hours before
// that in the summary, so a launch-day spike reads against a normal day. The stargazers are read newest first and paged
// until they are older than 7 days. (A `last: 100` page of a DESC list would be the OLDEST stars; `first: 100` with
// `after:` is the newest ones.) A cap on pages keeps a runaway count from burning the API quota; when it is hit the
// counts are lower bounds and the summary says so.
import { round1 } from "./lib.mjs";

export const meta = {
	id: "star-velocity",
	title: "New GitHub stars in the last 24 hours",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "stars",
};

export const MAX_PAGES = 30;
const HOUR = 3600 * 1000;

const query = (owner, name, after) => `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
	stargazers(first: 100, orderBy: {field: STARRED_AT, direction: DESC}${after ? `, after: ${JSON.stringify(after)}` : ""}) {
		totalCount pageInfo { hasNextPage endCursor } edges { starredAt } } } }`;

// Star times (ISO strings, newest first) back to `since`, the total, and whether the page cap cut the walk short.
export function starsSince(gh, repo, since) {
	const [owner, name] = repo.split("/");
	const times = [];
	let total = 0;
	let after = null;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const stargazers = gh(["api", "graphql", "-f", `query=${query(owner, name, after)}`]).data.repository.stargazers;
		total = stargazers.totalCount;
		const edges = stargazers.edges ?? [];
		times.push(...edges.map((e) => e.starredAt));
		const oldest = edges.at(-1)?.starredAt;
		if (!stargazers.pageInfo.hasNextPage || !oldest || new Date(oldest) < since) return { times, total, capped: false };
		after = stargazers.pageInfo.endCursor;
	}
	return { times, total, capped: true };
}

export function measure(ctx) {
	const ago = (hours) => new Date(ctx.now.getTime() - hours * HOUR);
	const { times, total, capped } = starsSince(ctx.gh, ctx.repo, ago(7 * 24));
	const stars = times.map((t) => new Date(t));
	const between = (from, to) => stars.filter((s) => s > from && s <= to).length;
	const day = between(ago(24), ctx.now);
	const previous = between(ago(48), ago(24));
	const week = between(ago(7 * 24), ctx.now);
	const note = capped ? `; capped at ${MAX_PAGES} pages, so the counts are lower bounds` : "";
	return {
		value: day,
		summary: `${day} in 24 h, ${previous} in the 24 h before, ${week} in 7 d (${round1(week / 7)} a day), ${total} in total${note}`,
	};
}
