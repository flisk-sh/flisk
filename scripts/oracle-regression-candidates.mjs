#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Turns the fixtures an ORACLE sweep wrote (<out>/regressions/*.json) into vault candidates for a human-reviewed pull request.
// A candidate is kept only when it
//   1. is a valid vault fixture (validateFixture in tests/oracle/lib/vault.mjs),
//   2. is not already in the vault, nor in another candidate PR still open (same invariant and the same expected and actual
//      sides after normalizeActual), nor a repeat of an earlier candidate in this batch (the smallest scenario wins), and
//   3. reproduces once more on a strict replay with the same symptom (a candidate that does not is flaky and is only listed).
// Kept candidates are written to the vault directory with status "open". Nothing here commits, pushes or marks anything fixed:
// the workflow opens a draft pull request and a human decides.
//   node scripts/oracle-regression-candidates.mjs --candidates <dir> --vault tests/oracle/regressions [--known <dir>]...
//     [--summary <file>] [--dry-run]
// Prints the Markdown report (also appended to --summary) and, on GITHUB_OUTPUT, `added=<n>` and `files=<names>`.
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fixtureName, normalizeActual, replayScenario, validateFixture, verdict } from "../tests/oracle/lib/vault.mjs";

// One defect, whatever seed found it: the invariant plus both sides with only the volatile parts folded.
export const defectKey = (fx) => JSON.stringify([fx?.invariant, normalizeActual(fx?.expected), normalizeActual(fx?.actual)]);

export function readFixtures(dir) {
	if (!dir || !existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((file) => {
			try {
				return { file, fx: JSON.parse(readFileSync(path.join(dir, file), "utf8")) };
			} catch (err) {
				return { file, fx: null, parseError: err.message };
			}
		});
}

// A free file name in the vault: the usual <invariant>-<seed>.json, suffixed when a different fixture already has it.
export function freeName(fx, taken) {
	const base = fixtureName(fx).replace(/\.json$/, "");
	let name = `${base}.json`;
	for (let n = 2; taken.has(name); n++) name = `${base}-${n}.json`;
	return name;
}

// The whole decision, pure: `replay(fx)` returns the strict replay's failure of fx.invariant, or null when it holds.
// Cheap checks run first so a malformed or duplicate candidate never costs a replay.
export function planCandidates({ candidates, known, replay }) {
	const seen = new Set(known.filter((k) => k.fx).map((k) => defectKey(k.fx)));
	const taken = new Set(known.map((k) => k.file));
	const report = { added: [], invalid: [], duplicates: [], flaky: [] };
	const valid = [];
	for (const { file, fx, parseError } of candidates) {
		const errors = parseError ? [`not JSON: ${parseError}`] : validateFixture(fx);
		if (errors.length) report.invalid.push({ file, reason: errors.join("; ") });
		else valid.push({ file, fx: { ...fx, status: "open" } });
	}
	// Within the batch the smallest scenario is the best witness, so it goes first and claims the defect.
	valid.sort((a, b) => a.fx.scenario.resources.length - b.fx.scenario.resources.length || a.file.localeCompare(b.file));
	for (const { file, fx } of valid) {
		const key = defectKey(fx);
		if (seen.has(key)) {
			report.duplicates.push({ file, reason: `same defect as a fixture already in the vault or an open candidate PR (${fx.invariant})` });
			continue;
		}
		let result;
		try {
			result = replay(fx);
		} catch (err) {
			report.flaky.push({ file, reason: `replay crashed: ${err.message}` });
			continue;
		}
		const problem = verdict(file, fx, result);
		if (problem) {
			report.flaky.push({ file, reason: problem });
			continue;
		}
		seen.add(key);
		const name = freeName(fx, taken);
		taken.add(name);
		report.added.push({ file: name, from: file, fx });
	}
	return report;
}

// A Markdown table cell: backslashes first, so an existing "\|" cannot turn into an escaped backslash plus a live pipe.
const cell = (s) => String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);

export function renderReport(report) {
	const lines = [`### ORACLE vault candidates: ${report.added.length} new`, ""];
	if (report.added.length) {
		lines.push("| Fixture | Invariant | Resources | Actual |", "| --- | --- | --- | --- |");
		for (const { file, fx } of report.added) lines.push(`| \`${file}\` | ${fx.invariant} | ${fx.scenario.resources.length} | ${cell(fx.actual)} |`);
		lines.push("");
	}
	for (const [key, title] of [
		["flaky", "Did not reproduce on a second strict replay (left out)"],
		["duplicates", "Already in the vault or an open candidate PR (left out)"],
		["invalid", "Not a valid vault fixture (left out)"],
	]) {
		if (!report[key].length) continue;
		lines.push(`**${title}**`, "");
		for (const { file, reason } of report[key]) lines.push(`- \`${file}\`: ${cell(reason)}`);
		lines.push("");
	}
	return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
	const opts = { known: [], dryRun: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--candidates") opts.candidates = argv[++i];
		else if (a === "--vault") opts.vault = argv[++i];
		else if (a === "--known") opts.known.push(argv[++i]);
		else if (a === "--summary") opts.summary = argv[++i];
		else if (a === "--dry-run") opts.dryRun = true;
		else throw new Error(`unknown argument ${a}`);
	}
	if (!opts.candidates || !opts.vault) throw new Error("--candidates and --vault are required");
	return opts;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const known = [opts.vault, ...opts.known].flatMap((dir) => readFixtures(dir));
	const report = planCandidates({
		candidates: readFixtures(opts.candidates),
		known,
		replay: (fx) => replayScenario(fx.scenario, fx.invariant, { strict: true }),
	});
	if (!opts.dryRun) for (const { file, fx } of report.added) writeFileSync(path.join(opts.vault, file), `${JSON.stringify(fx, null, 2)}\n`);
	const text = renderReport(report);
	process.stdout.write(text);
	if (opts.summary) appendFileSync(opts.summary, text);
	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `added=${report.added.length}\nfiles=${report.added.map((a) => a.file).join(" ")}\n`);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	try {
		main();
	} catch (err) {
		console.error(err.message);
		process.exit(1);
	}
}
