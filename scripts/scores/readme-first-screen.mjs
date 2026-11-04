// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// What a visitor sees at the top of README.md before scrolling: a title, an install command, a picture, few badges and a
// short pitch before the first code block. Five checks, one point each. The thresholds are the named constants below,
// so moving one is a reviewed diff rather than a quiet edit.
import { read } from "./lib.mjs";

export const meta = {
	id: "readme-first-screen",
	title: "README first screen",
	source: "files",
	mode: "report",
	better: "higher",
	unit: "checks",
};

export const H1_WITHIN_NONEMPTY_LINES = 5;
export const INSTALL_WITHIN_LINES = 40;
export const IMAGE_WITHIN_LINES = 20;
export const MAX_BADGES_BEFORE_CODE = 6;
export const MAX_PROSE_WORDS_BEFORE_CODE = 250;

// `npm install -g @flisk-sh/flisk`, or a curl installer for Flisk piped to a shell (another tool's installer does not
// count).
const INSTALL = /npm\s+(?:install|i)\s+(?:-g|--global)\s+@flisk-sh\/flisk\b|curl\s[^\n]*flisk[^\n]*\|\s*(?:bash|zsh|sh)\b/i;
const IMAGE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)[^)]*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
// shields.io and the services that copy its style: badgen, badge.fury.io, GitHub's workflow badge.svg, any /badge path.
const BADGE = /shields\.io|badgen\.net|badge\.fury\.io|[/.]badges?(?=[/.?#]|$)/i;

const imageUrls = (line) => [...line.matchAll(IMAGE)].map((m) => m[1] ?? m[2]);

// Words a reader reads in a piece of markdown: comments, images (badges included) and HTML tags removed, links reduced
// to their text, and only tokens with a letter or digit counted.
export function proseWords(markdown) {
	return String(markdown)
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&#?\w+;/g, " ")
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function firstScreen(markdown) {
	const lines = String(markdown).split("\n");
	let firstCode = lines.findIndex((l) => /^\s*(```|~~~)/.test(l));
	if (firstCode < 0) firstCode = lines.length;
	const head = lines.slice(0, firstCode);
	// A `# comment` inside a code block is not a heading.
	let fenced = false;
	const nonEmpty = lines
		.map((l) => {
			const fence = /^\s*(```|~~~)/.test(l);
			if (fence) fenced = !fenced;
			return { l, heading: !fence && !fenced };
		})
		.filter(({ l }) => l.trim());
	const h1 = nonEmpty.findIndex(({ l, heading }) => heading && (/^#\s+\S/.test(l) || /<h1[\s>]/i.test(l))) + 1;
	const install = lines.findIndex((l) => INSTALL.test(l)) + 1;
	const image = lines.findIndex((l) => imageUrls(l).some((u) => !BADGE.test(u))) + 1;
	const badges = head.flatMap(imageUrls).filter((u) => BADGE.test(u)).length;
	const words = proseWords(head.join("\n"));
	return [
		{
			check: "H1 near the top",
			pass: h1 > 0 && h1 <= H1_WITHIN_NONEMPTY_LINES,
			measured: h1 ? `non-empty line ${h1}` : "none",
			limit: `within ${H1_WITHIN_NONEMPTY_LINES} non-empty lines`,
		},
		{
			check: "install command",
			pass: install > 0 && install <= INSTALL_WITHIN_LINES,
			measured: install ? `line ${install}` : "none",
			limit: `within ${INSTALL_WITHIN_LINES} lines`,
		},
		{
			check: "image",
			pass: image > 0 && image <= IMAGE_WITHIN_LINES,
			measured: image ? `line ${image}` : "none",
			limit: `within ${IMAGE_WITHIN_LINES} lines`,
		},
		{
			check: "badges before the first code block",
			pass: badges <= MAX_BADGES_BEFORE_CODE,
			measured: String(badges),
			limit: `at most ${MAX_BADGES_BEFORE_CODE}`,
		},
		{
			check: "prose words before the first code block",
			pass: words <= MAX_PROSE_WORDS_BEFORE_CODE,
			measured: String(words),
			limit: `at most ${MAX_PROSE_WORDS_BEFORE_CODE}`,
		},
	];
}

export function measure({ root }) {
	const checks = firstScreen(read(root, "README.md"));
	return {
		value: checks.filter((c) => c.pass).length,
		max: checks.length,
		summary: checks.map((c) => `${c.check}: ${c.measured}`).join("; "),
		findings: checks.filter((c) => !c.pass).map((c) => `${c.check}: ${c.measured} (${c.limit})`),
	};
}
