// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
	BEFORE,
	BEFORE_CAPABILITIES,
	BEFORE_EASE,
	beforeResponse,
	MIN_N,
	measure,
	NOT_ANSWERED,
	SOURCE,
	SOURCE_OPTIONS,
	sourceOf,
} from "./umux-lite.mjs";

const FORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/ISSUE_TEMPLATE/usability-feedback.yml");

// A usability-feedback issue as the form renders it. `before` is [tool, capabilities, ease] or undefined for an issue
// filed before the "before" questions existed.
// `source` is the "How did you hear" answer, or undefined for an issue filed before that question existed.
const response = (number, capabilities, ease, before, source, title = "usability: ") => ({
	number,
	title,
	createdAt: "2026-10-27T09:00:00Z",
	body: [
		`### “Flisk's capabilities meet my requirements”\n\n${capabilities}`,
		`### “Flisk is easy to use”\n\n${ease}`,
		"### How would you feel if you could no longer use Flisk?\n\nVery disappointed",
		"### How did you build it?\n\nWith an AI coding agent",
		...(before
			? [`### ${BEFORE}\n\n${before[0]}`, `### ${BEFORE_CAPABILITIES}\n\n${before[1]}`, `### ${BEFORE_EASE}\n\n${before[2]}`]
			: []),
		...(source === undefined ? [] : [`### ${SOURCE}\n\n${source}`]),
		"### Comments (optional)\n\n_No response_",
	].join("\n\n"),
});

const ctxWith = (labeled, titled = []) => ({
	repo: "flisk-sh/flisk",
	gh: (args) => (args.includes("--label") ? labeled : titled),
});

test("measure is the mean UMUX-Lite and says when there are too few answers", () => {
	const r = measure(ctxWith([response(1, "7 - Strongly agree", "7 - Strongly agree"), response(2, "4", "4")]));
	assert.equal(r.value, 75);
	assert.equal(r.summary, `n=2, mean 75, median 75; by source: not answered n=2 mean 75; fewer than ${MIN_N} answers, too few to trust`);
	assert.deepEqual(r.findings, []);
});

test("no answers is no data, not a zero", () => {
	assert.deepEqual(measure(ctxWith([])), { value: null, summary: "no answers yet" });
});

test("each tool used before is compared over the same people", () => {
	const r = measure(
		ctxWith([
			response(1, "7 - Strongly agree", "7 - Strongly agree", ["Tilt", "4", "1 - Strongly disagree"]),
			response(2, "4", "4", ["Tilt", "4", "4"]),
			response(3, "4", "4", ["Docker Compose", "7 - Strongly agree", "7 - Strongly agree"]),
			response(4, "4", "4", ["Nothing, this was my first time", "_No response_", "_No response_"]),
			response(5, "4", "4"),
		]),
	);
	assert.deepEqual(r.findings, [
		"Tilt: n=2, 37.5 for Tilt vs 75 for Flisk (same people)",
		"Docker Compose: n=1, 100 for Docker Compose vs 50 for Flisk (same people)",
	]);
});

test("a named tool without both ratings is not compared", () => {
	assert.equal(beforeResponse(response(1, "4", "4", ["Tilt", "5", "_No response_"]).body), null);
	assert.deepEqual(beforeResponse(response(1, "4", "4", ["Tilt", "1 - Strongly disagree", "1 - Strongly disagree"]).body), {
		tool: "Tilt",
		score: 0,
	});
});

test("the field labels match the form", () => {
	const labels = YAML.parse(readFileSync(FORM, "utf8")).body.map((b) => b.attributes?.label);
	for (const label of [BEFORE, BEFORE_CAPABILITIES, BEFORE_EASE]) assert.ok(labels.includes(label), label);
});

test("the summary splits by where people heard about Flisk, each source with its own n", () => {
	const r = measure(
		ctxWith([
			response(1, "7 - Strongly agree", "7 - Strongly agree", undefined, "Product Hunt"),
			response(2, "4", "4", undefined, "Product Hunt"),
			response(3, "1 - Strongly disagree", "1 - Strongly disagree", undefined, "Product Hunt"),
			response(4, "7 - Strongly agree", "7 - Strongly agree", undefined, "Hacker News"),
			response(5, "4", "4", undefined, "_No response_"),
			response(6, "4", "4"),
		]),
	);
	assert.equal(r.value, 58.3);
	assert.equal(
		r.summary,
		`n=6, mean 58.3, median 50; by source: Product Hunt n=3 mean 50, not answered n=2 mean 50, Hacker News n=1 mean 100; fewer than ${MIN_N} answers, too few to trust`,
	);
});

test("sourceOf reads only the form's options; a blank, missing or unknown answer is not answered", () => {
	assert.equal(sourceOf(response(1, "4", "4", undefined, "A friend or colleague").body), "A friend or colleague");
	assert.equal(sourceOf(response(1, "4", "4", undefined, "_No response_").body), NOT_ANSWERED);
	assert.equal(sourceOf(response(1, "4", "4").body), NOT_ANSWERED);
	assert.equal(sourceOf(response(1, "4", "4", undefined, "Carrier pigeon").body), NOT_ANSWERED);
});

test("unlabeled responses are found by the usability: title prefix and an issue found both ways counts once", () => {
	const both = response(1, "7 - Strongly agree", "7 - Strongly agree", undefined, "Product Hunt");
	const unlabeled = response(2, "1 - Strongly disagree", "1 - Strongly disagree", undefined, "Product Hunt");
	const unrelated = response(3, "7 - Strongly agree", "7 - Strongly agree", undefined, "Product Hunt", "[Epic] usability improvements");
	const r = measure(ctxWith([both], [both, unlabeled, unrelated]));
	assert.match(r.summary, /^n=2, mean 50, median 50; by source: Product Hunt n=2 mean 50;/);
});

test("the source field in the form is the one the scorer parses", () => {
	const field = YAML.parse(readFileSync(FORM, "utf8")).body.find((b) => b.id === "source");
	assert.ok(field, "no field with id source");
	assert.equal(field.type, "dropdown");
	assert.equal(field.attributes.label, SOURCE);
	assert.deepEqual(field.attributes.options, SOURCE_OPTIONS);
	assert.notEqual(field.validations?.required, true, "the question is optional");
});
