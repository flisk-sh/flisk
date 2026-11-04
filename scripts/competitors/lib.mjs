// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Shared reading and checking of the competitor data in docs/competitors/. index.json lists the competitors, the areas
// every row belongs to and the pages the weekly watch reads; <id>.json holds one competitor's feature matrix. The
// scorers (scripts/scores/competitor-*.mjs), the issue sync, the snapshot refresher and the MATRIX.md renderer all read
// the data through here, so a rule about a row lives in one place. Nothing here calls the network or a model.
import { readFileSync } from "node:fs";
import path from "node:path";
import { mcpToolNames } from "../ade-score.mjs";
import { commandTree, has, read, round1 } from "../scores/lib.mjs";

export const DIR = "docs/competitors";
export const STATUSES = ["covered", "partial", "missing", "out-of-scope"];
export const CATEGORIES = ["terminal-ade", "agent-platform", "local-dev-runtime", "orchestrator", "skills-directory"];
export const WATCH_KINDS = ["features", "changelog", "pricing", "docs"];
// A row whose `checked` date is older than this many days is a finding: the source needs a re-read.
export const STALE_DAYS = 90;

const json = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

export const loadIndex = (root) => json(root, `${DIR}/index.json`);
export const loadCompetitor = (root, id) => json(root, `${DIR}/${id}.json`);

// Every competitor of the index with its rows: [{ ...indexEntry, rows }].
export function loadAll(root) {
	const index = loadIndex(root);
	return {
		index,
		competitors: index.competitors.map((c) => ({ ...c, rows: loadCompetitor(root, c.id).rows ?? [] })),
	};
}

// Short feature name for titles: the row's `name`, else its id with spaces.
export const featureName = (row) => row.name ?? row.id.replace(/-/g, " ");

// ICE score of a row: the mean of impact, confidence and ease, one decimal. null when the three numbers are not valid.
export function iceScore(ice) {
	if (!iceProblem(ice)) return round1((ice.impact + ice.confidence + ice.ease) / 3);
	return null;
}

// Why an ice object is unusable, or null: all of impact, confidence and ease are integers from 1 to 10 and there is a basis.
export function iceProblem(ice) {
	if (!ice || typeof ice !== "object") return "ice is missing";
	for (const k of ["impact", "confidence", "ease"])
		if (!Number.isInteger(ice[k]) || ice[k] < 1 || ice[k] > 10) return `ice.${k} must be an integer from 1 to 10`;
	if (typeof ice.basis !== "string" || ice.basis.trim().length < 10) return "ice.basis must say why";
	return null;
}

// Whether a missing in-scope row may become an issue: ICE score >= minIce AND ease >= minEase (a quick win).
export function passesBar(row, { minIce, minEase }) {
	const score = iceScore(row.ice);
	return score !== null && score >= minIce && row.ice.ease >= minEase;
}

// Whether one evidence item holds today. Returns null when it does, else the reason it fails.
export async function checkEvidence(root, item, tree) {
	const keys = Object.keys(item ?? {});
	if (keys.length !== 1) return "evidence must have exactly one of file, command, mcpTool, text";
	const [kind] = keys;
	if (kind === "file") return has(root, item.file) ? null : `file ${item.file} does not exist`;
	if (kind === "command") {
		if (!tree) throw new Error("cli/dist/program.js is missing or does not load: run `bun install` in cli/");
		const name = item.command.replace(/^flisk\s+/, "");
		const found = tree.commands.some((c) => c.path === name);
		return found ? null : `command "${item.command}" is not in the CLI`;
	}
	if (kind === "mcpTool") return mcpToolNames(root).includes(item.mcpTool) ? null : `MCP tool ${item.mcpTool} does not exist`;
	if (kind === "text") {
		const { file, contains } = item.text ?? {};
		if (!file || !contains) return "text evidence needs file and contains";
		if (!has(root, file)) return `file ${file} does not exist`;
		return read(root, file).includes(contains) ? null : `${file} no longer contains "${contains}"`;
	}
	return `unknown evidence type "${kind}"`;
}

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isUrl = (s) => typeof s === "string" && /^https?:\/\/[^\s]+$/.test(s);

// Problems with the data of one competitor, as strings prefixed `<id>/<area>/<row>`. Evidence is checked against the checkout.
export async function dataProblems(root, competitor, areas, now, tree) {
	const out = [];
	const seen = new Set();
	for (const row of competitor.rows) {
		const at = `${competitor.id}/${row.area ?? "?"}/${row.id ?? "?"}`;
		const bad = (msg) => out.push(`${at}: ${msg}`);
		const f = row.flisk ?? {};
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.id ?? "")) bad("id must be kebab-case");
		else if (seen.has(row.id)) bad("duplicate id");
		seen.add(row.id);
		if (!areas.includes(row.area)) bad(`area must be one of ${areas.join(", ")}`);
		if (!row.offer) bad("offer is empty");
		if (!isUrl(row.source)) bad("source must be a URL");
		if (!isDate(row.checked)) bad("checked must be a YYYY-MM-DD date");
		else if ((now - Date.parse(row.checked)) / 86_400_000 > STALE_DAYS)
			bad(`source not re-checked since ${row.checked} (over ${STALE_DAYS} days)`);
		if (!Array.isArray(row.match) || !row.match.length || row.match.some((m) => !m || m !== String(m).toLowerCase().trim()))
			bad("match needs lower-case keywords");
		if (!STATUSES.includes(f.status)) {
			bad(`flisk.status must be one of ${STATUSES.join(", ")}`);
			continue;
		}
		const expectScope = f.status === "out-of-scope" ? "out" : "in";
		if (f.scope !== expectScope) bad(`status ${f.status} needs scope "${expectScope}"`);
		if (f.status !== "covered" && !f.reason) bad(`a ${f.status} row needs a reason`);
		const evidence = f.evidence ?? [];
		if (["covered", "partial"].includes(f.status) && !evidence.length) bad(`a ${f.status} row needs evidence`);
		if (["missing", "out-of-scope"].includes(f.status) && evidence.length) bad(`a ${f.status} row has no evidence`);
		if (f.status === "missing") {
			if (!row.acceptance) bad("a missing in-scope row needs an acceptance check");
			const why = iceProblem(row.ice);
			if (why) bad(why);
		}
		if (["covered", "partial"].includes(f.status)) {
			const results = await Promise.all(evidence.map((e) => checkEvidence(root, e, tree)));
			for (const why of results.filter(Boolean)) bad(`stale claim: ${why}`);
		}
	}
	return out;
}

// Coverage of one competitor: (covered + 0.5 partial) / in-scope rows x 100, or null with no in-scope row.
export function coverage(rows) {
	const inScope = rows.filter((r) => r.flisk?.scope === "in");
	if (!inScope.length) return null;
	const n = (s) => inScope.filter((r) => r.flisk.status === s).length;
	return { value: round1(((n("covered") + 0.5 * n("partial")) / inScope.length) * 100), inScope: inScope.length };
}

export const counts = (rows) =>
	Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.flisk?.status === s).length]));

// The in-scope missing rows of every competitor, in index order: [{ competitor, row }].
export const missingRows = (competitors) =>
	competitors.flatMap((c) =>
		c.rows.filter((r) => r.flisk?.scope === "in" && r.flisk?.status === "missing").map((row) => ({ competitor: c, row })),
	);

export { commandTree };
