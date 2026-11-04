// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { FIELD, LABEL, measure, parseMinutes, TITLE } from "./first-boot-time.mjs";

const FORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/ISSUE_TEMPLATE/i-booted-flisk.yml");

// A boot report as the issue form renders it.
const boot = (number, minutes, broke = "nothing") => ({
	number,
	title: `boot: macOS ${number}`,
	createdAt: "2026-10-27T09:00:00Z",
	body: `### OS\n\nmacOS 15\n\n### flisk --version\n\n1.4.7\n\n### ${FIELD}\n\n${minutes}\n\n### What broke\n\n${broke}\n\n### Commands you ran\n\n\`\`\`shell\nflisk up\n\`\`\``,
});

const ctxWith = (issues, calls = []) => ({
	repo: "flisk-sh/flisk",
	now: new Date("2026-10-28T12:00:00Z"),
	gh: (args) => {
		calls.push(args);
		return issues;
	},
});

test("parseMinutes reads plain, approximate, unit and fractional answers", () => {
	assert.equal(parseMinutes("8"), 8);
	assert.equal(parseMinutes("about 8"), 8);
	assert.equal(parseMinutes("8 min"), 8);
	assert.equal(parseMinutes("8min."), 8);
	assert.equal(parseMinutes("~10 minutes"), 10);
	assert.equal(parseMinutes("1.5"), 1.5);
	assert.equal(parseMinutes("1,5"), 1.5);
});

test("parseMinutes takes the upper bound of a range", () => {
	assert.equal(parseMinutes("5-10"), 10);
	assert.equal(parseMinutes("5 – 10 min"), 10);
	assert.equal(parseMinutes("5 to 10"), 10);
	assert.equal(parseMinutes("1-2h"), 120);
});

test("parseMinutes converts hours and seconds and adds up a duration written in parts", () => {
	assert.equal(parseMinutes("1h"), 60);
	assert.equal(parseMinutes("1 hour"), 60);
	assert.equal(parseMinutes("1h 30m"), 90);
	assert.equal(parseMinutes("1h30"), 90);
	assert.equal(parseMinutes("90s"), 1.5);
	assert.equal(parseMinutes("4 min 30 s"), 4.5);
});

test("parseMinutes keeps the first answer when a second one follows, and gives null without a number", () => {
	assert.equal(parseMinutes("8 minutes (cold), 2 warm"), 8);
	assert.equal(parseMinutes("never got one"), null);
	assert.equal(parseMinutes("_No response_"), null);
	assert.equal(parseMinutes(""), null);
	assert.equal(parseMinutes(undefined), null);
});

test("measure gives the median with n and p75, and lists the reports without a number", () => {
	const calls = [];
	const issues = [
		boot(1, "4"),
		boot(2, "about 8"),
		boot(3, "5-10"),
		boot(4, "1h"),
		boot(5, "never got one"),
		boot(6, "_No response_"),
		{ number: 7, title: "boot: pasted by hand", createdAt: "2026-10-27T09:00:00Z", body: "it took 5 minutes" },
		// Same label, other form: not a boot report.
		{ number: 8, title: "tried: the shop example", createdAt: "2026-10-27T09:00:00Z", body: "### How did it go?\n\nIt worked" },
	];
	const r = measure(ctxWith(issues, calls));
	assert.equal(r.value, 9);
	assert.equal(r.summary, "n=4, median 9 min, p75 10 min");
	assert.deepEqual(r.findings, [
		'#5 no number in "never got one"',
		"#6 left the minutes empty",
		`#7 has no "${FIELD}" field`,
	]);
	assert.deepEqual(calls[0].slice(0, 6), ["issue", "list", "-R", "flisk-sh/flisk", "--label", LABEL]);
});

test("measure has no value until a report has a number", () => {
	assert.equal(measure(ctxWith([])).value, null);
	assert.equal(measure(ctxWith([boot(1, "_No response_")])).value, null);
});

test("the boot form still has the field, label and title prefix the scorer reads", () => {
	const form = YAML.parse(readFileSync(FORM, "utf8"));
	assert.ok(form.labels.includes(LABEL));
	assert.match(form.title, TITLE);
	const field = form.body.find((f) => f.id === "minutes");
	assert.equal(field?.attributes.label, FIELD);
});
