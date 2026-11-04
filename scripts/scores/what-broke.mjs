// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many first-run reports say something broke, and where. Counts boot reports ("I booted Flisk" form) with a real
// answer under "What broke", plus "tried: " reports that failed or were slow or odd, and buckets each one by keywords,
// so a launch-day pile of reports reads "docker 7, port 3" instead of a list to go through. A report can land in
// several buckets; one that matches none is "other".
import { formFields, issuesWithLabel } from "./lib.mjs";

export const meta = {
	id: "what-broke",
	title: "First-run reports where something broke",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "reports",
};

export const LABEL = "show-and-tell";
// .github/ISSUE_TEMPLATE/i-booted-flisk.yml
export const BOOT = { title: /^boot:/i, field: "What broke" };
// .github/ISSUE_TEMPLATE/try-it-and-report.yml
export const TRIED = {
	title: /^tried:/i,
	result: "How did it go?",
	broke: ["It failed", "It worked, but something was slow or odd"],
	field: "What did you see?",
};

// Answers to "What broke" that mean nothing did, compared lowercased and without punctuation.
const NOTHING = new Set(["", "no response", "nothing", "none", "n/a", "na", "no", "nope", "nothing broke"]);

// Bucket -> keywords. A keyword matches as a whole word, plural included ("container" matches "containers").
// Order breaks ties when two buckets have the same count.
export const BUCKETS = [
	["docker", ["docker", "dockerfile", "compose", "container", "orbstack", "colima", "podman"]],
	["tilt", ["tilt", "tiltfile", "starlark"]],
	["port", ["port", "eaddrinuse", "address already in use"]],
	["windows/wsl", ["windows", "wsl", "wsl2", "powershell", "crlf"]],
	["node/npm", ["node", "nodejs", "node.js", "npm", "npx", "pnpm", "yarn", "bun", "node_modules", "package.json"]],
	["permissions", ["permission", "eacces", "eperm", "sudo", "denied"]],
	["network/proxy", ["proxy", "network", "networking", "dns", "timeout", "timed out", "econnrefused", "econnreset",
		"enotfound", "certificate", "ssl", "tls", "firewall", "vpn"]],
	["database", ["database", "db", "postgres", "postgresql", "psql", "mysql", "mongo", "mongodb", "redis", "sqlite",
		"migration", "migrate", "migrator", "prisma", "drizzle"]],
	["memory/disk", ["memory", "oom", "ram", "disk", "no space", "enospc", "swap"]],
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = BUCKETS.map(([name, words]) => [name, new RegExp(`\\b(?:${words.map(escape).join("|")})s?\\b`, "i")]);

export function buckets(text) {
	const hits = MATCHERS.filter(([, re]) => re.test(String(text ?? ""))).map(([name]) => name);
	return hits.length ? hits : ["other"];
}

const nothing = (answer) =>
	NOTHING.has(
		String(answer ?? "")
			.toLowerCase()
			.replace(/[^a-z0-9/ ]/g, "")
			.trim(),
	);

// null when the issue is neither a boot nor a tried report; otherwise { broke, text }.
export function classify(issue) {
	const f = formFields(issue.body);
	const title = issue.title ?? "";
	if (BOOT.title.test(title) || BOOT.field in f) return { broke: !nothing(f[BOOT.field]), text: f[BOOT.field] };
	if (TRIED.title.test(title) || TRIED.result in f)
		return { broke: TRIED.broke.includes(f[TRIED.result]), text: f[TRIED.field] };
	return null;
}

export function measure(ctx) {
	let reports = 0;
	const counts = new Map();
	const findings = [];
	for (const issue of issuesWithLabel(ctx.gh, ctx.repo, LABEL)) {
		const r = classify(issue);
		if (!r) continue;
		reports++;
		if (!r.broke) continue;
		const hit = buckets(r.text);
		for (const b of hit) counts.set(b, (counts.get(b) ?? 0) + 1);
		findings.push(`#${issue.number} ${hit.join(", ")}`);
	}
	if (!reports) return { value: null, summary: "no boot or tried reports yet" };
	const order = [...BUCKETS.map(([name]) => name), "other"];
	const sorted = [...counts].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]));
	const split = sorted.map(([b, n]) => `${b} ${n}`).join(", ");
	return {
		value: findings.length,
		summary: `${findings.length} of ${reports} reports${split ? `: ${split}` : ""}`,
		findings,
	};
}
