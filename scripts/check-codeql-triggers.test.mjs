// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Regression check for the CodeQL workflow's trigger set (#3971). A push-to-main scan repeated work the
// PR and merge-group runs had already done, so the workflow keeps only PR, merge-group, weekly and manual
// triggers. The comment in the workflow records why each of those is retained. Run by `npm run test:scripts`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { triggersOf } from "./check-ci-inventory.mjs";

const workflowPath = fileURLToPath(new URL("../.github/workflows/codeql.yml", import.meta.url));
const source = readFileSync(workflowPath, "utf8");

test("CodeQL triggers are PRs, merge groups, a weekly schedule and manual dispatch only", () => {
	const triggers = triggersOf(YAML.parse(source) ?? {});
	assert.deepEqual([...triggers].sort(), [
		"merge_group",
		"pull_request",
		"schedule",
		"workflow_dispatch",
	]);
	assert.ok(
		!triggers.includes("push"),
		"CodeQL must not run on push to main: PR and merge-group runs already scan that tree (#3971)",
	);
});

test("the workflow documents why PR, merge-group and scheduled runs stay", () => {
	// The reasons live above `on:` so they stay next to the trigger set they explain.
	const header = source.split(/\r?\non:/, 1)[0];
	for (const reason of [
		"pull_request",
		"Scorecard",
		"merge_group",
		"the queue may merge",
		"schedule",
		"No `push:` trigger",
	]) {
		assert.ok(header.includes(reason), `codeql.yml trigger comment should mention ${reason}`);
	}
});
