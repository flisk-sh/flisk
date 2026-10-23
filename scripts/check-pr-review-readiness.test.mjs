import assert from "node:assert/strict";
import test from "node:test";
import { pullRequestFromMergeGroup, reviewReadiness } from "./check-pr-review-readiness.mjs";

const body = (summary, verification) =>
	`## What changed?\n\n${summary}\n\n## How did you check it?\n\n${verification}\n`;

test("accepts a completed PR template check", () => {
	assert.equal(
		reviewReadiness(body("Added a repository ruleset check.", "- [x] `node --test scripts/*.test.mjs`")).passed,
		true,
	);
});

test("accepts a completed custom check with the template checkbox", () => {
	assert.equal(
		reviewReadiness(body("Added a repository ruleset check.", "- [x] Other check: `node --check scripts/check-pr-review-readiness.mjs` passed.")).passed,
		true,
	);
});

test("accepts a documented custom check without checkbox syntax", () => {
	assert.equal(
		reviewReadiness(body("Added a repository ruleset check.", "- Other check: `make test-shell` passed.")).passed,
		true,
	);
});

test("rejects an empty summary", () => {
	const result = reviewReadiness(body("<!-- add summary -->", "<!-- add checks -->"));
	assert.equal(result.passed, false);
	assert.equal(result.issues.length, 1);
});

test("rejects placeholder-only summaries", () => {
	for (const placeholder of ["[Input]", "TODO", "Describe the changes here."]) {
		assert.equal(reviewReadiness(body(placeholder, "- [x] `bun test`")).passed, false);
	}
});

test("does not require verification notes", () => {
	const result = reviewReadiness(
		body("Added a repository ruleset check.", "- [ ] Other check: <!-- Include the command and result. -->"),
	);
	assert.equal(result.passed, true);
});

test("accepts a plain description without the template heading", () => {
	assert.equal(reviewReadiness("Adds the X follow badge to the README.").passed, true);
});

test("rejects a summary that is only whitespace or an HTML comment", () => {
	assert.equal(
		reviewReadiness(body("   \n\n<!-- Describe what changed -->", "- [x] `npm test`")).passed,
		false,
	);
});

test("accepts Windows line endings and a heading in another capitalization", () => {
	const text = body("Added a repository ruleset check.", "- [x] `npm test`").replace(/\n/g, "\r\n").replace("## What changed?", "## WHAT CHANGED?");
	assert.equal(reviewReadiness(text).passed, true);
});

test("accepts a description with no verification section", () => {
	const text = "## What changed?\n\nAdded a repository ruleset check.\n";
	assert.equal(reviewReadiness(text).passed, true);
});

test("reads the first matching section when a heading is duplicated", () => {
	const text = "## What changed?\n\nTODO\n\n## What changed?\n\nAdded a real check.\n\n## How did you check it?\n\n- [x] `npm test`\n";
	assert.equal(reviewReadiness(text).passed, false);
});

test("accepts a completed item written with an asterisk list marker", () => {
	assert.equal(reviewReadiness(body("Added a repository ruleset check.", "* [x] `npm test`")).passed, true);
});

test("reads the pull request number from a merge queue ref", () => {
	assert.equal(pullRequestFromMergeGroup("refs/heads/gh-readonly-queue/main/pr-1694-abc123"), 1694);
	assert.equal(pullRequestFromMergeGroup("refs/heads/main"), null);
});
