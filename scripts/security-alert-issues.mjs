#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Turns published dependency advisories into contributor-ready GitHub issues.
//
// Dependabot alerts and osv-scanner code-scanning alerts are the two sources. Every
// open alert becomes one issue that carries the advisory detail (severity, CVSS, CWE,
// affected range, patched version, references) so a contributor can pick it up without
// reading the advisory first. The issue closes itself again when the alert is fixed.
//
//   node scripts/security-alert-issues.mjs [--dry-run] [--repo owner/name]
//
// --dry-run prints every decision and writes nothing. Needs gh authenticated with
// security-events: read and issues: write.
//
// Only issues carrying MANAGED_LABEL are touched, so a hand-written issue is never
// rewritten or closed by this script.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Label every issue this script owns. Issues are found through it, so a human issue
// without the label is out of reach.
export const MANAGED_LABEL = "security-alert";

// Hidden marker in the issue body. The alert number is the identity: an alert that
// reopens after a dismissal keeps the same number, so it maps back to the same issue.
export const MARKER_PREFIX = "<!-- tdk:security-alert:";
export const MARKER_SUFFIX = " -->";

// Labels with a fixed meaning, created when missing.
export const LABEL_DEFS = {
	security: { color: "1d76db", description: "Discussion topic" },
	vulnerability: {
		color: "d73a4a",
		description: "A published advisory affects a dependency in this repository",
	},
	"security-alert": {
		color: "b60205",
		description: "Created from a Dependabot or code-scanning alert by a workflow",
	},
	"auto-generated": {
		color: "ededed",
		description: "Written by a workflow, not by a person",
	},
	"area: dependencies": {
		color: "ededed",
		description: "Dependency manifests and lockfiles",
	},
	dependencies: {
		color: "0366d6",
		description: "Pull requests that update a dependency file",
	},
	"supply-chain": {
		color: "1d76db",
		description: "Discussion topic",
	},
	"help wanted": {
		color: "008672",
		description: "Extra attention is needed",
	},
	windows: { color: "5319e7", description: "Windows and WSL2 support" },
};

const SEVERITY_COLORS = {
	low: "0e8a16",
	medium: "fbca04",
	high: "d93f0b",
	critical: "b60205",
};
const SOURCE_COLORS = {
	dependabot: "0366d6",
	"code-scanning": "8250df",
};
const SCOPE_COLORS = {
	runtime: "d93f0b",
	development: "c2e0c6",
};

/** Marker for one alert. Stable across runs: the same alert always maps to the same issue. */
export function markerFor(source, number) {
	return `${MARKER_PREFIX}${source}:${number}${MARKER_SUFFIX}`;
}

/** The alert a body belongs to, or null when the body carries no marker. */
export function parseMarker(body) {
	const match = /<!-- tdk:security-alert:([a-z-]+):(\d+) -->/.exec(body ?? "");
	if (!match) return null;
	return { source: match[1], number: Number(match[2]) };
}

/** GitHub severity, normalised. Unknown values are treated as medium. */
export function normalizeSeverity(severity) {
	const value = String(severity ?? "").toLowerCase();
	if (value === "critical") return "critical";
	if (value === "high") return "high";
	if (value === "medium" || value === "moderate") return "medium";
	if (value === "low") return "low";
	return "medium";
}

/** "Package 'vite@8.3.1' is vulnerable to 'CVE-...' (also known as 'GHSA-...')." */
export function parseScannerMessage(message) {
	const text = message ?? "";
	const pkg = /Package '([^@']+)@([^']+)'/.exec(text);
	const ghsa = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(text);
	const cve = /CVE-\d{4}-\d+/i.exec(text);
	return {
		packageName: pkg ? pkg[1] : null,
		installedVersion: pkg ? pkg[2] : null,
		ghsaId: ghsa ? ghsa[0] : null,
		cveId: cve ? cve[0] : null,
	};
}

/** A Dependabot alert, in the shape both sources share. */
export function normalizeDependabotAlert(alert) {
	const advisory = alert.security_advisory ?? {};
	const vuln = (alert.security_vulnerabilities ?? [])[0] ?? {};
	return {
		key: `dependabot:${alert.number}`,
		source: "dependabot",
		alertNumber: alert.number,
		alertUrl: alert.html_url,
		title: advisory.summary ?? advisory.description?.split("\n")[0] ?? "Dependency advisory",
		severity: normalizeSeverity(advisory.severity),
		cvssScore: advisory.cvss?.score ?? null,
		cvssVector: advisory.cvss?.vector_string ?? null,
		ghsaId: advisory.ghsa_id ?? null,
		cveId: advisory.cve_id ?? null,
		packageName: alert.dependency?.package?.name ?? null,
		ecosystem: alert.dependency?.package?.ecosystem ?? null,
		manifestPath: alert.dependency?.manifest_path ?? null,
		scope: alert.dependency?.scope ?? null,
		vulnerableRange: vuln.vulnerable_version_range ?? null,
		patchedVersion: versionOf(vuln.first_patched_version) ?? null,
		installedVersion: null,
		description: advisory.description ?? "",
		cwes: (advisory.cwes ?? []).map((cwe) => ({
			id: cwe.cwe_id,
			name: cwe.name,
			description: cwe.description,
		})),
		references: advisory.references ?? [],
		publishedAt: advisory.published_at ?? null,
	};
}

/** A code-scanning alert. osv-scanner fills the rule, not `security_advisory`. */
export function normalizeCodeScanningAlert(alert) {
	const instance = alert.most_recent_instance ?? {};
	const parsed = parseScannerMessage(instance.message?.text ?? "");
	const rule = alert.rule ?? {};
	return {
		key: `code-scanning:${alert.number}`,
		source: "code-scanning",
		alertNumber: alert.number,
		alertUrl: alert.html_url,
		title: rule.description?.split("\n")[0] ?? parsed.ghsaId ?? "Scanner alert",
		severity: normalizeSeverity(rule.severity),
		cvssScore: null,
		cvssVector: null,
		ghsaId: parsed.ghsaId,
		cveId: parsed.cveId,
		packageName: parsed.packageName,
		ecosystem: null,
		manifestPath: instance.location?.path ?? null,
		scope: null,
		vulnerableRange: null,
		patchedVersion: null,
		installedVersion: parsed.installedVersion,
		description: rule.full_description ?? rule.description ?? "",
		cwes: [],
		references: [],
		publishedAt: null,
	};
}

/** A version arrives as a plain string from the global advisory API and as an object from the Dependabot API. */
export function versionOf(value) {
	if (typeof value === "string") return value;
	return value?.identifier ?? null;
}

/**
 * Fill the gaps a code-scanning alert leaves (severity, CVSS, CWE, patched version)
 * from the global advisory the alert points at.
 */
export function mergeAdvisory(finding, advisory) {
	if (!advisory) return finding;
	// The advisory lists every affected package. The entry for this package carries the
	// range and the fix that matter here; the first one may belong to another package.
	const entry =
		(advisory.vulnerabilities ?? []).find((v) => v.package?.name === finding.packageName) ??
		(advisory.vulnerabilities ?? [])[0];
	return {
		...finding,
		title: finding.title || advisory.summary,
		severity: normalizeSeverity(advisory.severity),
		cvssScore: advisory.cvss?.score ?? finding.cvssScore,
		cvssVector: advisory.cvss?.vector_string ?? finding.cvssVector,
		ghsaId: finding.ghsaId ?? advisory.ghsa_id ?? null,
		cveId: finding.cveId ?? advisory.cve_id ?? null,
		vulnerableRange: finding.vulnerableRange ?? entry?.vulnerable_version_range ?? null,
		patchedVersion: finding.patchedVersion ?? versionOf(entry?.first_patched_version) ?? null,
		description: finding.description || advisory.description || "",
		cwes: finding.cwes.length
			? finding.cwes
			: (advisory.cwes ?? []).map((cwe) => ({
					id: cwe.cwe_id,
					name: cwe.name,
					description: cwe.description,
				})),
		references: finding.references.length ? finding.references : (advisory.references ?? []),
		publishedAt: finding.publishedAt ?? advisory.published_at ?? null,
	};
}

/** Package names become label names, so the characters GitHub forbids are removed. */
export function sanitizeLabelPart(value) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** The label set for one finding. */
export function labelsFor(finding) {
	const labels = new Set([
		"security",
		"vulnerability",
		MANAGED_LABEL,
		"auto-generated",
		"area: dependencies",
		"dependencies",
		"supply-chain",
		"help wanted",
		`severity: ${normalizeSeverity(finding.severity)}`,
		`source: ${finding.source}`,
	]);
	const pkg = sanitizeLabelPart(finding.packageName);
	if (pkg) labels.add(`package: ${pkg}`);
	const ecosystem = sanitizeLabelPart(finding.ecosystem);
	if (ecosystem) labels.add(`ecosystem: ${ecosystem}`);
	const scope = sanitizeLabelPart(finding.scope);
	if (scope) labels.add(`scope: ${scope}`);
	for (const cwe of (finding.cwes ?? []).slice(0, 3)) {
		const id = sanitizeLabelPart(String(cwe.id ?? "").replace(/^CWE-/, ""));
		if (id) labels.add(`cwe: ${id}`);
	}
	// The Windows advisories are the ones that turn a dependency bump into a real
	// exposure, so they get the platform label contributors filter on.
	const text = `${finding.title ?? ""} ${finding.description ?? ""}`;
	if (/windows|win32|\bntlm\b/i.test(text)) labels.add("windows");
	return [...labels].sort();
}

/** Every label this script can apply. Labels outside this set belong to people. */
export function managedLabelSet(findings) {
	const labels = new Set(Object.keys(LABEL_DEFS));
	for (const finding of findings) {
		for (const label of labelsFor(finding)) labels.add(label);
	}
	return labels;
}

/** The title of the issue for one finding. */
export function titleFor(finding) {
	const summary = (finding.title ?? "Dependency advisory").replace(/\s+/g, " ").trim();
	const manifest = finding.manifestPath ? ` (${finding.manifestPath})` : "";
	return `[security] ${finding.packageName ?? "dependency"}: ${summary}${manifest}`;
}

/** A one-line summary of the finding, used as the issue lede. */
export function ledeFor(finding) {
	const where = finding.manifestPath ? ` as resolved in \`${finding.manifestPath}\`` : "";
	const patched = finding.patchedVersion
		? `The fix is ${finding.patchedVersion}.`
		: "No patched version is published yet.";
	return `A published advisory affects **${finding.packageName ?? "a dependency"}**${where}. ${patched}`;
}

/** Other open findings for the same advisory, so one fix can be read in one place. */
export function relatedFindings(finding, findings) {
	return findings.filter(
		(other) =>
			other.key !== finding.key &&
			((finding.ghsaId && other.ghsaId === finding.ghsaId) ||
				(finding.cveId && other.cveId === finding.cveId)),
	);
}

// GitHub rejects an issue body over 65536 characters, and an advisory can carry a
// long proof of concept. Keep the whole text up to a size that always fits.
const MAX_DESCRIPTION = 20000;

/** Shorten text that would make the issue body too long to post. */
export function truncate(text, limit = MAX_DESCRIPTION) {
	if (text.length <= limit) return text;
	return `${text.slice(0, limit)}\n\n_(truncated; read the full advisory at the link above)_`;
}

/** The issue body. Every field the advisory gives us, so the issue stands on its own. */
export function bodyFor(finding, findings = []) {
	const lines = [markerFor(finding.source, finding.alertNumber), "", ledeFor(finding), ""];
	lines.push("## Advisory", "");
	if (finding.ghsaId) {
		lines.push(`- GHSA: [${finding.ghsaId}](https://github.com/advisories/${finding.ghsaId})`);
	}
	if (finding.cveId) {
		lines.push(`- CVE: [${finding.cveId}](https://www.cve.org/CVERecord?id=${finding.cveId})`);
	}
	lines.push(`- Severity: **${normalizeSeverity(finding.severity)}**`);
	if (finding.cvssScore) {
		const vector = finding.cvssVector ? ` (\`${finding.cvssVector}\`)` : "";
		lines.push(`- CVSS: ${finding.cvssScore}${vector}`);
	}
	if (finding.publishedAt) lines.push(`- Published: ${finding.publishedAt.slice(0, 10)}`);
	if (finding.alertUrl) lines.push(`- Alert: ${finding.alertUrl}`);
	lines.push("");

	lines.push("## Affected dependency", "");
	lines.push("| Field | Value |", "| --- | --- |");
	lines.push(`| Package | \`${finding.packageName ?? "unknown"}\` |`);
	if (finding.ecosystem) lines.push(`| Ecosystem | ${finding.ecosystem} |`);
	if (finding.manifestPath) lines.push(`| Manifest | \`${finding.manifestPath}\` |`);
	if (finding.installedVersion) {
		lines.push(`| Resolved version | \`${finding.installedVersion}\` |`);
	}
	if (finding.vulnerableRange) {
		lines.push(`| Vulnerable range | \`${finding.vulnerableRange}\` |`);
	}
	if (finding.patchedVersion) lines.push(`| Patched version | \`${finding.patchedVersion}\` |`);
	if (finding.scope) lines.push(`| Scope | ${finding.scope} |`);
	lines.push("");

	if ((finding.cwes ?? []).length) {
		lines.push("## Weakness", "");
		for (const cwe of finding.cwes) {
			lines.push(`- ${cwe.id}: ${cwe.name ?? ""}`.trimEnd());
		}
		lines.push("");
	}

	if (finding.description) {
		lines.push("## Description", "", truncate(finding.description.trim()), "");
	}

	if ((finding.references ?? []).length) {
		lines.push("## References", "");
		for (const reference of finding.references) {
			const url = typeof reference === "string" ? reference : reference.url;
			if (url) lines.push(`- ${url}`);
		}
		lines.push("");
	}

	const related = relatedFindings(finding, findings);
	if (related.length) {
		lines.push("## Also affected", "");
		for (const other of related) {
			const where = other.manifestPath ? `\`${other.manifestPath}\`` : "another manifest";
			lines.push(`- ${other.packageName ?? "the same package"} in ${where}`);
		}
		lines.push("");
	}

	lines.push("## How to fix", "");
	if (finding.patchedVersion) {
		lines.push(
			`1. Bump \`${finding.packageName ?? "the dependency"}\` to \`${finding.patchedVersion}\`` +
				`${finding.manifestPath ? ` in \`${finding.manifestPath}\`` : ""} and in every other manifest that pins it.`,
			"2. Regenerate the lockfile with the package manager that manifest uses.",
		);
	} else {
		lines.push(
			`1. No patched version of \`${finding.packageName ?? "the dependency"}\` is published yet.` +
				`${
					finding.manifestPath
						? ` Until one is, keep \`${finding.manifestPath}\` off the affected range by pinning a version that is not in it.`
						: " Until one is, keep the affected version out of the manifests that ship to users."
				}`,
			"2. Watch the advisory for the fix, and take the step above as soon as it lands.",
		);
	}
	lines.push(
		"3. Run the checks: `bun run typecheck`, `bun run lint`, `bun run test`.",
		"4. Open a pull request that says `Fixes #<this issue number>`.",
		"",
	);
	lines.push(
		"## Picking this up",
		"",
		"Comment `I'll take this` to be assigned. A draft pull request is welcome at any stage;",
		"sign the commits off with `git commit -s`.",
		"",
	);
	lines.push(
		"_This issue is written by the security-alert-issues workflow and closes itself when the alert is fixed._",
		"",
	);
	return lines.join("\n");
}

/**
 * Whether a finding is about a published advisory.
 *
 * The code-scanning results carry more than advisories: Semgrep's SAST rules and the
 * OpenSSF Scorecard rules land there too. Those are not advisories, have no CVE or
 * GHSA to link, and a contributor cannot fix them by bumping a version, so they are
 * not turned into issues here.
 */
export function isAdvisory(finding) {
	if (finding.source === "dependabot") return true;
	return Boolean(finding.packageName && (finding.ghsaId || finding.cveId));
}

/**
 * What to do for every managed issue and every open finding.
 * `managed` are the issues carrying MANAGED_LABEL, `findings` the open alerts.
 */
export function planSync(findings, managed) {
	const open = new Map(findings.map((finding) => [finding.key, finding]));
	const byMarker = new Map();
	for (const issue of managed) {
		const parsed = parseMarker(issue.body ?? "");
		if (parsed) byMarker.set(`${parsed.source}:${parsed.number}`, issue);
	}
	const actions = [];
	for (const finding of findings) {
		const existing = byMarker.get(finding.key);
		if (!existing) {
			actions.push({ action: "create", finding, issue: null });
			continue;
		}
		const body = bodyFor(finding, findings);
		const labels = labelsFor(finding);
		if (existing.state === "closed") {
			actions.push({ action: "reopen", finding, issue: existing, body, labels });
		} else if ((existing.body ?? "") !== body || !sameLabels(existing.labels ?? [], labels)) {
			actions.push({ action: "update", finding, issue: existing, body, labels });
		} else {
			actions.push({ action: "unchanged", finding, issue: existing, body, labels });
		}
	}
	for (const [key, issue] of byMarker) {
		if (open.has(key)) continue;
		actions.push({ action: "close", finding: null, issue });
	}
	return actions;
}

/** Label comparison that ignores order. */
export function sameLabels(a, b) {
	const left = [...new Set(a)].sort();
	const right = [...new Set(b)].sort();
	return left.length === right.length && left.every((label, i) => label === right[i]);
}

function gh(args, input) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		input,
		maxBuffer: 64 * 1024 * 1024,
	});
}

/** `gh api --paginate --slurp` returns one array per page. */
function ghApiPages(path) {
	const parsed = JSON.parse(gh(["api", "--paginate", "--slurp", path]));
	return Array.isArray(parsed[0]) ? parsed.flat() : parsed;
}

/**
 * A source that is switched off (code scanning is not enabled everywhere) answers
 * 404. That is not a failure of the run: the other source still has work.
 */
function ghApiPagesOrEmpty(path, what) {
	try {
		return ghApiPages(path);
	} catch (error) {
		// gh puts the API's answer on stderr; the message alone does not say why.
		const reason = (error.stderr ?? error.message).toString().trim().split("\n")[0];
		console.log(`::warning::Could not read ${what}: ${reason}`);
		return [];
	}
}

function listOpenAlerts(repo) {
	return {
		dependabot: ghApiPagesOrEmpty(
			`repos/${repo}/dependabot/alerts?state=open&per_page=100`,
			"dependabot alerts",
		),
		"code-scanning": ghApiPagesOrEmpty(
			`repos/${repo}/code-scanning/alerts?state=open&per_page=100`,
			"code-scanning alerts",
		),
	};
}

function listManagedIssues(repo) {
	const pages = ghApiPages(
		`repos/${repo}/issues?state=all&labels=${encodeURIComponent(MANAGED_LABEL)}&per_page=100`,
	);
	return pages.filter((issue) => !issue.pull_request);
}

function globalAdvisory(ghsaId) {
	if (!ghsaId) return null;
	try {
		return JSON.parse(gh(["api", `advisories/${ghsaId}`]));
	} catch {
		return null;
	}
}

function existingLabels(repo) {
	return new Set(
		JSON.parse(gh(["label", "list", "--repo", repo, "--limit", "500", "--json", "name"])).map(
			(label) => label.name,
		),
	);
}

/** The colour of a dynamic label, picked from the kind of value it carries. */
export function colorForLabel(label) {
	const value = label.includes(": ") ? label.split(": ").slice(1).join(": ") : "";
	if (label.startsWith("severity: ")) return SEVERITY_COLORS[value] ?? "fbca04";
	if (label.startsWith("source: ")) return SOURCE_COLORS[value] ?? "0366d6";
	if (label.startsWith("scope: ")) return SCOPE_COLORS[value] ?? "c2e0c6";
	if (label.startsWith("cwe: ")) return "5319e7";
	return "1d76db";
}

/** Create the labels this script applies, so a label is never silently dropped. */
export function planLabels(findings) {
	const wanted = new Map();
	for (const [name, def] of Object.entries(LABEL_DEFS)) {
		wanted.set(name, { color: def.color, description: def.description });
	}
	for (const finding of findings) {
		for (const label of labelsFor(finding)) {
			if (wanted.has(label)) continue;
			wanted.set(label, {
				color: colorForLabel(label),
				description: "Applied by the security-alert-issues workflow",
			});
		}
	}
	return wanted;
}

function ensureLabels(repo, wanted) {
	const existing = existingLabels(repo);
	const created = [];
	for (const [name, def] of wanted) {
		if (existing.has(name)) continue;
		gh([
			"label",
			"create",
			name,
			"--repo",
			repo,
			"--color",
			def.color,
			"--description",
			def.description,
		]);
		created.push(name);
	}
	return created;
}

function writeIssue(repo, action, findings) {
	const finding = action.finding;
	const body = action.body ?? bodyFor(finding, findings);
	const labels = action.labels ?? labelsFor(finding);
	if (action.action === "create") {
		const args = ["issue", "create", "--repo", repo, "--title", titleFor(finding), "--body-file", "-"];
		for (const label of labels) args.push("--label", label);
		const url = gh(args, body).trim();
		return { number: Number(url.split("/").pop()), url };
	}
	const issueNumber = action.issue.number;
	if (action.action === "reopen") {
		gh(["issue", "reopen", String(issueNumber), "--repo", repo]);
	}
	if (action.action === "update" || action.action === "reopen") {
		gh(
			["api", "--method", "PATCH", `repos/${repo}/issues/${issueNumber}`, "--input", "-"],
			JSON.stringify({ body, title: titleFor(finding) }),
		);
	}
	// Replace this script's own labels and leave the rest alone, so a `claimed`
	// label a contributor earned is never taken away.
	const managed = managedLabelSet(findings);
	const current = action.issue.labels ?? [];
	const final = [...new Set([...current.filter((label) => !managed.has(label)), ...labels])];
	gh(
		["api", "--method", "PUT", `repos/${repo}/issues/${issueNumber}/labels`, "--input", "-"],
		JSON.stringify({ labels: final }),
	);
	return { number: issueNumber, url: action.issue.html_url };
}

function closeIssue(repo, issue) {
	gh([
		"issue",
		"close",
		String(issue.number),
		"--repo",
		repo,
		"--comment",
		"The advisory behind this issue no longer reports an open vulnerability, so it is closed. The issue stays as the record of the advisory.",
	]);
}

function parseArgs(argv) {
	const out = {
		dryRun: false,
		repo: process.env.GITHUB_REPOSITORY ?? "tdk-landscape/tdk-cli-core",
	};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--dry-run") out.dryRun = true;
		else if (arg === "--repo") out.repo = argv[++i];
		else throw new Error(`unknown argument: ${arg}`);
	}
	return out;
}

function main(argv) {
	const opts = parseArgs(argv);
	const repo = opts.repo;
	const alerts = listOpenAlerts(repo);
	const findings = [];
	for (const alert of alerts.dependabot) {
		findings.push(normalizeDependabotAlert(alert));
	}
	for (const alert of alerts["code-scanning"]) {
		const finding = mergeAdvisory(
			normalizeCodeScanningAlert(alert),
			globalAdvisory(normalizeCodeScanningAlert(alert).ghsaId),
		);
		if (!isAdvisory(finding)) {
			console.log(
				`::warning::Skipping code-scanning alert #${alert.number} (${alert.rule?.id ?? "unknown"}): not a published advisory.`,
			);
			continue;
		}
		findings.push(finding);
	}
	const managed = listManagedIssues(repo);
	const actions = planSync(findings, managed);
	const wanted = planLabels(findings);

	// Labels first: an issue created without its labels would lose the severity and
	// package filters, and `gh issue create` refuses a label that does not exist.
	const created = opts.dryRun ? [] : ensureLabels(repo, wanted);
	if (created.length) console.log(`created labels: ${created.join(", ")}`);

	for (const action of actions) {
		const label = action.finding
			? `${action.finding.key} ${action.finding.packageName ?? ""}`.trim()
			: `issue #${action.issue.number}`;
		console.log(`${action.action}: ${label}`);
		if (opts.dryRun) continue;
		if (action.action === "close") {
			closeIssue(repo, action.issue);
			continue;
		}
		writeIssue(repo, action, findings);
	}
	console.log(
		`${findings.length} open alert(s), ${managed.length} managed issue(s), ${actions.length} action(s)`,
	);
	return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
