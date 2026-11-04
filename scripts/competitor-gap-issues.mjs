#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Turns the quick-win gaps of docs/competitors/ into feature-request issues. A gap is a row Flisk could reasonably do
// ("in" scope) and does not have yet (status "missing"). Only gaps that score well raise an issue: ICE score >= MIN_ICE
// AND ease >= MIN_EASE (a quick win). Everything else stays in the report (dry-run output, MATRIX.md).
//
//   node scripts/competitor-gap-issues.mjs [--apply] [--max-new 5] [--min-ice 7] [--min-ease 7] [--repo owner/name]
//
// DRY RUN IS THE DEFAULT: without --apply it prints what it would create, close and label, and writes nothing. Rules:
//   - at most --max-new new issues per run, across all competitors, so a big matrix cannot flood the tracker;
//   - one open issue per row, found through its hidden marker `<!-- competitor-gap:<competitor>:<row> -->`;
//   - an issue a maintainer closed is never reopened (reported only), an open one is never edited or closed because its
//     score dropped (reported only), and an issue without the marker is never touched;
//   - an open issue closes (with a comment) when its row becomes covered (completed) or out-of-scope or gone (not planned);
//   - only labels from docs/competitors/labels.json that are missing in the repo are created, and only with --apply;
//     an existing label's color or description is never edited.
// The body uses the `### <label>` + answer shape of .github/ISSUE_TEMPLATE/competitor-gap.yml, so it reads like a
// submitted form. Needs gh authenticated with issues: write.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { featureName, iceScore, loadAll, passesBar } from "./competitors/lib.mjs";

// The bar a gap must clear to become an issue; --min-ice and --min-ease override it.
export const MIN_ICE = 7.0;
export const MIN_EASE = 7;
export const MAX_NEW = 5;
export const BASE_LABELS = ["competitor-gap", "enhancement", "needs-triage", "quick-win"];
export const MARKER_RE = /<!-- competitor-gap:([a-z0-9-]+):([a-z0-9-]+) -->/;

// The headings of the issue body: exactly the field labels of .github/ISSUE_TEMPLATE/competitor-gap.yml (a test keeps them equal).
export const FORM = {
	competitor: "Competitor",
	feature: "Feature",
	offer: "What the competitor offers (source and date checked)",
	area: "Area",
	fit: "Why it may fit Flisk",
	evidence: "Evidence we have today",
	decision: "Decision needed",
	acceptance: "Acceptance check",
	ice: "ICE estimate",
};

export const markerFor = (competitorId, rowId) => `<!-- competitor-gap:${competitorId}:${rowId} -->`;
export const titleFor = (competitor, row) => `feat: ${featureName(row)} (${competitor.name} has it)`;
export const labelsFor = (competitor, row) => [
	...BASE_LABELS,
	`competitor: ${competitor.id}`,
	`area: ${row.area}`,
];

const evidenceText = (e) => {
	const [kind] = Object.keys(e);
	return kind === "text" ? `text "${e.text.contains}" in ${e.text.file}` : `${kind}: ${e[kind]}`;
};

export function bodyFor(competitor, row) {
	const f = row.flisk;
	const ice = row.ice;
	const sections = {
		[FORM.competitor]: `${competitor.name} (${competitor.url})`,
		[FORM.feature]: featureName(row),
		[FORM.offer]: `${row.offer}\n\nSource: ${row.source} (checked ${row.checked})`,
		[FORM.area]: row.area,
		[FORM.fit]: f.reason,
		[FORM.evidence]: f.evidence?.length ? f.evidence.map((e) => `- ${evidenceText(e)}`).join("\n") : "none",
		[FORM.decision]: `Build it, or mark the row out-of-scope in docs/competitors/${competitor.id}.json with a reason.`,
		[FORM.acceptance]: row.acceptance,
		[FORM.ice]: `ICE ${iceScore(ice).toFixed(1)}: impact ${ice.impact}, confidence ${ice.confidence}, ease ${ice.ease}.\n\n${ice.basis}`,
	};
	const parts = [markerFor(competitor.id, row.id), ""];
	for (const [label, answer] of Object.entries(sections)) parts.push(`### ${label}`, "", answer, "");
	parts.push(
		"---",
		`Opened by \`scripts/competitor-gap-issues.mjs\` from \`docs/competitors/${competitor.id}.json\` (scorer: \`competitor-coverage\`). To decline, set this row's status to \`out-of-scope\` with a reason in that file; the issue then closes itself. When the row becomes \`covered\`, it closes as completed.`,
	);
	return parts.join("\n");
}

// The pure decision. competitors: loadAll().competitors. issues: [{ number, title, body, state, labels }].
export function plan(competitors, issues, { minIce = MIN_ICE, minEase = MIN_EASE, maxNew = MAX_NEW } = {}) {
	const out = { create: [], close: [], leftClosed: [], belowBar: [], keptOpenBelowBar: [], deferred: [], ignored: 0 };
	const byMarker = new Map();
	for (const issue of issues) {
		const m = MARKER_RE.exec(issue.body ?? "");
		if (!m) {
			out.ignored++;
			continue;
		}
		const key = `${m[1]}:${m[2]}`;
		// An open issue wins over a closed one with the same marker.
		if (!byMarker.has(key) || (issue.state === "OPEN" && byMarker.get(key).state !== "OPEN")) byMarker.set(key, issue);
	}
	const seen = new Set();
	for (const competitor of competitors) {
		for (const row of competitor.rows) {
			const key = `${competitor.id}:${row.id}`;
			seen.add(key);
			const issue = byMarker.get(key);
			const f = row.flisk ?? {};
			const gap = f.scope === "in" && f.status === "missing";
			const at = `${competitor.id}/${row.area}/${row.id}`;
			if (gap) {
				const score = iceScore(row.ice);
				const scored = { at, score, ease: row.ice?.ease ?? null };
				if (issue?.state === "OPEN") {
					if (!passesBar(row, { minIce, minEase })) out.keptOpenBelowBar.push({ ...scored, number: issue.number });
				} else if (issue) out.leftClosed.push({ ...scored, number: issue.number });
				else if (!passesBar(row, { minIce, minEase })) out.belowBar.push(scored);
				else if (out.create.length < maxNew) out.create.push({ ...scored, competitor, row });
				else out.deferred.push(scored);
			} else if (issue?.state === "OPEN" && f.status !== "partial") {
				const done = f.status === "covered";
				out.close.push({
					at,
					number: issue.number,
					reason: done ? "completed" : "not planned",
					comment: done
						? `Row \`${row.id}\` in docs/competitors/${competitor.id}.json is now \`covered\`; closing as completed.`
						: `Row \`${row.id}\` in docs/competitors/${competitor.id}.json is now \`${f.status}\` (${f.reason ?? "no reason"}); closing as not planned.`,
				});
			}
		}
	}
	// An open issue whose row was deleted from the matrix is closed too.
	for (const [key, issue] of byMarker)
		if (!seen.has(key) && issue.state === "OPEN")
			out.close.push({
				at: key,
				number: issue.number,
				reason: "not planned",
				comment: `The row \`${key}\` is no longer in docs/competitors/; closing as not planned.`,
			});
	return out;
}

// Labels of the new issues that the repo does not have yet, with their definitions from labels.json.
export function labelsToCreate(creates, existingNames, defs) {
	const have = new Set(existingNames.map((n) => n.toLowerCase()));
	const wanted = [...new Set(creates.flatMap((c) => labelsFor(c.competitor, c.row)))];
	return wanted.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ name, ...defs[name] }));
}

const gh = (args, input) =>
	execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

export const realGh = gh;

// Summary lines of a plan, for the dry run and the apply log.
export function describe(p, { apply, minIce, minEase, maxNew, missingLabels, issueType }) {
	const lines = [
		`${apply ? "APPLY" : "DRY RUN"}: bar ICE >= ${minIce} and ease >= ${minEase}, at most ${maxNew} new issues; issue type: ${issueType ?? "none (labels only)"}`,
	];
	for (const l of missingLabels) lines.push(`  ${apply ? "create" : "would create"} label "${l.name}" #${l.color} ${l.description}`);
	for (const c of p.create)
		lines.push(`  ${apply ? "open" : "would open"} ${titleFor(c.competitor, c.row)} [ICE ${c.score.toFixed(1)}, ease ${c.ease}] labels: ${labelsFor(c.competitor, c.row).join(", ")}`);
	for (const c of p.close) lines.push(`  ${apply ? "close" : "would close"} #${c.number} ${c.at} as ${c.reason}`);
	for (const c of p.deferred) lines.push(`  deferred (over --max-new): ${c.at} ICE ${c.score.toFixed(1)}`);
	for (const c of p.leftClosed) lines.push(`  left alone (closed by a maintainer, still missing): #${c.number} ${c.at}`);
	for (const c of p.keptOpenBelowBar) lines.push(`  kept open although below the bar now: #${c.number} ${c.at} ICE ${c.score?.toFixed(1)} ease ${c.ease}`);
	for (const c of p.belowBar) lines.push(`  not raised (below the bar): ${c.at} ICE ${c.score?.toFixed(1) ?? "invalid"} ease ${c.ease ?? "?"}`);
	lines.push(`  ${p.create.length} to open, ${p.close.length} to close, ${p.belowBar.length} below the bar, ${p.ignored} issues without the marker ignored`);
	return lines;
}

export async function run(argv, { root, run: exec = gh, log = console.log } = {}) {
	const { values } = parseArgs({
		args: argv,
		options: {
			apply: { type: "boolean", default: false },
			"max-new": { type: "string", default: String(MAX_NEW) },
			"min-ice": { type: "string", default: String(MIN_ICE) },
			"min-ease": { type: "string", default: String(MIN_EASE) },
			repo: { type: "string", default: "flisk-sh/flisk" },
		},
	});
	const opts = { minIce: Number(values["min-ice"]), minEase: Number(values["min-ease"]), maxNew: Number(values["max-new"]) };
	if ([opts.minIce, opts.minEase, opts.maxNew].some(Number.isNaN)) throw new Error("--max-new, --min-ice and --min-ease take numbers");
	const apply = values.apply;
	const repo = values.repo;
	const { competitors } = loadAll(root);
	const defs = Object.fromEntries(JSON.parse(readFileSync(path.join(root, "docs/competitors/labels.json"), "utf8")).map((l) => [l.name, l]));
	const issues = JSON.parse(
		exec(["issue", "list", "-R", repo, "--label", "competitor-gap", "--state", "all", "--limit", "1000", "--json", "number,title,body,state,labels"]),
	);
	const p = plan(competitors, issues, opts);
	const existing = JSON.parse(exec(["label", "list", "-R", repo, "--limit", "500", "--json", "name"])).map((l) => l.name);
	const missingLabels = labelsToCreate(p.create, existing, defs);
	let issueType = null;
	try {
		const types = JSON.parse(exec(["api", `orgs/${repo.split("/")[0]}/issue-types`]));
		issueType = types.find((t) => t.name === "Feature" && t.is_enabled !== false)?.name ?? null;
	} catch {
		// The org has no issue types, or the token cannot read them: labels carry the meaning.
	}
	for (const line of describe(p, { apply, ...opts, missingLabels, issueType })) log(line);
	if (!apply) return p;
	for (const l of missingLabels)
		exec(["label", "create", l.name, "-R", repo, "--color", l.color, "--description", l.description]);
	for (const c of p.create) {
		const payload = { title: titleFor(c.competitor, c.row), body: bodyFor(c.competitor, c.row), labels: labelsFor(c.competitor, c.row) };
		if (issueType) payload.type = issueType;
		exec(["api", `repos/${repo}/issues`, "--method", "POST", "--input", "-"], JSON.stringify(payload));
	}
	for (const c of p.close)
		exec(["issue", "close", String(c.number), "-R", repo, "--reason", c.reason, "--comment", c.comment]);
	return p;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	run(process.argv.slice(2), { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") }).catch((err) => {
		console.error(err.message);
		process.exitCode = 1;
	});
}
