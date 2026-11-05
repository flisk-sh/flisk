#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The bug-hunt ledger: turns the failure files of the nightly bug-finding engines (ORACLE, FALSIFIER; both write the shared
// bug-memory shape) into one record per distinct defect, and optionally into one GitHub issue per defect.
//
//   node scripts/bug-hunt-issues.mjs <failures.json>... [--ledger <file>] [--file-issues] [--repo owner/name]
//
// Without --file-issues nothing is written to GitHub: the ledger and the decisions are printed. With it, a defect with no
// issue gets one, a defect whose issue was closed gets it reopened with a comment (a regression), and a defect whose issue is
// open is left alone. Only issues carrying MANAGED_LABEL are touched. The defect's identity is its fingerprint, kept in a
// hidden marker in the issue body, so the same defect found by a different seed on a later night maps to the same issue.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MANAGED_LABEL = "bug-hunt";
export const MARKER_PREFIX = "<!-- flisk:bug-hunt:";
export const MARKER_SUFFIX = " -->";

// Same defect, different seed: the detail in parentheses (file paths that carry the generated names), digits and long runs of one
// character (a 64-character name) are folded away, so only the symptom is left.
export function normalize(text) {
	return String(text ?? "")
		.replace(/\s*\(.*$/s, "")
		.replace(/(.)\1{5,}/g, "$1~")
		.replace(/\d+/g, "N")
		.replace(/\s+/g, " ")
		.slice(0, 120);
}

export function fingerprint(finding) {
	const check = finding.property ?? finding.invariant ?? "unknown";
	const key = `${finding.engine}|${check}|${normalize(finding.actual)}`;
	return `${String(finding.engine).toLowerCase()}-${createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
}

// One ledger record per fingerprint, keeping the first finding as the example and counting the rest.
export function buildLedger(findings) {
	const byKey = new Map();
	for (const finding of findings) {
		const id = fingerprint(finding);
		const record = byKey.get(id) ?? { id, engine: finding.engine, check: finding.property ?? finding.invariant, count: 0, example: finding };
		record.count += 1;
		byKey.set(id, record);
	}
	return [...byKey.values()];
}

export function markerFor(id) {
	return `${MARKER_PREFIX}${id}${MARKER_SUFFIX}`;
}

export function parseMarker(body) {
	const start = String(body ?? "").indexOf(MARKER_PREFIX);
	if (start === -1) return null;
	const end = body.indexOf(MARKER_SUFFIX, start);
	return end === -1 ? null : body.slice(start + MARKER_PREFIX.length, end);
}

export function issueTitle(record) {
	return `bug-hunt: ${record.engine} ${record.check}: ${String(record.example.actual).slice(0, 80)}`;
}

export function issueBody(record, run = {}) {
	const f = record.example;
	const lines = [
		markerFor(record.id),
		`Found by **${record.engine}** (check \`${record.check}\`), ${record.count} time(s) in the run that filed this.`,
		"",
		`**Expected:** ${f.expected}`,
		`**Actual:** ${f.actual}`,
		f.minimized ? `**Minimal case:** \`${JSON.stringify(f.minimized).slice(0, 400)}\`` : "",
		`**Replay:** \`${f.reproduction}\``,
		`**Seed / commit:** ${f.seed} / ${f.commit ?? "unknown"}`,
		run.url ? `**Run:** ${run.url}` : "",
		"",
		"Next steps: confirm it is a real defect (a wrong expectation in the engine is also a fix), fix it, save the minimal case under `tests/<engine>/regressions/`, and close this issue.",
		"",
		"_Filed by `scripts/bug-hunt-issues.mjs`._",
	];
	return lines.filter((line, i) => line !== "" || lines[i - 1] !== "").join("\n");
}

// What to do for each record given the existing managed issues ([{number, state, body}]).
export function decide(ledger, issues) {
	const byId = new Map();
	for (const issue of issues) {
		const id = parseMarker(issue.body);
		if (id) byId.set(id, issue);
	}
	return ledger.map((record) => {
		const issue = byId.get(record.id);
		if (!issue) return { action: "create", record };
		if (String(issue.state).toUpperCase() === "CLOSED") return { action: "reopen", record, number: issue.number };
		return { action: "keep", record, number: issue.number };
	});
}

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input });

function apply(decisions, { repo, run, ghRun = gh }) {
	const r = repo ? ["--repo", repo] : [];
	ghRun(["label", "create", MANAGED_LABEL, "--color", "b60205", "--description", "Found by a nightly bug-finding engine", "--force", ...r]);
	for (const d of decisions) {
		if (d.action === "create") ghRun(["issue", "create", "--title", issueTitle(d.record), "--body-file", "-", "--label", MANAGED_LABEL, ...r], issueBody(d.record, run));
		if (d.action === "reopen") {
			ghRun(["issue", "reopen", String(d.number), ...r]);
			ghRun(["issue", "comment", String(d.number), "--body-file", "-", ...r], `Found again${run?.url ? ` in ${run.url}` : ""}: this is a regression.\n\n${issueBody(d.record, run)}`);
		}
	}
}

function main(argv) {
	const arg = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
	const valueFlags = new Set(["--ledger", "--repo"]);
	const files = argv.filter((a, i) => !a.startsWith("--") && !valueFlags.has(argv[i - 1]));
	const findings = files.flatMap((file) => JSON.parse(readFileSync(file, "utf8")));
	const ledger = buildLedger(findings);
	if (arg("--ledger")) writeFileSync(arg("--ledger"), `${JSON.stringify(ledger, null, 2)}\n`);
	console.log(`${findings.length} finding(s), ${ledger.length} distinct defect(s)`);
	if (ledger.length === 0) return 0;
	const repo = arg("--repo");
	const live = argv.includes("--file-issues");
	const issues = live ? JSON.parse(gh(["issue", "list", "--label", MANAGED_LABEL, "--state", "all", "--limit", "500", "--json", "number,state,body", ...(repo ? ["--repo", repo] : [])])) : [];
	const decisions = decide(ledger, issues);
	for (const d of decisions) console.log(`${live ? "" : "(dry run) "}${d.action.padEnd(6)} ${d.record.id}  ${issueTitle(d.record)}`);
	if (live) {
		const url = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
		apply(decisions, { repo, run: { url } });
	}
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
