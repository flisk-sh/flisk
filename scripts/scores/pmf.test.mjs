// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { scoreResponse } from "../umux-lite-score.mjs";
import { BENCHMARK, FIELD, LABEL, measure, OPTIONS, responses } from "./pmf.mjs";

const FORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/ISSUE_TEMPLATE/usability-feedback.yml");

// A usability-feedback issue as the form renders it; `pmf` undefined is an issue filed before the question existed.
const response = (number, pmf) => ({
	number,
	title: "usability: ",
	createdAt: "2026-10-27T09:00:00Z",
	body: [
		"### “Flisk's capabilities meet my requirements”\n\n6",
		"### “Flisk is easy to use”\n\n7 - Strongly agree",
		...(pmf === undefined ? [] : [`### ${FIELD}\n\n${pmf}`]),
		"### How did you build it?\n\nWith an AI coding agent",
		"### What did you build or run? (optional)\n\n_No response_",
		"### Comments (optional)\n\n_No response_",
		"### Your setup (optional)\n\n_No response_",
	].join("\n\n"),
});

// A fake gh with the two lookups: the labeled issues, and the issues a title search for "usability" returns.
const ctxWith = ({ labeled = [], titled = [] }, calls = []) => ({
	repo: "flisk-sh/flisk",
	now: new Date("2026-10-28T12:00:00Z"),
	gh: (args) => {
		calls.push(args);
		if (args.includes("--label")) return labeled;
		if (args.includes("--search")) return titled;
		throw new Error(`unexpected gh ${args.join(" ")}`);
	},
});

test("measure is the share of very disappointed among those who still use Flisk", () => {
	const calls = [];
	const labeled = [
		response(1, "Very disappointed"),
		response(2, "Very disappointed"),
		response(3, "Somewhat disappointed"),
		response(4, "Not disappointed"),
		response(5, "Somewhat disappointed"),
		response(6, "I no longer use Flisk"),
		response(7),
	];
	const r = measure(ctxWith({ labeled }, calls));
	assert.equal(r.value, 40);
	assert.equal(
		r.summary,
		`n=5: 2 very, 2 somewhat, 1 not disappointed; fit benchmark ${BENCHMARK}%; 1 no longer use Flisk, not counted`,
	);
	assert.deepEqual(calls[0].slice(0, 6), ["issue", "list", "-R", "flisk-sh/flisk", "--label", LABEL]);
	assert.deepEqual(calls[1].slice(0, 6), ["issue", "list", "-R", "flisk-sh/flisk", "--search", "usability in:title"]);
});

test("measure finds unlabeled responses by the form's title prefix and counts an issue found both ways once", () => {
	const titled = [
		response(1, "Very disappointed"),
		response(2, "Not disappointed"),
		// Matches the search but is not a "usability: " issue.
		{ ...response(3, "Very disappointed"), title: "[Epic] Quick-win first-run usability improvements" },
		// Has the prefix but was written by hand, without the form.
		{ number: 4, title: "usability: the quickstart is long", createdAt: "2026-10-27T09:00:00Z", body: "Too many steps." },
	];
	// The label does not exist on the repo, so nothing comes back labeled.
	const ctx = ctxWith({ titled });
	assert.deepEqual(responses(ctx.gh, ctx.repo).map((issue) => issue.number), [1, 2]);
	assert.equal(measure(ctxWith({ titled })).value, 50);
	assert.match(measure(ctxWith({ titled })).summary, /^n=2:/);
	// Response 1 found both by label and by title.
	const both = measure(ctxWith({ labeled: [response(1, "Very disappointed")], titled }));
	assert.match(both.summary, /^n=2: 1 very, 0 somewhat, 1 not disappointed/);
});

test("measure rounds to one decimal and has no value without an answer that counts", () => {
	const third = [response(1, "Very disappointed"), response(2, "Not disappointed"), response(3, "Not disappointed")];
	assert.equal(measure(ctxWith({ labeled: third })).value, 33.3);
	assert.equal(measure(ctxWith({ labeled: [response(1), response(2, "I no longer use Flisk")] })).value, null);
	assert.equal(measure(ctxWith({})).value, null);
});

test("the usability form asks the question with the exact options the scorer counts", () => {
	const form = YAML.parse(readFileSync(FORM, "utf8"));
	assert.ok(form.labels.includes(LABEL));
	const field = form.body.find((f) => f.id === "pmf");
	assert.equal(field?.type, "dropdown");
	assert.equal(field.attributes.label, FIELD);
	assert.deepEqual(field.attributes.options, OPTIONS);
	assert.equal(field.validations?.required, true);
});

test("the UMUX-Lite score still reads a response that carries the new question", () => {
	assert.equal(scoreResponse(response(1, "Very disappointed").body).score, (11 / 12) * 100);
});
