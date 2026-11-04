// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { test } from "node:test";
import { rating, scoreResponse, summarize } from "./umux-lite-score.mjs";

const body = (cap, ease, how = "With an AI coding agent") =>
	`### “Flisk's capabilities meet my requirements”\n\n${cap}\n\n### “Flisk is easy to use”\n\n${ease}\n\n### How did you build it?\n\n${how}\n\n### Comments (optional)\n\n_No response_\n`;

test("rating reads the dropdown and the old free-text answers", () => {
	assert.equal(rating("7 - Strongly agree"), 7);
	assert.equal(rating("1 - Strongly disagree"), 1);
	assert.equal(rating("5"), 5);
	assert.equal(rating(" 6 "), 6);
	assert.equal(rating("10"), null);
	assert.equal(rating("_No response_"), null);
	assert.equal(rating(undefined), null);
});

test("scoreResponse applies the UMUX-Lite formula", () => {
	assert.equal(scoreResponse(body("7 - Strongly agree", "7 - Strongly agree")).score, 100);
	assert.equal(scoreResponse(body("1 - Strongly disagree", "1 - Strongly disagree")).score, 0);
	assert.equal(scoreResponse(body("6", "7 - Strongly agree")).score, (11 / 12) * 100);
	assert.equal(scoreResponse(body("6", "7")).how, "With an AI coding agent");
	assert.equal(scoreResponse(body("", "7")), null);
});

test("summarize reports n, mean and median", () => {
	const s = summarize([{ score: 50 }, { score: 100 }, { score: 75 }, { score: 25 }]);
	assert.deepEqual(s, { n: 4, mean: 62.5, median: 62.5 });
	assert.deepEqual(summarize([]), { n: 0, mean: null, median: null });
});
