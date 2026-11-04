// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Product/market fit by the Sean Ellis test: the share of respondents who would be "very disappointed" if they could
// no longer use Flisk, from the "Usability feedback" form (.github/ISSUE_TEMPLATE/usability-feedback.yml). 40% is the
// usual benchmark for fit. People who no longer use Flisk are left out of the share, as the test prescribes, and older
// issues filed before the question existed are not counted at all.
import { formFields, issuesWithLabel, round1 } from "./lib.mjs";

export const meta = {
	id: "pmf",
	title: "Very disappointed without Flisk (Sean Ellis test)",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "%",
};

export const LABEL = "ux-feedback";
export const TITLE = /^usability:/i;
export const FIELD = "How would you feel if you could no longer use Flisk?";
export const OPTIONS = ["Very disappointed", "Somewhat disappointed", "Not disappointed", "I no longer use Flisk"];
export const BENCHMARK = 40;

// The form's issues. GitHub applies a form's label only when the label exists in the repo, so a response can arrive
// unlabeled; it is then found by the form's title prefix. Either way only a body with the form's question counts, which
// drops hand-written "usability: ..." issues and the search's loose title matches.
export function responses(gh, repo) {
	const byLabel = issuesWithLabel(gh, repo, LABEL);
	const search = ["--search", "usability in:title", "--state", "all", "--limit", "1000"];
	const byTitle = gh(["issue", "list", "-R", repo, ...search, "--json", "number,title,body,createdAt"]).filter((issue) =>
		TITLE.test(issue.title ?? ""),
	);
	const byNumber = new Map([...byLabel, ...byTitle].map((issue) => [issue.number, issue]));
	return [...byNumber.values()].filter((issue) => FIELD in formFields(issue.body));
}

export function measure(ctx) {
	const counts = Object.fromEntries(OPTIONS.map((o) => [o, 0]));
	for (const issue of responses(ctx.gh, ctx.repo)) {
		const answer = formFields(issue.body)[FIELD];
		if (OPTIONS.includes(answer)) counts[answer]++;
	}
	const [very, somewhat, not, gone] = OPTIONS.map((o) => counts[o]);
	const n = very + somewhat + not;
	if (!n) return { value: null, summary: gone ? `only "${OPTIONS[3]}" answers (${gone})` : "no answers yet" };
	const share = round1((very / n) * 100);
	const left = gone ? `; ${gone} no longer use Flisk, not counted` : "";
	return {
		value: share,
		summary: `n=${n}: ${very} very, ${somewhat} somewhat, ${not} not disappointed; fit benchmark ${BENCHMARK}%${left}`,
	};
}
