// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Lighthouse score of the website from a Lighthouse JSON report (`--lighthouse lhr.json`): the mean of the performance,
// accessibility, best-practices and SEO categories, each 0-100, with the failing audits as findings. Report only: the
// site lives outside this repo, so the weekly scoreboard workflow audits https://flisk.sh as deployed.
import { readFileSync } from "node:fs";

export const meta = {
	id: "lighthouse",
	title: "flisk.sh Lighthouse (mean of 4 categories)",
	source: "artifact",
	mode: "report",
	better: "higher",
	unit: "/100",
};

export const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

export function lighthouseScores(lhr) {
	const categories = CATEGORIES.map((id) => [id, lhr.categories?.[id]?.score])
		.filter(([, s]) => typeof s === "number")
		.map(([id, s]) => [id, Math.round(s * 100)]);
	const mean = categories.length ? Math.round(categories.reduce((n, [, s]) => n + s, 0) / categories.length) : null;
	// Audits that count toward a category score and fail (score under 0.5), worst first.
	const counted = new Set(
		CATEGORIES.flatMap((id) => (lhr.categories?.[id]?.auditRefs ?? []).filter((r) => r.weight > 0).map((r) => r.id)),
	);
	const failing = Object.values(lhr.audits ?? {})
		.filter((a) => counted.has(a.id) && typeof a.score === "number" && a.score < 0.5)
		.sort((a, b) => a.score - b.score);
	return { mean, categories, failing };
}

export function measure({ lighthouse }) {
	if (!lighthouse) return { value: null };
	const lhr = JSON.parse(readFileSync(lighthouse, "utf8"));
	const { mean, categories, failing } = lighthouseScores(lhr);
	return {
		value: mean,
		summary: `${lhr.finalDisplayedUrl ?? lhr.finalUrl ?? ""} ${categories.map(([id, s]) => `${id} ${s}`).join(", ")}`.trim(),
		findings: failing.map((a) => `${a.id}: ${a.title}`),
	};
}
