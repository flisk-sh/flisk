// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Whether the README, the agent contract and the website (flisk-sh/website, read through gh) present Flisk the same
// way. Four checks, each a drift when the surfaces disagree: the headline (README H1, package.json description, the home
// page's title and hero <h1>, the site's _config.yml tagline), the command each one leads with (the README quickstart
// leads with `flisk project` while the home page hero leads with `flisk import` is one drift), the install command, and
// the spelling of the name (FLISK or FLisk where Flisk is meant; all lower case is the command and is fine). Leftover
// names from the rename are legacy-names' job. The value is the number of checks that drift, so 0 is one brand everywhere.
import { codeBlocks, read } from "./lib.mjs";
import { firstH1, normalise } from "./tagline-consistency.mjs";
import { quickstart, shellCommands } from "./translation-drift.mjs";

export const meta = {
	id: "brand-consistency",
	title: "Headline, lead command, install and name spelled the same in the README, llms.txt and flisk.sh",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "drifts",
};

export const WEBSITE_REPO = "flisk-sh/website";
// The website's files this scorer reads: the home page (front matter title, hero), the site config (tagline), the
// marketing numbers (install commands) and the site's own llms.txt.
export const WEBSITE_FILES = ["index.html", "_config.yml", "_data/flisk.yml", "llms.txt"];

// A file of the website repository through the GitHub contents API, or "" when it is missing.
export function websiteFile(gh, path, repo = WEBSITE_REPO) {
	try {
		const file = gh(["api", `repos/${repo}/contents/${path}`]);
		return Buffer.from(file.content ?? "", file.encoding === "base64" ? "base64" : "utf8").toString("utf8");
	} catch {
		return "";
	}
}

// Text of an HTML fragment: tags and Liquid tags removed, the common entities decoded, spaces collapsed.
export function htmlText(html) {
	return String(html)
		.replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

// A YAML front matter or config value on one line (`key: value`, quotes dropped), or null.
export function yamlValue(text, key) {
	const line = String(text)
		.split(/\r?\n/)
		.find((l) => l.startsWith(`${key}:`));
	if (line === undefined) return null;
	const v = line.slice(key.length + 1).trim().replace(/\s+#.*$/, "");
	return v.replace(/^(["'])(.*)\1$/, "$2") || null;
}

// The home page's hero: from its first <h1> to the install box, the part a visitor reads first.
export function hero(indexHtml) {
	const html = String(indexHtml);
	const start = html.search(/<h1\b/i);
	if (start < 0) return "";
	const end = html.indexOf("aw-install", start);
	return html.slice(start, end < 0 ? start + 4000 : end);
}

// The first `flisk <subcommand>` in a text, as "flisk <subcommand>", or null. A standalone flisk only: @flisk-sh/flisk
// and flisk.sh are not commands.
export function leadCommand(text) {
	const m = /(?:^|[\s>`$(])flisk\s+([a-z][\w-]*)/m.exec(String(text));
	return m ? `flisk ${m[1]}` : null;
}

// The first command in a text that installs the Flisk CLI: npm, pnpm or bun global install, npx, or a flisk.sh
// install script piped to a shell.
export const INSTALL =
	/(?:npm\s+(?:install|i)\s+(?:-g|--global)|pnpm\s+add\s+-g|bun\s+add\s+-g)\s+@flisk-sh\/flisk\b|curl\s[^\n]*flisk\.sh\/install\.sh[^\n]*\|\s*(?:bash|zsh|sh)\b/i;
export const installCommand = (text) => INSTALL.exec(String(text))?.[0].replace(/\s+/g, " ") ?? null;

// Capitalisations of the name other than Flisk and flisk, as { spelling, count }, most frequent first. Code spans,
// URLs, paths and words that merely contain it (flisk-sh, FliskOS) are left out.
export function nameSpellings(text) {
	const counts = new Map();
	const prose = String(text)
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
		.replace(/\S*[/\\]\S*/g, " ");
	for (const m of prose.matchAll(/(?<![\w.@-])flisk(?![\w-])/gi))
		if (m[0] !== "Flisk" && m[0] !== "flisk") counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
	return [...counts.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b)).map(([spelling, count]) => ({ spelling, count }));
}

// The README's commands: its terminal quickstart (translation-drift's), else every shell block.
function readmeCommands(readme) {
	const block = quickstart(readme);
	const bodies = block ? [block.body] : codeBlocks(readme).filter((b) => ["bash", "sh", "shell", "zsh"].includes(b.lang)).map((b) => b.body);
	return bodies.flatMap(shellCommands).join("\n");
}

// The four checks over the surfaces, each { check, drift, surfaces: [{ source, value }] }.
export function brandChecks({ readme, packageJson, llms, website }) {
	let description = null;
	try {
		description = JSON.parse(packageJson || "{}").description ?? null;
	} catch {
		// Not JSON: no description.
	}
	const heroHtml = hero(website.index);
	const commands = readmeCommands(readme);
	const llmsCode = codeBlocks(llms).map((b) => b.body).join("\n") || llms;
	const surfaces = {
		headline: [
			{ source: "README.md H1", value: firstH1(readme) },
			{ source: "package.json description", value: description },
			{ source: "flisk.sh title (index.html)", value: yamlValue(website.index, "title") },
			{ source: "flisk.sh hero <h1>", value: htmlText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(heroHtml)?.[1] ?? "") || null },
			{ source: "flisk.sh tagline (_config.yml)", value: yamlValue(website.config, "tagline") },
		],
		lead: [
			{ source: "README.md quickstart", value: leadCommand(commands) },
			{ source: "docs/agents/llms.txt", value: leadCommand(llmsCode) },
			{ source: "flisk.sh hero", value: leadCommand(htmlText(heroHtml)) },
			{ source: "flisk.sh llms.txt", value: leadCommand(codeBlocks(website.llms).map((b) => b.body).join("\n") || website.llms) },
		],
		install: [
			{ source: "README.md", value: installCommand(codeBlocks(readme).map((b) => b.body).join("\n")) },
			{ source: "docs/agents/llms.txt", value: installCommand(llms) },
			{ source: "flisk.sh install box (_data/flisk.yml install_npm)", value: installCommand(yamlValue(website.data, "install_npm") ?? "") },
			{ source: "flisk.sh llms.txt", value: installCommand(website.llms) },
		],
	};
	const distinct = (list, key = (v) => v) => new Set(list.filter((s) => s.value).map((s) => key(s.value))).size;
	const spellings = [
		{ source: "README.md", text: readme },
		{ source: "docs/agents/llms.txt", text: llms },
		{ source: "flisk.sh hero and title", text: `${yamlValue(website.index, "title") ?? ""} ${htmlText(heroHtml)}` },
		{ source: "flisk.sh llms.txt", text: website.llms },
	].map((s) => ({ source: s.source, value: nameSpellings(s.text).map((x) => `${x.spelling} ${x.count}×`).join(", ") || null }));
	return [
		{ check: "headline", drift: distinct(surfaces.headline, (v) => normalise(v)) > 1, surfaces: surfaces.headline },
		{ check: "lead command", drift: distinct(surfaces.lead) > 1, surfaces: surfaces.lead },
		{ check: "install command", drift: distinct(surfaces.install) > 1, surfaces: surfaces.install },
		{ check: "name spelling", drift: spellings.some((s) => s.value), surfaces: spellings },
	];
}

export function measure({ root, gh }) {
	const website = {
		index: websiteFile(gh, "index.html"),
		config: websiteFile(gh, "_config.yml"),
		data: websiteFile(gh, "_data/flisk.yml"),
		llms: websiteFile(gh, "llms.txt"),
	};
	if (!website.index) return { value: null, summary: `${WEBSITE_REPO} index.html could not be read` };
	const checks = brandChecks({
		readme: read(root, "README.md"),
		packageJson: read(root, "package.json"),
		llms: read(root, "docs/agents/llms.txt"),
		website,
	});
	const drifted = checks.filter((c) => c.drift);
	return {
		value: drifted.length,
		max: checks.length,
		summary: drifted.length ? `drift in ${drifted.map((c) => c.check).join(", ")}` : "one brand on every surface",
		findings: drifted.flatMap((c) =>
			c.surfaces.filter((s) => s.value).map((s) => `${c.check}: ${s.source}: ${s.value}`),
		),
	};
}
