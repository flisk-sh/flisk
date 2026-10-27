// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Tests take their ports from the OS (`server.listen(0)`), never from a guess. MEMORY.md, 2026-10-22: resource-agent.test.ts
// picked `4800 + random(500)`, inside the range the CLI assigns to scaffolded agents, so it collided with a parallel
// worker and the CI Test job failed with "agent did not start" and no diagnostic. The same entry adds the second shape:
// a loopback URL whose port is a literal becomes a Semgrep "unencrypted request" finding on the changed lines. Read in
// every tracked test file: a listen() on a non-zero literal port, a port computed with Math.random(), and a fetch() of a
// literal http://localhost or 127.0.0.1 URL with a port. Comments are not read. A gate at zero.
import { isTestFile, read } from "./lib.mjs";
import { trackedFiles } from "./tracked-secrets.mjs";

export const meta = {
	id: "test-ports",
	title: "Tests that guess a port instead of asking the OS",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "guesses",
};

const SOURCE = /\.[cm]?[jt]sx?$/;

const RULES = [
	{
		re: /\.listen\(\s*(?:\{\s*port:\s*)?([1-9]\d*)\b/,
		why: (m) => `listen(${m[1]}) binds a fixed port; use listen(0) and read the port the OS assigned`,
	},
	{
		re: /\bport\b[^\n;]*Math\.random\(|Math\.random\([^\n;]*\bport\b/i,
		why: () => "port picked with Math.random(); a random guess still collides with parallel workers, use listen(0)",
	},
	{
		re: /\bfetch\(\s*["'`]https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+/,
		why: () => "fetch() of a literal loopback URL with a port; build the URL from the OS-assigned port in a helper",
	},
];

// Line comments and block comments blanked, newlines kept, so a rule never matches prose about the pattern.
export function stripComments(text) {
	return String(text)
		.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
		.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (c, lead) => lead + " ".repeat(c.length - lead.length));
}

// True when position `at` of a line is inside a string literal: an odd number of unescaped quotes of one kind before it.
// A fixture such as "src/api.test.ts": "fetch('http://localhost:4300')" is data a test feeds in, not a request it makes.
export function insideString(line, at) {
	const before = line.slice(0, at).replace(/\\./g, "");
	return ["'", '"', "`"].some((q) => before.split(q).length % 2 === 0);
}

// The guessed ports in one test file's text: { line, why }.
export function guesses(text) {
	const out = [];
	stripComments(text)
		.split("\n")
		.forEach((line, i) => {
			for (const rule of RULES) {
				const m = rule.re.exec(line);
				if (m && !insideString(line, m.index)) out.push({ line: i + 1, why: rule.why(m) });
			}
		});
	return out;
}

export function measure({ root }) {
	const files = trackedFiles(root).filter((rel) => isTestFile(rel) && SOURCE.test(rel));
	const findings = files.flatMap((rel) => guesses(read(root, rel)).map(({ line, why }) => `${rel}:${line} ${why}`));
	return {
		value: findings.length,
		summary: `${files.length} test files, ${findings.length} guessed ports`,
		findings,
	};
}
