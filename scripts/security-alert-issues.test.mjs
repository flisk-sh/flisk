// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/security-alert-issues.mjs.
//   node --test scripts/security-alert-issues.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import {
	MANAGED_LABEL,
	bodyFor,
	isAdvisory,
	labelsFor,
	managedLabelSet,
	markerFor,
	mergeAdvisory,
	normalizeCodeScanningAlert,
	normalizeDependabotAlert,
	normalizeSeverity,
	parseMarker,
	parseScannerMessage,
	planLabels,
	planSync,
	relatedFindings,
	sameLabels,
	sanitizeLabelPart,
	titleFor,
	versionOf,
} from "./security-alert-issues.mjs";

const DEPENDABOT_ALERT = {
	number: 22,
	html_url: "https://github.com/flisk-sh/flisk/security/dependabot/22",
	dependency: {
		package: { name: "vite", ecosystem: "npm" },
		manifest_path: "cli/pnpm-lock.yaml",
		scope: "development",
	},
	security_advisory: {
		ghsa_id: "GHSA-698v-4r3x-3vcv",
		cve_id: "CVE-2026-112943",
		summary: "launch-editor: escapeCmdArgs() omits % escaping on Windows",
		description: "launch-editor did not escape % on Windows when passing an argument to cmd.",
		severity: "medium",
		cvss: { score: 5.3, vector_string: "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:L" },
		cwes: [{ cwe_id: "CWE-77", name: "Command injection" }],
		references: [{ url: "https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv" }],
		published_at: "2026-10-20T18:30:00Z",
	},
	security_vulnerabilities: [
		{
			vulnerable_version_range: ">= 7.0.0, < 7.3.7",
			first_patched_version: { identifier: "7.3.7" },
		},
	],
};

const SCANNER_ALERT = {
	number: 456,
	html_url: "https://github.com/flisk-sh/flisk/security/code-scanning/456",
	rule: {
		id: "CVE-2026-112942",
		severity: "warning",
		description: "CVE-2026-112942: launch-editor: `fs.existsSync()` existence check can be bypassed on Windows",
		full_description: "launch-editor checked fs.existsSync(fileName) before passing a supplied path to an editor command.",
	},
	most_recent_instance: {
		location: { path: "bun.lock" },
		message: {
			text: "Package 'vite@8.3.1' is vulnerable to 'CVE-2026-112942' (also known as 'GHSA-587h-7wmj-h5pm').",
		},
	},
};

test("the marker identifies one alert and round-trips", () => {
	const marker = markerFor("dependabot", 22);
	assert.equal(marker, "<!-- flisk:security-alert:dependabot:22 -->");
	assert.deepEqual(parseMarker(`noise\n${marker}\nmore`), { source: "dependabot", number: 22 });
	assert.equal(parseMarker("no marker here"), null);
	assert.equal(parseMarker(undefined), null);
});

test("a body without the marker is never claimed", () => {
	assert.equal(parseMarker("<!-- flisk:security-alert:dependabot -->"), null);
	assert.equal(parseMarker("<!-- flisk:security-alert:dependabot:xx -->"), null);
});

test("severity is normalised, and an unknown severity is medium", () => {
	assert.equal(normalizeSeverity("critical"), "critical");
	assert.equal(normalizeSeverity("moderate"), "medium");
	assert.equal(normalizeSeverity("Medium"), "medium");
	assert.equal(normalizeSeverity("low"), "low");
	assert.equal(normalizeSeverity("warning"), "medium");
	assert.equal(normalizeSeverity(undefined), "medium");
});

test("the scanner message yields package, version and advisory ids", () => {
	const parsed = parseScannerMessage(
		"Package 'vite@8.3.1' is vulnerable to 'CVE-2026-112942' (also known as 'GHSA-587h-7wmj-h5pm').",
	);
	assert.equal(parsed.packageName, "vite");
	assert.equal(parsed.installedVersion, "8.3.1");
	assert.equal(parsed.cveId, "CVE-2026-112942");
	assert.equal(parsed.ghsaId, "GHSA-587h-7wmj-h5pm");
	assert.equal(parseScannerMessage("").packageName, null);
});

test("a dependabot alert keeps its advisory detail", () => {
	const finding = normalizeDependabotAlert(DEPENDABOT_ALERT);
	assert.equal(finding.key, "dependabot:22");
	assert.equal(finding.packageName, "vite");
	assert.equal(finding.ecosystem, "npm");
	assert.equal(finding.manifestPath, "cli/pnpm-lock.yaml");
	assert.equal(finding.severity, "medium");
	assert.equal(finding.ghsaId, "GHSA-698v-4r3x-3vcv");
	assert.equal(finding.cveId, "CVE-2026-112943");
	assert.equal(finding.vulnerableRange, ">= 7.0.0, < 7.3.7");
	assert.equal(finding.patchedVersion, "7.3.7");
	assert.equal(finding.cwes[0].id, "CWE-77");
});

test("a code-scanning alert is read from the rule and the message", () => {
	const finding = normalizeCodeScanningAlert(SCANNER_ALERT);
	assert.equal(finding.key, "code-scanning:456");
	assert.equal(finding.packageName, "vite");
	assert.equal(finding.installedVersion, "8.3.1");
	assert.equal(finding.manifestPath, "bun.lock");
	assert.equal(finding.ghsaId, "GHSA-587h-7wmj-h5pm");
	assert.equal(finding.cveId, "CVE-2026-112942");
});

test("the global advisory fills what the scanner left out", () => {
	const finding = mergeAdvisory(normalizeCodeScanningAlert(SCANNER_ALERT), {
		ghsa_id: "GHSA-587h-7wmj-h5pm",
		cve_id: "CVE-2026-112942",
		severity: "high",
		cvss: { score: 7.5, vector_string: "CVSS:4.0/AV:N/AC:L" },
		vulnerabilities: [
			{
				package: { name: "launch-editor", ecosystem: "npm" },
				vulnerable_version_range: "<= 2.14.1",
				first_patched_version: "2.14.2",
			},
			{
				package: { name: "vite", ecosystem: "npm" },
				vulnerable_version_range: ">= 8.3.0, < 8.3.3",
				first_patched_version: "8.3.3",
			},
		],
		cwes: [{ cwe_id: "CWE-77", name: "Command injection" }],
		references: [{ url: "https://example.test/advisory" }],
	});
	assert.equal(finding.severity, "high");
	assert.equal(finding.cvssScore, 7.5);
	// The entry for this package, not the first one the advisory lists.
	assert.equal(finding.patchedVersion, "8.3.3");
	assert.equal(finding.vulnerableRange, ">= 8.3.0, < 8.3.3");
	assert.deepEqual(finding.cwes, [{ id: "CWE-77", name: "Command injection", description: undefined }]);
});

test("a version arrives as a string or as an object", () => {
	assert.equal(versionOf("2.14.2"), "2.14.2");
	assert.equal(versionOf({ identifier: "8.3.3" }), "8.3.3");
	assert.equal(versionOf(null), null);
	assert.equal(versionOf(undefined), null);
});

test("a missing advisory leaves the finding as it was", () => {
	const before = normalizeCodeScanningAlert(SCANNER_ALERT);
	assert.deepEqual(mergeAdvisory(before, null), before);
});

test("labels cover severity, source, package, ecosystem, scope and weakness", () => {
	const labels = labelsFor(normalizeDependabotAlert(DEPENDABOT_ALERT));
	for (const expected of [
		"security",
		"vulnerability",
		MANAGED_LABEL,
		"auto-generated",
		"area: dependencies",
		"dependencies",
		"supply-chain",
		"help wanted",
		"severity: medium",
		"source: dependabot",
		"package: vite",
		"ecosystem: npm",
		"scope: development",
		"cwe: 77",
	]) {
		assert.ok(labels.includes(expected), `missing label: ${expected}`);
	}
});

test("a Windows advisory gets the platform label", () => {
	const finding = normalizeCodeScanningAlert(SCANNER_ALERT);
	assert.ok(labelsFor(finding).includes("windows"));
	const other = normalizeDependabotAlert({
		...DEPENDABOT_ALERT,
		security_advisory: {
			...DEPENDABOT_ALERT.security_advisory,
			summary: "A path traversal in the archive reader",
			description: "A Linux-only path issue.",
		},
	});
	assert.ok(!labelsFor(other).includes("windows"));
});

test("label parts are safe for GitHub", () => {
	assert.equal(sanitizeLabelPart("Vite"), "vite");
	assert.equal(sanitizeLabelPart("@scope/name"), "scope-name");
	assert.equal(sanitizeLabelPart("  "), "");
	assert.equal(sanitizeLabelPart(null), "");
});

test("the title names the package, the advisory and the manifest", () => {
	const title = titleFor(normalizeDependabotAlert(DEPENDABOT_ALERT));
	assert.equal(
		title,
		"[security] vite: launch-editor: escapeCmdArgs() omits % escaping on Windows (cli/pnpm-lock.yaml)",
	);
});

test("the body carries the advisory, the range, the fix and the marker", () => {
	const body = bodyFor(normalizeDependabotAlert(DEPENDABOT_ALERT));
	assert.ok(body.startsWith(markerFor("dependabot", 22)));
	assert.ok(body.includes("GHSA-698v-4r3x-3vcv"));
	assert.ok(body.includes("CVE-2026-112943"));
	assert.ok(body.includes("severity: medium") === false);
	assert.ok(body.includes("Severity: **medium**"));
	assert.ok(body.includes("`>= 7.0.0, < 7.3.7`"));
	assert.ok(body.includes("`7.3.7`"));
	assert.ok(body.includes("CWE-77"));
	assert.ok(body.includes("I'll take this"));
	assert.ok(body.includes("git commit -s"));
});

test("the body lists the other manifests the same advisory affects", () => {
	const a = normalizeDependabotAlert(DEPENDABOT_ALERT);
	const b = normalizeCodeScanningAlert(SCANNER_ALERT);
	const same = { ...b, ghsaId: a.ghsaId, cveId: a.cveId };
	const related = relatedFindings(a, [a, same]);
	assert.equal(related.length, 1);
	assert.equal(related[0].key, same.key);
	const body = bodyFor(a, [a, same]);
	assert.ok(body.includes("## Also affected"));
	assert.ok(body.includes("`bun.lock`"));
});

test("a scanner rule that is not an advisory is skipped", () => {
	const saas = normalizeCodeScanningAlert({
		number: 440,
		rule: { id: "BranchProtectionID", severity: "warning", description: "branch protection is not maximal" },
		most_recent_instance: {
			location: { path: "no file associated with this alert" },
			message: { text: "score is 8: branch protection is not maximal on development and all release branches" },
		},
	});
	assert.equal(isAdvisory(saas), false);
	const semgrep = normalizeCodeScanningAlert({
		number: 441,
		rule: { id: "javascript.lang.security.audit.detect-non-literal-regexp", severity: "warning" },
		most_recent_instance: {
			location: { path: "cli/src/x.ts" },
			message: { text: "Detected a non-literal regular expression" },
		},
	});
	assert.equal(isAdvisory(semgrep), false);
	assert.equal(isAdvisory(normalizeCodeScanningAlert(SCANNER_ALERT)), true);
	assert.equal(isAdvisory(normalizeDependabotAlert(DEPENDABOT_ALERT)), true);
});

test("one alert, one issue", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const actions = planSync(findings, []);
	assert.equal(actions.length, 1);
	assert.equal(actions[0].action, "create");
});

test("an existing issue is updated, not duplicated", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const issue = {
		number: 900,
		state: "open",
		body: `${markerFor("dependabot", 22)}\n\nan older body`,
		labels: ["security"],
		html_url: "https://github.com/flisk-sh/flisk/issues/900",
	};
	const actions = planSync(findings, [issue]);
	assert.equal(actions.length, 1);
	assert.equal(actions[0].action, "update");
	assert.equal(actions[0].issue.number, 900);
});

test("an issue that carries the marker but no longer matches is still updated", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const issue = {
		number: 900,
		state: "open",
		body: markerFor("dependabot", 22),
		labels: ["security"],
	};
	const actions = planSync(findings, [issue]);
	assert.equal(actions[0].action, "update");
	assert.equal(actions[0].body, bodyFor(findings[0]));
});

test("an unchanged issue is left alone", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const issue = {
		number: 900,
		state: "open",
		body: bodyFor(findings[0]),
		labels: labelsFor(findings[0]),
	};
	const actions = planSync(findings, [issue]);
	assert.equal(actions[0].action, "unchanged");
});

test("a closed issue reopens when the alert comes back", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const issue = {
		number: 900,
		state: "closed",
		body: bodyFor(findings[0]),
		labels: labelsFor(findings[0]),
	};
	const actions = planSync(findings, [issue]);
	assert.equal(actions[0].action, "reopen");
});

test("an issue whose alert is gone is closed", () => {
	const finding = normalizeDependabotAlert(DEPENDABOT_ALERT);
	const issue = {
		number: 900,
		state: "open",
		body: bodyFor(finding),
		labels: labelsFor(finding),
	};
	const actions = planSync([], [issue]);
	assert.equal(actions.length, 1);
	assert.equal(actions[0].action, "close");
	assert.equal(actions[0].issue.number, 900);
});

test("an issue without the marker is never closed", () => {
	const actions = planSync([], [
		{ number: 901, state: "open", body: "a hand-written issue", labels: [] },
	]);
	assert.equal(actions.length, 0);
});

test("label comparison ignores order and duplicates", () => {
	assert.ok(sameLabels(["a", "b"], ["b", "a"]));
	assert.ok(sameLabels(["a", "a"], ["a"]));
	assert.ok(!sameLabels(["a"], ["a", "b"]));
	assert.ok(!sameLabels([], ["a"]));
});

test("the managed label set covers every label the script applies", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const managed = managedLabelSet(findings);
	for (const label of labelsFor(findings[0])) {
		assert.ok(managed.has(label), `not managed: ${label}`);
	}
	assert.ok(managed.has("claimed") === false);
});

test("every label the script applies is planned for creation", () => {
	const findings = [normalizeDependabotAlert(DEPENDABOT_ALERT)];
	const planned = planLabels(findings);
	for (const label of labelsFor(findings[0])) {
		assert.ok(planned.has(label), `not planned: ${label}`);
	}
	assert.match(planned.get("severity: medium").color, /^[0-9a-f]{6}$/);
});
