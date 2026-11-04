// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { measure } from "./open-security-alerts.mjs";

const REPO = "flisk-sh/flisk";
const NOW = new Date("2026-10-28T12:00:00Z");

// A code-scanning alert as `gh api repos/{repo}/code-scanning/alerts` returns it. Scorecard rules carry a security
// severity; Semgrep rules only error/warning/note.
const scan = (number, rule, severity, securitySeverity, file) => ({
	number,
	state: "open",
	rule: { id: rule, name: rule, severity, security_severity_level: securitySeverity },
	tool: { name: securitySeverity ? "Scorecard" : "Semgrep OSS" },
	most_recent_instance: { location: { path: file, start_line: 1 } },
	html_url: `https://github.com/${REPO}/security/code-scanning/${number}`,
});
// A Dependabot alert as `gh api repos/{repo}/dependabot/alerts` returns it.
const dep = (number, name, ghsa, severity) => ({
	number,
	state: "open",
	dependency: { package: { ecosystem: "npm", name }, manifest_path: "cli/package.json" },
	security_advisory: { ghsa_id: ghsa, cve_id: null, severity, summary: "..." },
	security_vulnerability: { package: { ecosystem: "npm", name }, severity },
	html_url: `https://github.com/${REPO}/security/dependabot/${number}`,
});

const CODE = [
	scan(598, "detect-non-literal-regexp", "warning", null, "scripts/scores/claims-guard.mjs"),
	scan(590, "PinnedDependenciesID", "error", "medium", "next_dockerfile.star"),
	scan(595, "spawn-shell-true", "error", null, "cli/src/utils/native-runtime.ts"),
	scan(440, "BranchProtectionID", "error", "high", "no file associated with this alert"),
];
const DEPS = [dep(71, "vite", "GHSA-aaaa-bbbb-cccc", "medium"), dep(72, "hono", "GHSA-dddd-eeee-ffff", "critical")];

// `--paginate --slurp` prints one array per page inside an outer array. A source given as an Error is thrown, the way
// ghJson throws when gh exits non-zero.
function fakeGh(sources, calls = []) {
	return (args) => {
		calls.push(args);
		const source = /^repos\/flisk-sh\/flisk\/(code-scanning|dependabot)\/alerts\?state=open&per_page=100$/.exec(args[1])?.[1];
		assert.ok(source, args[1]);
		assert.deepEqual(args.slice(2), ["--paginate", "--slurp"]);
		const data = sources[source];
		if (data instanceof Error) throw data;
		return [data.slice(0, 2), data.slice(2)];
	};
}
const ghError = (status, text) => new Error(`Command failed: gh api ...\ngh: ${text} (HTTP ${status})\n`);

test("total open alerts, by severity per source, highest severity first", () => {
	const calls = [];
	const r = measure({ repo: REPO, now: NOW, gh: fakeGh({ "code-scanning": CODE, dependabot: DEPS }, calls) });
	assert.equal(r.value, 6);
	assert.equal(r.summary, "code-scanning 4 (1 high, 1 medium, 1 error, 1 warning); dependabot 2 (1 critical, 1 medium)");
	assert.deepEqual(r.findings, [
		"dependabot critical: hono GHSA-dddd-eeee-ffff",
		"code-scanning high: BranchProtectionID no file associated with this alert",
		"code-scanning medium: PinnedDependenciesID next_dockerfile.star",
		"dependabot medium: vite GHSA-aaaa-bbbb-cccc",
		"code-scanning error: spawn-shell-true cli/src/utils/native-runtime.ts",
		"code-scanning warning: detect-non-literal-regexp scripts/scores/claims-guard.mjs",
	]);
	assert.equal(calls.length, 2);
});

test("an endpoint the token may not read is named, and the other still counts", () => {
	const r = measure({
		repo: REPO,
		now: NOW,
		gh: fakeGh({ "code-scanning": CODE, dependabot: ghError(403, "Resource not accessible by integration") }),
	});
	assert.equal(r.value, 4);
	assert.equal(r.summary, "code-scanning 4 (1 high, 1 medium, 1 error, 1 warning); dependabot unavailable (HTTP 403)");
	assert.equal(r.findings.length, 4);
	const clean = measure({ repo: REPO, now: NOW, gh: fakeGh({ "code-scanning": ghError(404, "no analysis found"), dependabot: [] }) });
	assert.equal(clean.value, 0);
	assert.equal(clean.summary, "dependabot 0; code-scanning unavailable (HTTP 404)");
});

test("no value when neither endpoint can be read; other failures throw", () => {
	const r = measure({
		repo: REPO,
		now: NOW,
		gh: fakeGh({ "code-scanning": ghError(403, "Forbidden"), dependabot: ghError(404, "Not Found") }),
	});
	assert.equal(r.value, null);
	assert.equal(r.summary, "code-scanning unavailable (HTTP 403); dependabot unavailable (HTTP 404)");
	const down = fakeGh({ "code-scanning": ghError(502, "Bad Gateway"), dependabot: [] });
	assert.throws(() => measure({ repo: REPO, now: NOW, gh: down }), /HTTP 502/);
});
