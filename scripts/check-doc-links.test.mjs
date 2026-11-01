import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { findBrokenLinks, relativeTargets } from "./check-doc-links.mjs";

function project(files) {
	const root = mkdtempSync(join(tmpdir(), "doc-links-"));
	for (const [name, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, name)), { recursive: true });
		writeFileSync(join(root, name), content);
	}
	return root;
}

test("passes when every relative link resolves", () => {
	const root = project({
		"README.md": "[docs](./docs/a.md) and [dir](docs/sub/)",
		"docs/a.md": "[up](../README.md#top) [sibling](./sub/b.md#part)",
		"docs/sub/b.md": "[back](../a.md)",
	});
	try {
		assert.deepEqual(findBrokenLinks(root, ["README.md", "docs/a.md", "docs/sub/b.md"]), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("reports a link to a file that does not exist", () => {
	const root = project({
		"README.md": "[ok](./docs/a.md)",
		"docs/a.md": "[gone](./missing.md#section) [also gone](../nope.md)",
	});
	try {
		assert.deepEqual(findBrokenLinks(root, ["README.md", "docs/a.md"]), [
			{ file: "docs/a.md", target: "./missing.md" },
			{ file: "docs/a.md", target: "../nope.md" },
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("ignores external links, anchors, absolute paths and code", () => {
	const text = [
		"[web](https://example.com/x.md) [mail](mailto:a@b.c) [anchor](#top) [abs](/x.md)",
		"`[inline](./nope.md)`",
		"```md",
		"[fenced](./nope.md)",
		"```",
	].join("\n");
	assert.deepEqual(relativeTargets(text), []);
});

test("strips titles, angle brackets and percent-encoding", () => {
	assert.deepEqual(relativeTargets('[a](./a.md "Title") [b](<./b.md>) [c](./my%20file.md)'), [
		"./a.md",
		"./b.md",
		"./my file.md",
	]);
});
