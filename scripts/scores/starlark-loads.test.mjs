// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkable, codeOnly, loads, measure } from "./starlark-loads.mjs";

test("codeOnly blanks docstrings and comments but keeps line numbers and plain strings", () => {
	const text = '"""\nload("./gone.star", "X")\n"""\n# load("./also-gone.star")\nload("./here.star", "Y")\n';
	const code = codeOnly(text);
	assert.equal(code.split("\n").length, text.split("\n").length);
	assert.doesNotMatch(code, /gone/);
	assert.match(code, /load\("\.\/here\.star"/);
});

test("loads reads the first literal of each call, across lines, with its line", () => {
	const text = 'x = 1\nload(\n    "./a.star",\n    "A",\n)\nload(\'../b.star\', "B")\nreload("./c.star")\n';
	assert.deepEqual(loads(text), [
		{ target: "./a.star", line: 2 },
		{ target: "../b.star", line: 6 },
	]);
});

test("checkable leaves out extensions and runtime-built paths", () => {
	assert.equal(checkable("./x.star"), true);
	assert.equal(checkable("ext://flisk-cli"), false);
	assert.equal(checkable("{}/.tilt/spec.master"), false);
});

test("measure flags a missing target and accepts a template's generated sibling", () => {
	const root = mkdtempSync(path.join(tmpdir(), "starlark-loads-"));
	try {
		mkdirSync(path.join(root, "runtime/engine/sub"), { recursive: true });
		mkdirSync(path.join(root, "cli/templates"), { recursive: true });
		writeFileSync(path.join(root, "runtime/engine/sub/ok.star"), "OK = 1\n");
		writeFileSync(
			path.join(root, "runtime/engine/Tiltfile"),
			'load("./sub/ok.star", "OK")\nload("./sub/missing.star", "M")\n',
		);
		writeFileSync(path.join(root, "cli/templates/TILT_X.star.hbs"), "X = 1\n");
		writeFileSync(path.join(root, "cli/templates/Tiltfile.hbs"), 'load("TILT_X.star", "X")\n');
		const { value, findings } = measure({ root });
		assert.equal(value, 1);
		assert.match(findings[0], /^runtime\/engine\/Tiltfile:2 load\("\.\/sub\/missing\.star"\)/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
