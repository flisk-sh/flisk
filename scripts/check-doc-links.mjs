import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Inline Markdown links and images: [text](target) or [text](target "title")
const LINK = /\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function withoutCode(text) {
	return text
		.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
		.replace(/`[^`\n]*`/g, "");
}

export function relativeTargets(text) {
	const targets = [];
	for (const match of withoutCode(text).matchAll(LINK)) {
		let target = match[1].replace(/^<|>$/g, "");
		target = target.split("#")[0].split("?")[0];
		if (!target || target.startsWith("/") || SCHEME.test(target)) continue;
		try {
			target = decodeURIComponent(target);
		} catch {
		}
		targets.push(target);
	}
	return targets;
}

export function findBrokenLinks(root, files) {
	const broken = [];
	for (const file of files) {
		for (const target of relativeTargets(readFileSync(join(root, file), "utf8"))) {
			if (!existsSync(resolve(root, dirname(file), target))) broken.push({ file, target });
		}
	}
	return broken;
}

export function trackedDocs(root) {
	const out = execFileSync("git", ["ls-files", "-z", "--", "README.md", "docs"], { cwd: root, encoding: "utf8" });
	return out
		.split("\0")
		.filter((file) => file === "README.md" || (file.startsWith("docs/") && file.endsWith(".md")));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const root = process.cwd();
	const broken = findBrokenLinks(root, trackedDocs(root));
	for (const { file, target } of broken) console.error(`${file} -> ${target}`);
	if (broken.length > 0) {
		console.error(`${broken.length} broken relative link(s).`);
		process.exit(1);
	}
	console.log("No broken relative documentation links.");
}
