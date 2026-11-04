// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of `throw new X(...)` in cli/src that throw a FliskError with suggestions. cli/AGENTS.md asks for FliskError
// on every user-facing error: `new FliskError(message, suggestions, exitCode)` prints what to try next, where a bare
// Error prints a message and leaves the person, or the agent, to guess. A subclass of FliskError counts, with its
// suggestions read from the constructor parameter named `suggestions`. Test files and test-support/ are left out.
//
// The source is read with TypeScript's own scanner from the cli package. TypeScript 7 keeps its parser in a native
// binary that is reachable only through an IPC API, and the JS package exports the scanner, not createSourceFile. The
// scanner tokenises like the compiler (strings, template literals, comments, regular expressions), and a throw
// statement is plain enough to read from its tokens.
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isTestFile, read, round1, walk } from "./lib.mjs";

export const meta = {
	id: "error-contract",
	title: "Throws that are FliskError with suggestions",
	source: "files",
	mode: "ratchet",
	better: "higher",
	unit: "%",
};

// The scanner and its enums from the typescript the cli package resolves, or null when it is missing.
export async function loadTypeScript(root) {
	try {
		const req = createRequire(path.join(root, "cli/package.json"));
		const load = (spec) => import(pathToFileURL(req.resolve(spec)).href);
		const [scanner, ast] = await Promise.all([load("typescript/unstable/ast/scanner"), load("typescript/unstable/ast")]);
		if (typeof scanner.createScanner !== "function" || !ast.SyntaxKind) return null;
		return { createScanner: scanner.createScanner, SyntaxKind: ast.SyntaxKind, LanguageVariant: ast.LanguageVariant };
	} catch {
		return null;
	}
}

// The tokens of a file. The scanner alone cannot tell a regular expression from a division, or the `}` that closes a
// template substitution from a block's, so this does what the parser does: rescan a `/` that cannot follow an
// expression as a regex, and a `}` that closes a `${` as the rest of the template.
export function tokenize(ts, text) {
	const K = ts.SyntaxKind;
	// Keywords after which an expression starts, so a `/` there opens a regex.
	const operators = new Set(
		["Return", "TypeOf", "InstanceOf", "In", "Of", "New", "Delete", "Void", "Throw", "Case", "Do", "Else", "Yield", "Await"].map(
			(k) => K[`${k}Keyword`],
		),
	);
	const values = new Set([
		K.Identifier,
		K.NumericLiteral,
		K.BigIntLiteral,
		K.StringLiteral,
		K.NoSubstitutionTemplateLiteral,
		K.TemplateTail,
		K.RegularExpressionLiteral,
		K.CloseParenToken,
		K.CloseBracketToken,
	]);
	const endsExpression = (t) =>
		t && (values.has(t.kind) || (t.kind >= K.FirstKeyword && t.kind <= K.LastKeyword && !operators.has(t.kind)));
	const scanner = ts.createScanner(true, ts.LanguageVariant.Standard, text);
	const tokens = [];
	const braces = []; // true where the open brace is a template's ${
	for (let kind = scanner.scan(); kind !== K.EndOfFile; kind = scanner.scan()) {
		if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && !endsExpression(tokens.at(-1)))
			kind = scanner.reScanSlashToken();
		if (kind === K.OpenBraceToken) braces.push(false);
		else if (kind === K.TemplateHead) braces.push(true);
		else if (kind === K.CloseBraceToken && braces.pop()) {
			kind = scanner.reScanTemplateToken(false);
			if (kind === K.TemplateMiddle) braces.push(true);
		}
		const pos = scanner.getTokenStart();
		// A lone `#` scans as an empty private name without moving on; step past it so a bad scan cannot hang.
		if (scanner.getTokenEnd() <= pos) scanner.resetTokenState(pos + 1);
		tokens.push({ kind, pos, text: scanner.getTokenText() });
	}
	return tokens;
}

// Every `throw new X(...)` in the tokens: the constructor's name and its top-level arguments as token lists.
export function throwsIn(ts, tokens) {
	const K = ts.SyntaxKind;
	const found = [];
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].kind !== K.ThrowKeyword || tokens[i + 1]?.kind !== K.NewKeyword) continue;
		let j = i + 2;
		let callee = "";
		while (tokens[j] && [K.Identifier, K.DotToken].includes(tokens[j].kind)) callee += tokens[j++].text;
		const args = tokens[j]?.kind === K.OpenParenToken ? argumentsFrom(ts, tokens, j + 1) : [];
		found.push({ pos: tokens[i].pos, callee, args });
	}
	return found;
}

// Top-level groups of tokens separated by commas, from the token after an open paren up to its close.
function argumentsFrom(ts, tokens, start) {
	const K = ts.SyntaxKind;
	const opens = new Set([K.OpenParenToken, K.OpenBracketToken, K.OpenBraceToken, K.TemplateHead]);
	const closes = new Set([K.CloseParenToken, K.CloseBracketToken, K.CloseBraceToken, K.TemplateTail]);
	const args = [];
	let arg = [];
	let depth = 0;
	for (let j = start; tokens[j] && !(depth === 0 && tokens[j].kind === K.CloseParenToken); j++) {
		if (depth === 0 && tokens[j].kind === K.CommaToken) {
			args.push(arg);
			arg = [];
			continue;
		}
		if (opens.has(tokens[j].kind)) depth++;
		else if (closes.has(tokens[j].kind)) depth--;
		arg.push(tokens[j]);
	}
	if (arg.length) args.push(arg);
	return args;
}

// FliskError and its subclasses (`class X extends FliskError`, followed through chains), each with the position of its
// suggestions argument: the constructor parameter named `suggestions`, or the parent's when it declares no constructor.
export function fliskErrorClasses(ts, tokenLists) {
	const K = ts.SyntaxKind;
	const declared = [];
	for (const tokens of tokenLists) {
		for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].kind !== K.ClassKeyword || tokens[i + 2]?.kind !== K.ExtendsKeyword) continue;
			let index;
			for (let j = i + 3; tokens[j] && tokens[j].kind !== K.ClassKeyword; j++) {
				if (tokens[j].kind !== K.ConstructorKeyword || tokens[j + 1]?.kind !== K.OpenParenToken) continue;
				index = argumentsFrom(ts, tokens, j + 2).findIndex((p) => p.some((t) => t.text === "suggestions"));
				break;
			}
			declared.push({ name: tokens[i + 1].text, parent: tokens[i + 3]?.text, index });
		}
	}
	const classes = new Map([["FliskError", 1]]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const c of declared) {
			if (classes.has(c.name) || !classes.has(c.parent)) continue;
			classes.set(c.name, c.index === undefined ? classes.get(c.parent) : c.index);
			grew = true;
		}
	}
	return classes;
}

// A FliskError (or subclass) whose suggestions argument is there and is not `[]` or `undefined` (which means `[]`).
export function hasSuggestions(thrown, classes = new Map([["FliskError", 1]])) {
	const index = classes.get(thrown.callee.split(".").at(-1));
	if (index === undefined || index < 0) return false;
	const suggestions = thrown.args[index]?.map((t) => t.text).join("");
	return Boolean(suggestions) && suggestions !== "[]" && suggestions !== "undefined";
}

export async function measure({ root }) {
	const ts = await loadTypeScript(root);
	// An unloadable scanner must fail the ratchet, not skip it: a TypeScript upgrade that moves the unstable scanner API
	// would otherwise switch the check off without anyone noticing.
	if (!ts) throw new Error("the TypeScript scanner did not load from cli/node_modules (typescript/unstable/ast/scanner)");
	const files = walk(
		root,
		"cli/src",
		(rel) => /\.tsx?$/.test(rel) && !rel.endsWith(".d.ts") && !isTestFile(rel) && !rel.startsWith("cli/src/test-support/"),
	);
	const sources = files.map((rel) => {
		const text = read(root, rel);
		return { rel, text, tokens: tokenize(ts, text) };
	});
	const classes = fliskErrorClasses(
		ts,
		sources.map((source) => source.tokens),
	);
	let all = 0;
	let good = 0;
	const findings = [];
	for (const { rel, text, tokens } of sources) {
		for (const thrown of throwsIn(ts, tokens)) {
			all++;
			if (hasSuggestions(thrown, classes)) {
				good++;
				continue;
			}
			const line = text.slice(0, thrown.pos).split("\n").length;
			const name = thrown.callee.split(".").at(-1);
			findings.push(`${rel}:${line} throw new ${thrown.callee}${classes.has(name) ? " without suggestions" : ""}`);
		}
	}
	if (!all) return { value: null, summary: "no throw new in cli/src" };
	return {
		value: round1((good / all) * 100),
		summary: `${good} of ${all} throws are FliskError with a suggestion`,
		findings,
	};
}
