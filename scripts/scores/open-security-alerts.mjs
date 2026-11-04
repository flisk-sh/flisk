// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// How many known security problems are open. The value is the open code-scanning alerts (CodeQL, Semgrep, Scorecard)
// plus the open Dependabot alerts; the summary counts each source by severity. A token that may not read one source
// (gh exits on HTTP 403 or 404) still reports the other, and the summary names the source it could not read; the value
// is null only when neither could be read, since 0 would claim a clean bill nobody checked.
export const meta = {
	id: "open-security-alerts",
	title: "Open code-scanning and Dependabot alerts",
	source: "gh",
	mode: "report",
	better: "lower",
	unit: "alerts",
};

// Code scanning gives a security severity (critical..low) to security rules and only error/warning/note to the others;
// this is the order GitHub's own severity filter lists them in. Dependabot uses critical..low.
export const SEVERITIES = ["critical", "high", "medium", "low", "error", "warning", "note", "none"];
const rank = (s) => (SEVERITIES.includes(s) ? SEVERITIES.indexOf(s) : SEVERITIES.length);

const SOURCES = {
	"code-scanning": {
		path: "code-scanning/alerts",
		alert: (a) => ({
			severity: a.rule?.security_severity_level ?? a.rule?.severity ?? "none",
			what: `${a.rule?.id ?? "?"} ${a.most_recent_instance?.location?.path ?? "?"}`,
		}),
	},
	dependabot: {
		path: "dependabot/alerts",
		alert: (a) => ({
			severity: a.security_advisory?.severity ?? a.security_vulnerability?.severity ?? "none",
			what: `${a.dependency?.package?.name ?? a.security_vulnerability?.package?.name ?? "?"} ${a.security_advisory?.ghsa_id ?? "?"}`,
		}),
	},
};

// The open alerts of one source, or the HTTP status when the token may not read them. Other failures throw.
export function openAlerts(gh, repo, path) {
	try {
		const pages = gh(["api", `repos/${repo}/${path}?state=open&per_page=100`, "--paginate", "--slurp"]);
		return { alerts: pages.flat() };
	} catch (err) {
		const status = /\(HTTP (40[34])\)/.exec(String(err?.message ?? err))?.[1];
		if (!status) throw err;
		return { unavailable: `HTTP ${status}` };
	}
}

export function measure(ctx) {
	const parts = [];
	const missing = [];
	const rows = [];
	for (const [name, source] of Object.entries(SOURCES)) {
		const { alerts, unavailable } = openAlerts(ctx.gh, ctx.repo, source.path);
		if (unavailable) {
			missing.push(`${name} unavailable (${unavailable})`);
			continue;
		}
		const mapped = alerts.map((a) => ({ name, ...source.alert(a) }));
		const bySeverity = SEVERITIES.map((s) => [s, mapped.filter((a) => a.severity === s).length])
			.concat([["other", mapped.filter((a) => rank(a.severity) === SEVERITIES.length).length]])
			.filter(([, n]) => n)
			.map(([s, n]) => `${n} ${s}`);
		parts.push(`${name} ${mapped.length}${bySeverity.length ? ` (${bySeverity.join(", ")})` : ""}`);
		rows.push(...mapped);
	}
	if (!parts.length) return { value: null, summary: missing.join("; ") };
	return {
		value: rows.length,
		summary: [...parts, ...missing].join("; "),
		findings: rows
			.map((r, i) => ({ ...r, i }))
			.sort((a, b) => rank(a.severity) - rank(b.severity) || a.i - b.i)
			.map((r) => `${r.name} ${r.severity}: ${r.what}`),
	};
}
