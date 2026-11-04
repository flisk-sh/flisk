// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { rating } from "./lib.mjs";
import { FIELD, LABEL, measure, OPTIONS } from "./seq.mjs";

const FORM = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/ISSUE_TEMPLATE/try-it-and-report.yml");

// A tried report as the form renders it; the rating is optional, so a skipped one is "_No response_".
const tried = (number, seq) => ({
	number,
	title: `tried: report ${number}`,
	createdAt: "2026-10-27T09:00:00Z",
	body: `### What did you try?\n\nexamples/one-backend-python\n\n### How did it go?\n\nIt worked\n\n### ${FIELD}\n\n${seq}\n\n### What did you see?\n\nFirst flisk up: 4 min.\n\n### Pasted output (optional)\n\n_No response_\n\n### Your setup (optional)\n\nmacOS 15, OrbStack`,
});

const ctxWith = (issues, calls = []) => ({
	repo: "flisk-sh/flisk",
	now: new Date("2026-10-28T12:00:00Z"),
	gh: (args) => {
		calls.push(args);
		return issues;
	},
});

test("measure is the mean rating to one decimal, with n and the median, skipping unrated reports", () => {
	const calls = [];
	const issues = [
		tried(1, "7 - Very easy"),
		tried(2, "5"),
		tried(3, "6"),
		tried(4, "1 - Very difficult"),
		tried(5, "_No response_"),
		// A boot report has no rating.
		{ number: 6, title: "boot: Ubuntu", createdAt: "2026-10-27T09:00:00Z", body: "### What broke\n\nnothing" },
	];
	const r = measure(ctxWith(issues, calls));
	assert.equal(r.value, 4.8);
	assert.equal(r.summary, "n=4, mean 4.8, median 5.5");
	assert.deepEqual(calls[0].slice(0, 6), ["issue", "list", "-R", "flisk-sh/flisk", "--label", LABEL]);
});

test("measure has no value until someone rates a task", () => {
	assert.equal(measure(ctxWith([tried(1, "_No response_")])).value, null);
	assert.equal(measure(ctxWith([])).value, null);
});

test("the tried form asks the Single Ease Question with the 1-7 options the scorer reads", () => {
	const form = YAML.parse(readFileSync(FORM, "utf8"));
	assert.ok(form.labels.includes(LABEL));
	const field = form.body.find((f) => f.id === "seq");
	assert.equal(field?.type, "dropdown");
	assert.equal(field.attributes.label, FIELD);
	assert.deepEqual(field.attributes.options, OPTIONS);
	assert.deepEqual(OPTIONS.map(rating), [1, 2, 3, 4, 5, 6, 7]);
	assert.notEqual(field.validations?.required, true);
});
