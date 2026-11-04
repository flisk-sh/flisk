// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The Single Ease Question: how easy the task someone tried was, 1 (very difficult) to 7 (very easy), from the optional
// rating in the "I tried it and here is what I saw" form (.github/ISSUE_TEMPLATE/try-it-and-report.yml). It is asked
// right after the task, so it measures the task people actually did rather than Flisk in general. The mean is the
// score, as SEQ is usually reported; reports that skipped the rating are not counted.
import { formFields, issuesWithLabel, median, rating, round1 } from "./lib.mjs";

export const meta = {
	id: "seq",
	title: "Task ease, Single Ease Question",
	source: "gh",
	mode: "report",
	better: "higher",
	unit: "/7",
};

export const LABEL = "show-and-tell";
export const FIELD = "Overall, how easy or difficult was this task?";
export const OPTIONS = ["1 - Very difficult", "2", "3", "4", "5", "6", "7 - Very easy"];

export function measure(ctx) {
	const ratings = issuesWithLabel(ctx.gh, ctx.repo, LABEL)
		.map((issue) => rating(formFields(issue.body)[FIELD]))
		.filter((r) => r !== null);
	if (!ratings.length) return { value: null, summary: "no ratings yet" };
	// No `max` here: the unit already says "/7", and the runner would print both ("5.3/7 /7").
	const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
	return { value: round1(mean), summary: `n=${ratings.length}, mean ${round1(mean)}, median ${median(ratings)}` };
}
