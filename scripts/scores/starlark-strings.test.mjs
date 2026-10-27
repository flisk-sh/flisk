// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the starlark-strings scorer.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { measure, stringProblems, withoutHandlebars } from "./starlark-strings.mjs";

const lines = (text) => stringProblems(text).map((p) => `${p.line}: ${p.what}`);

test("an undoubled backslash before a regex character is an invalid escape", () => {
	assert.deepEqual(lines("cmd = \"grep -E '^v\\(\\d+\\)'\"\n"), [
		"1: invalid escape sequence \\( (write \\\\()",
		"1: invalid escape sequence \\d (write \\\\d)",
		"1: invalid escape sequence \\) (write \\\\))",
	]);
});

test("valid escapes, doubled backslashes and raw strings pass", () => {
	const ok = [
		'a = "tab\\t newline\\n quote\\" slash\\\\ octal\\101 hex\\x41 uni\\u00e9"',
		"b = \"grep -E '^v\\\\(\\\\d+\\\\)'\"",
		'c = r"^v\\(\\d+\\)$"',
		"d = 'it\\'s'",
		'e = """multi',
		'line \\\\ ok"""',
	].join("\n");
	assert.deepEqual(lines(ok), []);
});

test("escapes inside docstrings are checked too, on the right line", () => {
	assert.deepEqual(lines('def f():\n    """Run\n    sed \\. here\n    """\n'), [
		"3: invalid escape sequence \\. (write \\\\.)",
	]);
});

test("two literals in a row are an error on one line or inside brackets, not across statements", () => {
	assert.deepEqual(lines('x = "a" "b"\n'), [
		"1: two string literals in a row; Starlark has no implicit concatenation, join them with +",
	]);
	assert.deepEqual(lines('x = [\n    "a"\n    "b",\n]\n'), [
		"3: two string literals in a row; Starlark has no implicit concatenation, join them with +",
	]);
	assert.deepEqual(lines('"""Module docstring."""\n"another statement"\nx = ["a", "b"] + ["c"]\ny = "a" + "b"\n'), []);
	assert.deepEqual(lines('x = "a" # comment\n'), []);
});

test("an r or b prefix starts a literal only at a word boundary", () => {
	assert.deepEqual(lines('x = br"\\d"\ny = b"\\d"\nprint("\\n")\n'), ["2: invalid escape sequence \\d (write \\\\d)"]);
});

test("handlebars tags are blanked before lexing a template", () => {
	assert.equal(withoutHandlebars('{{#if a}}\nx = "{{name}}"\n{{/if}}'), '         \nx = "        "\n       ');
	assert.deepEqual(lines(withoutHandlebars('{{#each s}}\nk8s_yaml("{{this}}")\n{{/each}}\nx = 1\n')), []);
});

test("measure reads Starlark files under runtime/ and the Tiltfile templates", () => {
	const root = mkdtempSync(path.join(tmpdir(), "starlark-strings-"));
	try {
		for (const [rel, body] of Object.entries({
			"runtime/engine/a.star": 'x = "\\("\n',
			"runtime/engine/Tiltfile": 'y = "ok"\n',
			"cli/templates/Tiltfile.hbs": '{{#if x}}\nz = "a" "b"\n{{/if}}\n',
			"runtime/engine/notes.md": 'x = "\\("\n',
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.deepEqual(r.findings, [
			"runtime/engine/a.star:1 invalid escape sequence \\( (write \\\\()",
			"cli/templates/Tiltfile.hbs:2 two string literals in a row; Starlark has no implicit concatenation, join them with +",
		]);
		assert.equal(r.summary, "3 Starlark files, 2 literals Starlark rejects");
	} finally {
		rmSync(root, { recursive: true });
	}
});
