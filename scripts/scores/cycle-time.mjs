// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Median cycle time from PR creation to merge, over the last 30 days.
// Queries GitHub for merged pull requests with linked issues.
import { median, percentile } from "./lib.mjs";

export const meta = {
	id: "cycle-time",
	title: "Median cycle time from PR creation to merge",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "h",
};

export const WINDOW_DAYS = 30;
const HOUR = 3600 * 1000;
const SLOW = 24;
const MOST = 5;
const SEARCH_CAP = 1000;

// Calculate hours between creation and merge.
export function cycleHours(createdAt, mergedAt) {
	const created = new Date(createdAt);
	const merged = new Date(mergedAt);
	return Math.round((merged - created) / HOUR);
}

// Fetch merged PRs within the 30-day window.
export function mergedPulls(gh, repo, now) {
	const [owner, name] = repo.split("/");
	const since = new Date(now.getTime() - WINDOW_DAYS * 24 * HOUR).toISOString().slice(0, 10);
	const query = `query { repository(owner: "${owner}", name: "${name}") {
		pullRequests(first: 100, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}) {
			totalCount
			pageInfo { hasNextPage endCursor }
			edges {
				node {
					number
					createdAt
					mergedAt
					linkedIssues(first: 1) { nodes { number } }
				}
			}
		}
	} }`;

	const result = gh(["api", "graphql", "-f", `query=${query}`]);
	const pr = result.data.repository.pullRequests;
	const nodes = [];

	for (const edge of pr.edges) {
		const node = edge.node;
		const merged = new Date(node.mergedAt);
		if (merged >= new Date(now.getTime() - WINDOW_DAYS * 24 * HOUR) && merged <= now) {
			nodes.push(node);
		}
	}

	return {
		nodes,
		capped: pr.pageInfo.hasNextPage,
	};
}

export function measure(ctx) {
	const { nodes, capped } = mergedPulls(ctx.gh, ctx.repo, ctx.now);

	if (!nodes.length) {
		return {
			value: null,
			summary: "no pull request merged in 30 days",
			findings: [],
		};
	}

	const hours = [];
	let unlinked = 0;
	const slow = [];

	for (const node of nodes) {
		const h = cycleHours(node.createdAt, node.mergedAt);
		hours.push(h);
		if (!node.linkedIssues.nodes.length) unlinked++;
		if (h > SLOW) slow.push({ number: node.number, hours: h });
	}

	const med = median(hours);
	const p90 = percentile(hours, 90);
	const findings = slow
		.sort((a, b) => b.hours - a.hours)
		.slice(0, MOST)
		.map((pr) => `#${pr.number} took ${pr.hours} h to merge`);

	const note = capped ? `; capped at ${SEARCH_CAP} results` : "";
	const summary = `n=${nodes.length}, median ${Math.round(med)} h, p90 ${Math.round(p90)} h; ${unlinked} with no linked issue${note}`;

	return {
		value: med !== null ? Math.round(med) : null,
		summary,
		findings,
	};
}
