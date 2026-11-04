// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Public numbers for Flisk and the tools people compare it with, from the GitHub API only: stars, days since the last
// push and the last release, and the same reading-ease and words-before-the-first-command measures the files scorers
// apply to our own README, applied to each README as GitHub serves it. Every tool is measured the same way, so the
// numbers compare; none of them is a usability score (umux-lite has the only real one). The value is Flisk's place
// when the READMEs are ordered by reading ease, 1 being the easiest.
import { proseWords } from "./readme-first-screen.mjs";
import { jargon, readingEase } from "./readme-readability.mjs";

export const meta = {
	id: "competitors",
	title: "README reading ease rank among comparable tools",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "",
};

// The tools docs/compare/ discusses that a developer would pick instead of Flisk to run an app locally. Changing the
// list changes the rank, so it is a reviewed diff.
export const REPOS = [
	"flisk-sh/flisk",
	"tilt-dev/tilt",
	"docker/compose",
	"GoogleContainerTools/skaffold",
	"devspace-sh/devspace",
	"garden-io/garden",
	"okteto/okteto",
	"jetify-com/devbox",
	"encoredev/encore",
	"metalbear-co/mirrord",
];
export const SELF = "flisk-sh/flisk";
const DAY = 24 * 60 * 60 * 1000;

const days = (now, iso) => (iso ? Math.max(0, Math.floor((now - new Date(iso)) / DAY)) : null);
const stars = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

// Prose words before the README's first fenced code block, the reading a visitor does before a command to copy.
export function wordsBeforeFirstCommand(markdown) {
	const lines = String(markdown).split("\n");
	const first = lines.findIndex((l) => /^\s*(```|~~~)/.test(l));
	return proseWords(lines.slice(0, first < 0 ? lines.length : first).join("\n"));
}

// One tool's row, or { repo, error } when GitHub has no such repository. A missing README or release leaves its fields null.
export function measureRepo(gh, repo, now) {
	let info;
	try {
		info = gh(["api", `repos/${repo}`]);
	} catch (err) {
		return { repo, error: String(err?.message ?? err).split("\n")[0] };
	}
	const optional = (args) => {
		try {
			return gh(args);
		} catch {
			return null;
		}
	};
	const readme = optional(["api", `repos/${repo}/readme`]);
	const release = optional(["api", `repos/${repo}/releases/latest`]);
	const md = readme?.content ? Buffer.from(readme.content, "base64").toString("utf8") : null;
	return {
		repo,
		stars: info.stargazers_count,
		pushedDays: days(now, info.pushed_at),
		releaseDays: days(now, release?.published_at),
		ease: md === null ? null : readingEase(md),
		wordsBeforeCommand: md === null ? null : wordsBeforeFirstCommand(md),
		jargonShare: md === null ? null : jargon(md).share,
	};
}

export function line(r) {
	if (r.error) return `${r.repo}: not measured (${r.error})`;
	const parts = [
		`★ ${stars(r.stars)}`,
		`README ease ${r.ease ?? "-"}`,
		`${r.wordsBeforeCommand ?? "-"} words before the first command`,
		`${r.jargonShare ?? "-"}% infrastructure words`,
		`pushed ${r.pushedDays ?? "-"} d ago`,
		`released ${r.releaseDays ?? "-"} d ago`,
	];
	return `${r.repo}: ${parts.join(", ")}`;
}

export function measure(ctx) {
	const now = ctx.now ?? new Date();
	const rows = REPOS.map((repo) => measureRepo(ctx.gh, repo, now));
	const ranked = rows.filter((r) => typeof r.ease === "number").sort((a, b) => b.ease - a.ease || a.repo.localeCompare(b.repo));
	const self = ranked.findIndex((r) => r.repo === SELF);
	const findings = ranked.map(line).concat(rows.filter((r) => !ranked.includes(r)).map(line));
	if (self < 0) return { value: null, summary: `${SELF} README not measured`, findings };
	const byStars = [...rows.filter((r) => !r.error)].sort((a, b) => b.stars - a.stars).findIndex((r) => r.repo === SELF) + 1;
	return {
		value: self + 1,
		max: ranked.length,
		summary: `Flisk's README is #${self + 1} of ${ranked.length} by reading ease (${ranked[self].ease}); #${byStars} by stars`,
		findings,
	};
}
