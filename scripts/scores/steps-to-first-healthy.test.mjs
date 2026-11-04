// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the steps-to-first-healthy scorer, on small fixture repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { measure, stepsToUp } from "./steps-to-first-healthy.mjs";

function run(readme) {
	const root = mkdtempSync(path.join(tmpdir(), "steps-to-first-healthy-"));
	try {
		mkdirSync(root, { recursive: true });
		writeFileSync(path.join(root, "README.md"), readme);
		return measure({ root });
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("a && b counts as two commands; blank and comment lines count as none", () => {
	const body = ["npm install -g @flisk-sh/flisk", "", "# make a folder", "mkdir my-shop && cd my-shop", "flisk up shop"];
	assert.deepEqual(stepsToUp(body.join("\n")), [
		"npm install -g @flisk-sh/flisk",
		"mkdir my-shop",
		"cd my-shop",
		"flisk up shop",
	]);
});

test("commands after flisk up are not counted", () => {
	assert.equal(stepsToUp("flisk project --yes\nflisk up shop\nflisk status\nflisk down").length, 2);
	assert.equal(stepsToUp("cd shop && flisk up shop && open http://shop.localhost").length, 2);
});

test("the README's terminal quickstart is counted, not an earlier install-only block, and the summary lists it", () => {
	const readme = [
		"# Flisk",
		"",
		"```bash",
		"npm install -g @flisk-sh/flisk",
		"```",
		"",
		"### In your terminal",
		"",
		"```bash",
		"npm install -g @flisk-sh/flisk",
		"mkdir my-shop && cd my-shop",
		"flisk project --yes",
		"flisk up shop",
		"```",
		"",
	].join("\n");
	const r = run(readme);
	assert.equal(r.value, 5);
	assert.equal(
		r.summary,
		"README.md:10: npm install -g @flisk-sh/flisk → mkdir my-shop → cd my-shop → flisk project --yes → flisk up shop",
	);
});

test("a README without a quickstart is an error", () => {
	assert.throws(() => run("# Flisk\n\n```bash\nnpm install -g @flisk-sh/flisk\n```\n"), /no shell block/);
});
