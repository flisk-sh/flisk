#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Label every issue this script owns. Issues are found through it, so a human issue
// without the label is out of reach.
export const MANAGED_LABEL = "security-alert";

// The label an issue carries when the version the repository pins is not in the
// affected range: the advisory is real, this repository is not affected by it.
export const NOT_AFFECTED_LABEL = "not-affected";

// Hidden marker in the issue body. The alert number is the identity: an alert that
// reopens after a dismissal keeps the same number, so it maps back to the same issue.
export const MARKER_PREFIX = "<!-- flisk:security-alert:";
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
	"not-affected": {
		color: "c2e0c6",
		description: "The advisory does not affect the version the repository pins",
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

/**
 * The key of a finding: the advisory and the manifest it applies to.
 *
 * The same advisory shows up in more than one source (Dependabot and the osv-scanner
 * both report it), and a repository can hold the same advisory in more than one
 * manifest. Keying on the advisory and the manifest gives one issue per thing to fix,
 * whichever source reported it and however many scanners see it.
 */
export function findingKey(finding) {
	const advisory = finding.ghsaId ?? finding.cveId ?? finding.packageName ?? "advisory";
	const manifest = finding.manifestPath ?? "repository";
	return `${advisory}|${manifest}`.replace(/[^A-Za-z0-9._|/-]+/g, "-");
}

/**
 * Whether two findings are the same thing to fix: the same advisory in the same
 * manifest. One source may know the GHSA and the other only the CVE, so either
 * identifier is enough.
 */
export function sameAdvisory(a, b) {
	if ((a.manifestPath ?? "repository") !== (b.manifestPath ?? "repository")) return false;
	if (a.ghsaId && b.ghsaId && a.ghsaId === b.ghsaId) return true;
	return Boolean(a.cveId && b.cveId && a.cveId === b.cveId);
}

/**
 * The key of a group of findings that are the same thing to fix. The GHSA is used
 * when the group has one, because every source reports it; the CVE is the fallback.
 */
export function groupKey(findings) {
	const ghsa = findings.find((finding) => finding.ghsaId)?.ghsaId;
	const cve = findings.find((finding) => finding.cveId)?.cveId;
	const advisory = ghsa ?? cve ?? findings[0].packageName ?? "advisory";
	const manifest = findings[0].manifestPath ?? "repository";
	return `${advisory}|${manifest}`.replace(/[^A-Za-z0-9._|/-]+/g, "-");
}

/** The findings that are the same thing to fix, grouped. The first one leads each group. */
export function groupFindings(findings) {
	const groups = [];
	for (const finding of findings) {
		const group = groups.find((candidate) => sameAdvisory(candidate[0], finding));
		if (group) group.push(finding);
		else groups.push([finding]);
	}
	return groups;
}

/** Marker for one finding. Stable across runs: the same finding always maps to the same issue. */
export function markerFor(key) {
	return `${MARKER_PREFIX}${key}${MARKER_SUFFIX}`;
}

/** The finding a body belongs to, or null when the body carries no marker. */
export function parseMarker(body) {
	// The colon is allowed so a marker in the older `source:number` shape is still read:
	// no finding carries such a key, so the sync closes that issue instead of leaving
	// it open for ever.
	const match = /<!-- flisk:security-alert:([A-Za-z0-9._:|/-]+) -->/.exec(body ?? "");
	if (!match) return null;
	return { key: match[1] };
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
	const vuln =
		vulnerabilityEntry(alert.security_vulnerabilities, alert.dependency?.package?.ecosystem) ?? {};
	const finding = {
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
	finding.key = findingKey(finding);
	return finding;
}

/** A code-scanning alert. osv-scanner fills the rule, not `security_advisory`. */
export function normalizeCodeScanningAlert(alert) {
	const instance = alert.most_recent_instance ?? {};
	const parsed = parseScannerMessage(instance.message?.text ?? "");
	const rule = alert.rule ?? {};
	const finding = {
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
	finding.key = findingKey(finding);
	return finding;
}

/** A version arrives as a plain string from the global advisory API and as an object from the Dependabot API. */
export function versionOf(value) {
	if (typeof value === "string") return value;
	return value?.identifier ?? null;
}

/**
 * The vulnerability entry for one ecosystem.
 *
 * An advisory lists one entry per ecosystem a package is published for, and the
 * entries carry different ranges, so the entry of the ecosystem the alert names is
 * the one that says anything about this repository.
 */
export function vulnerabilityEntry(vulnerabilities, ecosystem) {
	const list = vulnerabilities ?? [];
	if (!list.length) return null;
	return (
		list.find((entry) => ecosystem && entry?.package?.ecosystem === ecosystem) ??
		list.find((entry) => entry?.vulnerable_version_range || entry?.first_patched_version) ??
		list[0]
	);
}

/**
 * The entry of the global advisory that belongs to this finding: the same package
 * and ecosystem first, then the same package, and only then the first entry, which
 * may belong to another package entirely.
 */
export function advisoryEntry(advisory, finding) {
	const list = advisory?.vulnerabilities ?? [];
	if (!list.length) return null;
	return (
		list.find(
			(entry) =>
				entry?.package?.name === finding.packageName &&
				entry?.package?.ecosystem === finding.ecosystem,
		) ??
		list.find((entry) => entry?.package?.name === finding.packageName) ??
		list[0]
	);
}

/**
 * Fill the gaps a code-scanning alert leaves (severity, CVSS, CWE, patched version)
 * from the global advisory the alert points at.
 */
export function mergeAdvisory(finding, advisory) {
	if (!advisory) return finding;
	// The advisory lists every affected package. The entry for this package carries the
	// range and the fix that matter here; the first one may belong to another package.
	const entry = advisoryEntry(advisory, finding);
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

/**
 * The version a manifest pins for a package.
 *
 * A pip requirements file written by pip-compile pins one version per package
 * (`name==version`). A package.json declares a range, which says what is allowed
 * rather than what is installed. A lockfile pins a resolved tree, not a version.
 * The kind says which of those the manifest turned out to be: `pinned`, `range` or
 * `unknown`.
 */
export const PINNED_KIND = { PINNED: "pinned", RANGE: "range", UNKNOWN: "unknown" };

/** PEP 503 name normalisation: lower case, and runs of -, _ and . become one -. */
export function normalizePackageName(name) {
	return String(name ?? "")
		.trim()
		.toLowerCase()
		.replace(/[-_.]+/g, "-");
}

/**
 * The requirement a requirements file states for a package: the spec and whether it
 * is an exact pin. A pip-compile file writes the pin over two lines, the
 * requirement and its hashes continued with a backslash.
 */
export function requirementFor(text, packageName) {
	const wanted = normalizePackageName(packageName);
	if (!wanted) return null;
	for (const line of String(text ?? "").split(/\r?\n/)) {
		const requirement = line.replace(/\\$/, "").split(/\s+#/)[0].trim();
		if (!requirement || requirement.startsWith("#")) continue;
		const match = /^([A-Za-z0-9._-]+)\s*(?:\[[^\]]*\])?\s*([=<>!~].*)?$/.exec(requirement);
		if (!match) continue;
		if (normalizePackageName(match[1]) !== wanted) continue;
		const spec = (match[2] ?? "").trim();
		return { spec, exact: /^==\s*[A-Za-z0-9._*+!-]+$/.test(spec) };
	}
	return null;
}

/** The version a requirements file pins for a package, or null when it pins a range. */
export function pinnedVersionFromRequirements(text, packageName) {
	const requirement = requirementFor(text, packageName);
	if (!requirement || !requirement.exact) return null;
	return requirement.spec.replace(/^==\s*/, "").trim();
}

/**
 * The dependency a package.json declares for a package.
 *
 * An exact version is a pin. Anything else is a range, which says what is allowed,
 * not what is installed, so the version could not be read.
 */
export function pinnedVersionFromPackageJson(text, packageName) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		return null;
	}
	for (const group of [
		"dependencies",
		"devDependencies",
		"optionalDependencies",
		"peerDependencies",
	]) {
		const dependencies = parsed?.[group];
		if (!dependencies || typeof dependencies !== "object") continue;
		const entry = Object.entries(dependencies).find(([name]) => name === packageName);
		if (!entry) continue;
		const range = String(entry[1] ?? "").trim();
		if (!range) continue;
		if (/^\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?$/.test(range)) {
			return { version: range, range: null, kind: PINNED_KIND.PINNED };
		}
		return { version: null, range, kind: PINNED_KIND.RANGE };
	}
	return null;
}

/** Whether a manifest is a lockfile, which pins a resolved tree rather than a version. */
export function isLockfile(manifestPath) {
	return /(^|\/)(bun\.lock|bun\.lockb|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock)$/.test(
		String(manifestPath ?? ""),
	);
}

/**
 * The version the manifest the alert names pins for the package.
 *
 * The manifest is read as text: a requirements file pins one version, a
 * package.json declares a range, and anything else pins no version at all.
 */
export function pinnedVersionFor(manifestText, packageName, manifestPath) {
	const empty = { version: null, range: null, kind: PINNED_KIND.UNKNOWN };
	if (manifestText === null || manifestText === undefined) return empty;
	const path = String(manifestPath ?? "");
	if (path.endsWith("package.json")) {
		return pinnedVersionFromPackageJson(manifestText, packageName) ?? empty;
	}
	if (path.endsWith(".txt") || path.endsWith(".in")) {
		const version = pinnedVersionFromRequirements(manifestText, packageName);
		if (version) return { version, range: null, kind: PINNED_KIND.PINNED };
		const requirement = requirementFor(manifestText, packageName);
		if (requirement) return { version: null, range: requirement.spec, kind: PINNED_KIND.RANGE };
	}
	return empty;
}

/** Why the version could not be read, in words a contributor can act on. */
export function pinnedVersionReason(pinned, manifestPath) {
	if (pinned?.kind === PINNED_KIND.RANGE) {
		return `the manifest pins a range (\`${pinned.range}\`), not one version`;
	}
	if (isLockfile(manifestPath)) {
		return "the manifest is a lockfile, so it pins a resolved tree rather than one version";
	}
	return "the manifest carries no version for this package";
}

/** A version split into its numbers and the pre-release suffix after them. */
export function parseVersion(value) {
	const text = String(value ?? "")
		.trim()
		.replace(/^v/i, "");
	const match = /^(\d+(?:\.\d+)*)(.*)$/.exec(text);
	if (!match) return null;
	return {
		numbers: match[1].split(".").map(Number),
		suffix: match[2].replace(/^[.\-_+]/, ""),
	};
}

/**
 * Compare two versions: -1 when the first is older, 0 when they are the same, 1 when
 * it is newer. null when either version cannot be read.
 */
export function compareVersions(a, b) {
	const left = parseVersion(a);
	const right = parseVersion(b);
	if (!left || !right) return null;
	const length = Math.max(left.numbers.length, right.numbers.length);
	for (let index = 0; index < length; index += 1) {
		const leftNumber = left.numbers[index] ?? 0;
		const rightNumber = right.numbers[index] ?? 0;
		if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
	}
	// A pre-release comes before the release it leads to: 1.0.0rc1 is older than 1.0.0.
	if (left.suffix === right.suffix) return 0;
	if (!left.suffix) return 1;
	if (!right.suffix) return -1;
	return left.suffix < right.suffix ? -1 : 1;
}

/** The two bounds a caret range allows: `^1.2.3` is at least 1.2.3 and below 2.0.0. */
function caretBounds(version) {
	const parsed = parseVersion(version);
	if (!parsed) return null;
	const upper = [...parsed.numbers];
	let index = 0;
	while (index < upper.length && upper[index] === 0) index += 1;
	const position = index === upper.length ? 0 : index;
	upper[position] += 1;
	for (let rest = position + 1; rest < upper.length; rest += 1) upper[rest] = 0;
	return [
		{ op: ">=", version },
		{ op: "<", version: upper.join(".") },
	];
}

/** The two bounds a tilde range allows: `~1.2.3` is at least 1.2.3 and below 1.3.0. */
function tildeBounds(version) {
	const parsed = parseVersion(version);
	if (!parsed) return null;
	const upper = [...parsed.numbers];
	if (upper.length >= 2) {
		upper[upper.length - 2] += 1;
		upper[upper.length - 1] = 0;
	} else {
		upper[0] += 1;
	}
	return [
		{ op: ">=", version },
		{ op: "<", version: upper.join(".") },
	];
}

/**
 * A range read into its constraints. `>= 1.0, < 2.0` becomes two constraints and
 * `1.0 || 2.0` two alternatives. null when the range cannot be read.
 */
export function parseVersionRange(range) {
	const text = String(range ?? "").trim();
	if (!text) return null;
	const alternatives = [];
	for (const alternative of text.split("||")) {
		const constraints = [];
		// A range may separate its constraints with a comma or with a space.
		let rest = alternative.replace(/,/g, " ").trim();
		while (rest) {
			const match = /^\s*(>=|<=|==|!=|>|<|=|\^|~)?\s*([^\s,]+)/.exec(rest);
			if (!match) return null;
			rest = rest.slice(match[0].length);
			const op = match[1] ?? "==";
			const version = match[2];
			// A wildcard says nothing about the version it stands for.
			if (!version || /[*xX]/.test(version) || !parseVersion(version)) return null;
			if (op === "^") {
				const bounds = caretBounds(version);
				if (!bounds) return null;
				constraints.push(...bounds);
			} else if (op === "~") {
				const bounds = tildeBounds(version);
				if (!bounds) return null;
				constraints.push(...bounds);
			} else {
				constraints.push({ op, version });
			}
		}
		if (!constraints.length) return null;
		alternatives.push(constraints);
	}
	return alternatives.length ? alternatives : null;
}

/** Whether one version meets one constraint. */
function satisfies(version, constraint) {
	const compared = compareVersions(version, constraint.version);
	if (compared === null) return false;
	switch (constraint.op) {
		case ">=":
			return compared >= 0;
		case ">":
			return compared > 0;
		case "<=":
			return compared <= 0;
		case "<":
			return compared < 0;
		case "!=":
			return compared !== 0;
		default:
			return compared === 0;
	}
}

/**
 * Whether a version falls inside a range. null when the range cannot be read, so
 * the caller falls back to the fixed version.
 */
export function versionInRange(version, range) {
	const parsed = parseVersionRange(range);
	if (!parsed) return null;
	if (!parseVersion(version)) return null;
	return parsed.some((constraints) => constraints.every((constraint) => satisfies(version, constraint)));
}

/**
 * What the version the manifest pins means for the advisory.
 *
 * `affected` when the pinned version is inside the vulnerable range, `not-affected`
 * when it is the fixed version or newer, and `unknown` when the version could not be
 * read or the advisory carries no range to read it against. The judgement stays with
 * a person when the answer is unknown.
 */
export function assessPinnedVersion({ pinned, patched, range, reason }) {
	const version = pinned?.version ?? null;
	if (!version) {
		return {
			status: "unknown",
			verdict: "The pinned version could not be read",
			reason: reason ?? "the manifest carries no version for this package",
		};
	}
	const inRange = range ? versionInRange(version, range) : null;
	if (inRange === true) {
		return {
			status: "affected",
			verdict: "The pinned version is affected",
			reason: "it is inside the vulnerable range",
		};
	}
	if (inRange === false) {
		return {
			status: "not-affected",
			verdict: "The pinned version is not affected",
			reason: "it is outside the vulnerable range",
		};
	}
	if (patched) {
		const compared = compareVersions(version, patched);
		if (compared !== null) {
			if (compared < 0) {
				return {
					status: "affected",
					verdict: "The pinned version is affected",
					reason: `it is before the fixed version ${patched}`,
				};
			}
			return {
				status: "not-affected",
				verdict: "The pinned version is not affected",
				reason:
					compared === 0
						? `it is the fixed version ${patched}`
						: `it is newer than the fixed version ${patched}`,
			};
		}
	}
	return {
		status: "unknown",
		verdict: "The pinned version could not be compared",
		reason: "the advisory carries no range or fixed version to compare it with",
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
		MANAGED_LABEL,
		"auto-generated",
		"area: dependencies",
		"dependencies",
		"supply-chain",
		`severity: ${normalizeSeverity(finding.severity)}`,
		`source: ${finding.source}`,
	]);
	// A finding the repository is not affected by is not a vulnerability here and
	// nobody is asked to take it up, so it does not carry those two labels.
	if (isNotAffected(finding)) {
		labels.add(NOT_AFFECTED_LABEL);
	} else {
		labels.add("vulnerability");
		labels.add("help wanted");
	}
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

/**
 * The label namespaces this script owns: a fixed set, plus every dynamic label
 * (severity, source, package, ecosystem, scope, weakness).
 *
 * The namespaces are owned rather than the exact labels of the current finding, so a
 * label left over from an earlier run — a `severity: medium` on an advisory that is
 * high now — is replaced instead of kept next to the new one. Labels outside these
 * namespaces belong to people.
 */
export const MANAGED_LABEL_PREFIXES = [
	"severity: ",
	"source: ",
	"package: ",
	"ecosystem: ",
	"scope: ",
	"cwe: ",
];

/** Every label this script can apply. Labels outside this set belong to people. */
export function managedLabelSet(findings) {
	const labels = new Set(Object.keys(LABEL_DEFS));
	for (const finding of findings) {
		for (const label of labelsFor(finding)) labels.add(label);
	}
	return labels;
}

/** Whether a label belongs to a namespace this script owns. */
export function isManagedLabel(label, managed) {
	if (managed.has(label)) return true;
	return MANAGED_LABEL_PREFIXES.some((prefix) => label.startsWith(prefix));
}

/** The title of the issue for one finding. */
export function titleFor(finding) {
	const summary = (finding.title ?? "Dependency advisory").replace(/\s+/g, " ").trim();
	const manifest = finding.manifestPath ? ` (${finding.manifestPath})` : "";
	return `[security] ${finding.packageName ?? "dependency"}: ${summary}${manifest}`;
}

/** Whether the version the repository pins is outside the affected range. */
export function isNotAffected(finding) {
	return finding.assessment?.status === "not-affected";
}

/** A one-line summary of the finding, used as the issue lede. */
export function ledeFor(finding) {
	const where = finding.manifestPath ? ` as resolved in \`${finding.manifestPath}\`` : "";
	const patched = finding.patchedVersion
		? `The fix is ${finding.patchedVersion}.`
		: "No patched version is published yet.";
	if (isNotAffected(finding)) {
		const manifest = finding.manifestPath ? `\`${finding.manifestPath}\`` : "the manifest";
		return (
			`A published advisory affects **${finding.packageName ?? "a dependency"}**, ` +
			`but the version ${manifest} pins is not in the affected range. ${patched}`
		);
	}
	return `A published advisory affects **${finding.packageName ?? "a dependency"}**${where}. ${patched}`;
}

/**
 * What the version the manifest pins means for this repository, in words.
 *
 * The pinned version and the fixed version stand next to each other, so a reader can
 * see the call without opening the advisory.
 */
export function affectedText(finding) {
	const assessment = finding.assessment;
	if (!assessment) return "";
	const where = finding.manifestPath ? `\`${finding.manifestPath}\`` : "the manifest";
	const packageName = finding.packageName ?? "the dependency";
	if (assessment.status === "unknown") {
		return (
			`The version ${where} pins for **${packageName}** could not be read: ` +
			`${assessment.reason}. Whether this repository is affected is a judgement for a person.`
		);
	}
	const fixed = finding.patchedVersion
		? `the advisory is fixed in **${finding.patchedVersion}**`
		: "the advisory lists no fixed version";
	return (
		`${where} pins **${packageName} ${finding.pinned?.version}**; ${fixed}. ` +
		`${assessment.verdict} — ${assessment.reason}.`
	);
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
	const lines = [markerFor(finding.key), "", ledeFor(finding), ""];
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
	if (finding.pinned?.version) {
		lines.push(`| Pinned version | \`${finding.pinned.version}\` |`);
	}
	if (finding.vulnerableRange) {
		lines.push(`| Vulnerable range | \`${finding.vulnerableRange}\` |`);
	}
	if (finding.patchedVersion) lines.push(`| Patched version | \`${finding.patchedVersion}\` |`);
	if (finding.scope) lines.push(`| Scope | ${finding.scope} |`);
	lines.push("");

	if (finding.assessment) {
		lines.push("## Is this repository affected?", "", affectedText(finding), "");
	}

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
	if (isNotAffected(finding)) {
		lines.push(
			"No version bump is needed: the version this repository pins is not in the affected range.",
			"",
		);
		const dismiss = finding.source === "dependabot" ? " with the reason `inaccurate`" : "";
		lines.push(
			`1. A maintainer dismisses the alert${
				finding.alertUrl ? ` at ${finding.alertUrl}` : ""
			}${dismiss}, so the queue stops asking for a fix that is not needed.`,
			"2. The issue stays as the record of the advisory.",
			"",
		);
	} else {
		const steps = [];
		if (finding.assessment?.status === "unknown") {
			steps.push(
				`Confirm whether the pinned version is affected: ${finding.assessment.reason}, ` +
					"so a person makes the call.",
			);
		}
		if (finding.patchedVersion) {
			steps.push(
				`Bump \`${finding.packageName ?? "the dependency"}\` to \`${finding.patchedVersion}\`` +
					`${finding.manifestPath ? ` in \`${finding.manifestPath}\`` : ""} and in every other manifest that pins it.`,
				"Regenerate the lockfile with the package manager that manifest uses.",
			);
		} else {
			steps.push(
				`No patched version of \`${finding.packageName ?? "the dependency"}\` is published yet.` +
					`${
						finding.manifestPath
							? ` Until one is, keep \`${finding.manifestPath}\` off the affected range by pinning a version that is not in it.`
							: " Until one is, keep the affected version out of the manifests that ship to users."
					}`,
				"Watch the advisory for the fix, and take the step above as soon as it lands.",
			);
		}
		steps.push(
			"Run the checks: `bun run typecheck`, `bun run lint`, `bun run test`.",
			"Open a pull request that says `Fixes #<this issue number>`.",
		);
		steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
		lines.push("");
	}
	if (isNotAffected(finding)) {
		lines.push(
			"## Picking this up",
			"",
			"No contributor work is needed here. A maintainer dismisses the alert; the issue stays as the record.",
			"",
		);
	} else {
		lines.push(
			"## Picking this up",
			"",
			"Comment `I'll take this` to be assigned. A draft pull request is welcome at any stage;",
			"sign the commits off with `git commit -s`.",
			"",
		);
	}
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
	// One finding per group: the same advisory in two sources is one thing to fix.
	const open = new Map();
	for (const group of groupFindings(findings)) {
		open.set(groupKey(group), group[0]);
	}
	const byMarker = new Map();
	for (const issue of managed) {
		const parsed = parseMarker(issue.body ?? "");
		if (parsed) byMarker.set(parsed.key, issue);
	}
	const actions = [];
	for (const group of groupFindings(findings)) {
		// The first finding of the group leads it; the others are the same fix.
		const finding = group[0];
		const key = groupKey(group);
		const existing = byMarker.get(key);
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

/** The manifest the alert names, read from the checkout the script runs in. */
function readManifestText(manifestPath) {
	try {
		return readFileSync(resolve(process.cwd(), manifestPath), "utf8");
	} catch {
		return null;
	}
}

/**
 * The version the manifest the alert names pins for the package.
 *
 * A manifest that pins a version answers the question on its own. A manifest that
 * does not (a lockfile, a package.json that declares a range) leaves the scanner's
 * resolved version as the answer, because that is the version the alert is about.
 */
export function readPinnedVersion(finding, readManifest = readManifestText) {
	const manifestText = finding.manifestPath ? readManifest(finding.manifestPath) : null;
	const fromManifest = pinnedVersionFor(manifestText, finding.packageName, finding.manifestPath);
	if (fromManifest.kind === PINNED_KIND.PINNED) return fromManifest;
	if (finding.installedVersion) {
		return { version: finding.installedVersion, range: null, kind: PINNED_KIND.PINNED };
	}
	return fromManifest;
}

/**
 * The finding with the version the manifest pins and what it means for the advisory.
 *
 * The pinned version and the fixed version decide whether the advisory reaches this
 * repository, so both are read before the issue is written.
 */
export function assessFinding(finding, readManifest = readManifestText) {
	const pinned = readPinnedVersion(finding, readManifest);
	return {
		...finding,
		pinned,
		assessment: assessPinnedVersion({
			pinned,
			patched: finding.patchedVersion,
			range: finding.vulnerableRange,
			reason: pinnedVersionReason(pinned, finding.manifestPath),
		}),
	};
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
	const final = finalLabelSet(action.issue.labels, labels, managed);
	gh(
		["api", "--method", "PUT", `repos/${repo}/issues/${issueNumber}/labels`, "--input", "-"],
		JSON.stringify({ labels: final }),
	);
	return { number: issueNumber, url: action.issue.html_url };
}

/**
 * The label set an issue ends up with: the labels this script manages, replaced, and
 * every other label the issue already carries.
 *
 * The API takes names, and an issue's own labels come back as objects, so they are
 * read by name first. Sending an object where a name belongs is a 422.
 */
export function finalLabelSet(currentLabels, wanted, managed) {
	const current = (currentLabels ?? [])
		.map((label) => (typeof label === "string" ? label : label?.name))
		.filter(Boolean);
	return [...new Set([...current.filter((label) => !isManagedLabel(label, managed)), ...wanted])];
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
		repo: process.env.GITHUB_REPOSITORY ?? "flisk-sh/flisk",
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
		const finding = normalizeDependabotAlert(alert);
		// The alert carries the advisory, but the version range for a package can be
		// missing there. The global advisory lists the range and the fix per package
		// and ecosystem, so the two are read together.
		findings.push(mergeAdvisory(finding, globalAdvisory(finding.ghsaId)));
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
	// The version the manifest pins decides whether the advisory reaches this
	// repository at all, so it is read next to the fixed version.
	for (let index = 0; index < findings.length; index += 1) {
		findings[index] = assessFinding(findings[index]);
	}
	const managed = listManagedIssues(repo);
	const actions = planSync(findings, managed);
	const wanted = planLabels(findings);

	// Labels first: an issue created without its labels would lose the severity and
	// package filters, and `gh issue create` refuses a label that does not exist.
	const created = opts.dryRun ? [] : ensureLabels(repo, wanted);
	if (created.length) console.log(`created labels: ${created.join(", ")}`);

	let failed = 0;
	for (const action of actions) {
		const label = action.finding
			? `${action.finding.key} ${action.finding.packageName ?? ""}`.trim()
			: `issue #${action.issue.number}`;
		console.log(`${action.action}: ${label}`);
		if (opts.dryRun) continue;
		// One issue that cannot be written must not stop the others: the next run
		// picks it up again, and the warning says which one failed.
		try {
			if (action.action === "close") {
				closeIssue(repo, action.issue);
				continue;
			}
			writeIssue(repo, action, findings);
		} catch (error) {
			failed += 1;
			const reason = (error.stderr ?? error.message).toString().trim().split("\n")[0];
			console.log(`::warning::Could not write ${label}: ${reason}`);
		}
	}
	console.log(
		`${findings.length} open alert(s), ${managed.length} managed issue(s), ${actions.length} action(s)`,
	);
	if (failed > 0) {
		console.log(`::warning::${failed} of ${actions.length} action(s) failed.`);
		return 1;
	}
	return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
