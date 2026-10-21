// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Red-job tracker (#1288, tracker #1279). For each scheduled or main-branch workflow below, opens one issue when its last
// three non-pull-request runs on main failed, names the first failing run and the last error line, and closes that issue
// after three passing runs. Run by .github/workflows/red-job-tracker.yml.
//   node scripts/red-job-tracker.mjs [--dry-run]
// --dry-run prints each decision and changes nothing. Needs gh authenticated with actions: read and issues: write.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TRACKED = [
	"e2e-journeys.yml",
	"e2e-real-apps.yml",
	"e2e-scale-full.yml",
	"benchmarks.yml",
	"scorecard.yml",
	"codeql.yml",
];
export const WINDOW = 3;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const SCHEDULED_EVENTS = [
	"schedule",
	"workflow_run",
	"push",
	"workflow_dispatch",
];

// Decide from runs (newest first). Only completed, non-pull-request runs count; the streak is the newest WINDOW of them.
export function decide(runs) {
	const counted = runs.filter(
		(r) =>
			r.status === "completed" &&
			SCHEDULED_EVENTS.includes(r.event) &&
			r.conclusion !== "cancelled" &&
			r.conclusion !== "skipped",
	);
	const window = counted.slice(0, WINDOW);
	if (window.length < WINDOW) return { state: "unknown", window };
	if (window.every((r) => r.conclusion === "failure")) {
		return { state: "red", firstFailing: window[window.length - 1], window };
	}
	if (window.every((r) => r.conclusion === "success"))
		return { state: "green", window };
	return { state: "mixed", window };
}

// Last error line from a failed run's log, or a fallback. Input is the text of `gh run view --log-failed`.
export function lastErrorLine(log) {
	const lines = log
		.split("\n")
		.map((l) =>
			l
				.replace(ANSI, "")
				.replace(/^[^\t]*\t[^\t]*\t/, "")
				.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, "")
				.trim(),
		)
		.filter((l) => l && !/^##\[(group|endgroup)\]/.test(l));
	// GitHub's generic exit-code line names an error but not its cause, so it is skipped.
	const error = lines
		.filter((l) => !/Process completed with exit code/.test(l))
		.filter((l) => /error|fail|::error/i.test(l))
		.pop();
	return (error ?? lines.at(-1) ?? "no log output").slice(0, 300);
}

export function issueTitle(workflowName) {
	return `Red job: ${workflowName} failed ${WINDOW} runs in a row on main`;
}

function gh(args, input) {
	return execFileSync("gh", args, {
		encoding: "utf8",
		input,
		maxBuffer: 64 * 1024 * 1024,
	});
}

function listRuns(file) {
	return JSON.parse(
		gh([
			"run",
			"list",
			"--workflow",
			file,
			"--branch",
			"main",
			"--limit",
			"20",
			"--json",
			"databaseId,workflowName,status,conclusion,event,url,createdAt",
		]),
	);
}

function openIssue(workflowName) {
	const found = JSON.parse(
		gh([
			"issue",
			"list",
			"--state",
			"open",
			"--search",
			`in:title "${issueTitle(workflowName)}"`,
			"--json",
			"number,title",
		]),
	);
	return found.find((i) => i.title === issueTitle(workflowName)) ?? null;
}

function main(argv) {
	const dryRun = argv.includes("--dry-run");
	for (const file of TRACKED) {
		const runs = listRuns(file);
		const name = runs[0]?.workflowName ?? file;
		const { state, window, firstFailing } = decide(runs);
		const issue = openIssue(name);
		const label = `${file}: ${state}`;
		if (state === "red") {
			const failing = firstFailing;
			const last = window[0];
			const log = gh(["run", "view", String(last.databaseId), "--log-failed"]);
			const body = [
				`${name} failed its last ${WINDOW} runs on main.`,
				"",
				`First failing run in this streak: ${firstFailing.url} (${firstFailing.createdAt})`,
				`Latest run: ${last.url}`,
				"",
				`Last error line: \`${lastErrorLine(log)}\``,
				"",
				"This issue closes after three passing runs on main.",
			].join("\n");
			console.log(
				`${label}: ${issue ? "update" : "open"} issue, first failing ${failing.url}`,
			);
			if (!dryRun) {
				if (issue)
					gh(
						["issue", "comment", String(issue.number), "--body-file", "-"],
						body,
					);
				else
					gh(
						[
							"issue",
							"create",
							"--title",
							issueTitle(name),
							"--body-file",
							"-",
						],
						body,
					);
			}
		} else if (state === "green" && issue) {
			console.log(`${label}: close issue #${issue.number}`);
			if (!dryRun) {
				gh([
					"issue",
					"close",
					String(issue.number),
					"--comment",
					`${name} passed its last ${WINDOW} runs on main. Closing.`,
				]);
			}
		} else {
			console.log(
				`${label}${issue ? ` (issue #${issue.number} stays open)` : ""}`,
			);
		}
	}
	return 0;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
