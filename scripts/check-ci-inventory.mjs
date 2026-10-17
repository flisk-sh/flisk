// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Checks .github/ci-inventory.json against the jobs in .github/workflows/*.yml (#1281, tracker #1279). Every job needs an
// entry with a tier, no two jobs may report the same check name, the required entries must equal main's branch protection,
// every job needs a timeout (reusable-workflow callers excepted) and every pull_request workflow needs a concurrency group,
// and report jobs never run on push. A known violation is recorded in its entry's "exempt" map, keyed by rule, with the
// tracking issue as the value, so the check stays green while the fix is scheduled.
//   node scripts/check-ci-inventory.mjs [--root <repo dir>] [--contexts <json file of check names>]
// Without --contexts the required set is read from branch protection with `gh api` and the check fails if that call fails.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const TIERS = [
	"gate",
	"test",
	"e2e",
	"security",
	"release",
	"bot",
	"report",
];
export const RULES = ["check-name", "timeout", "concurrency", "push-trigger"];
const PR_TRIGGERS = ["pull_request", "pull_request_target"];

// Triggers of a parsed workflow, from `on:` written as a string, a list or a map.
export function triggersOf(workflow) {
	const on = workflow.on ?? workflow[true];
	if (typeof on === "string") return [on];
	if (Array.isArray(on)) return on;
	return Object.keys(on ?? {});
}

// The jobs of every workflow file, with what the rules need from each.
export function loadJobs(workflowsDir) {
	const jobs = [];
	for (const file of readdirSync(workflowsDir)
		.filter((f) => /\.ya?ml$/.test(f))
		.sort()) {
		const workflow =
			YAML.parse(readFileSync(path.join(workflowsDir, file), "utf8")) ?? {};
		const triggers = triggersOf(workflow);
		const hasConcurrency = Boolean(workflow.concurrency?.group);
		for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
			jobs.push({
				workflow: file,
				job: id,
				checkName: job.name ?? id,
				reusable: typeof job.uses === "string",
				hasTimeout: job["timeout-minutes"] !== undefined,
				triggers,
				hasConcurrency,
			});
		}
	}
	return jobs;
}

// Required check names from branch protection on main, or from a file of names when given.
export function loadContexts({ repo, contextsFile }) {
	if (contextsFile) return JSON.parse(readFileSync(contextsFile, "utf8"));
	const body = JSON.parse(
		execFileSync(
			"gh",
			["api", `repos/${repo}/branches/main/protection/required_status_checks`],
			{ encoding: "utf8" },
		),
	);
	return [
		...new Set([
			...(body.contexts ?? []),
			...(body.checks ?? []).map((c) => c.context),
		]),
	];
}

// Every problem with the inventory against the jobs and the required check names. Returns messages; an empty list passes.
export function checkInventory({ inventory, jobs, contexts }) {
	const problems = [];
	const entries = Array.isArray(inventory?.jobs) ? inventory.jobs : [];
	const jobKey = (workflow, job) => `${workflow}:${job}`;
	const jobsByKey = new Map(jobs.map((j) => [jobKey(j.workflow, j.job), j]));
	const entryByKey = new Map();

	for (const entry of entries) {
		const key = jobKey(entry.workflow, entry.job);
		const label = `${entry.workflow} ${entry.job}`;
		if (typeof entry.workflow !== "string" || typeof entry.job !== "string") {
			problems.push(
				`inventory entry needs a workflow and a job: ${JSON.stringify(entry)}`,
			);
			continue;
		}
		if (entryByKey.has(key))
			problems.push(`${label}: listed twice in the inventory`);
		entryByKey.set(key, entry);
		if (!TIERS.includes(entry.tier))
			problems.push(
				`${label}: tier "${entry.tier}" is not one of ${TIERS.join(", ")}`,
			);
		if (typeof entry.required !== "boolean")
			problems.push(`${label}: "required" must be true or false`);
		if (typeof entry.reason !== "string" || entry.reason.trim() === "")
			problems.push(`${label}: "reason" is empty`);
		if (typeof entry.owner !== "string" || entry.owner.trim() === "")
			problems.push(`${label}: "owner" is empty`);
		for (const [rule, tracker] of Object.entries(entry.exempt ?? {})) {
			if (!RULES.includes(rule))
				problems.push(
					`${label}: exempt rule "${rule}" is not one of ${RULES.join(", ")}`,
				);
			if (!/^#\d+$/.test(String(tracker)))
				problems.push(
					`${label}: exempt "${rule}" needs a tracking issue such as #1284`,
				);
		}
	}

	for (const job of jobs) {
		const key = jobKey(job.workflow, job.job);
		if (!entryByKey.has(key))
			problems.push(`${job.workflow} ${job.job}: no entry in the CI inventory`);
	}
	for (const entry of entries) {
		if (
			entry.workflow &&
			entry.job &&
			!jobsByKey.has(jobKey(entry.workflow, entry.job))
		) {
			problems.push(
				`${entry.workflow} ${entry.job}: the inventory names a job that no longer exists`,
			);
		}
	}

	const exempt = (entry, rule) => Boolean(entry?.exempt?.[rule]);
	const knownJobs = jobs.filter((j) =>
		entryByKey.has(jobKey(j.workflow, j.job)),
	);

	// One check name, one job. Two jobs reporting the same name make a required name ambiguous.
	const byName = new Map();
	for (const job of knownJobs) {
		byName.set(job.checkName, [...(byName.get(job.checkName) ?? []), job]);
	}
	for (const [name, sharing] of byName) {
		if (sharing.length < 2) continue;
		const open = sharing.filter(
			(j) => !exempt(entryByKey.get(jobKey(j.workflow, j.job)), "check-name"),
		);
		if (open.length === 0) continue;
		const who = sharing.map((j) => `${j.workflow} ${j.job}`).join(" and ");
		problems.push(`check name "${name}" is reported by ${who}`);
	}

	// Required entries must equal the branch protection contexts for main.
	const requiredNames = new Set(
		entries
			.filter(
				(e) => e.required === true && jobsByKey.has(jobKey(e.workflow, e.job)),
			)
			.map((e) => jobsByKey.get(jobKey(e.workflow, e.job)).checkName),
	);
	for (const name of requiredNames) {
		if (!contexts.includes(name))
			problems.push(
				`required check "${name}" is in the inventory but not in branch protection for main`,
			);
	}
	for (const name of contexts) {
		if (!requiredNames.has(name))
			problems.push(
				`required check "${name}" is in branch protection for main but not marked required in the inventory`,
			);
	}

	for (const job of knownJobs) {
		const entry = entryByKey.get(jobKey(job.workflow, job.job));
		const label = `${job.workflow} ${job.job}`;
		if (!job.reusable && !job.hasTimeout && !exempt(entry, "timeout")) {
			problems.push(`${label}: no timeout-minutes`);
		}
		const triggersPr = job.triggers.some((t) => PR_TRIGGERS.includes(t));
		if (triggersPr && !job.hasConcurrency && !exempt(entry, "concurrency")) {
			problems.push(
				`${label}: runs on pull_request but its workflow has no concurrency group`,
			);
		}
		if (
			entry.tier === "report" &&
			job.triggers.includes("push") &&
			!exempt(entry, "push-trigger")
		) {
			problems.push(
				`${label}: report job triggered by push (report jobs run on a schedule, after a release or by hand)`,
			);
		}
	}
	return problems;
}

function main(argv) {
	const args = {
		root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
		contextsFile: undefined,
	};
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
		else if (argv[i] === "--contexts")
			args.contextsFile = path.resolve(argv[++i]);
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	const inventoryPath = path.join(args.root, ".github", "ci-inventory.json");
	const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
	let jobs;
	try {
		jobs = loadJobs(path.join(args.root, ".github", "workflows"));
	} catch (error) {
		console.error(
			`check-ci-inventory: cannot parse a workflow: ${error.message}`,
		);
		return 1;
	}
	const repo = process.env.GITHUB_REPOSITORY ?? "tdk-landscape/tdk-cli-core";
	let contexts;
	try {
		contexts = loadContexts({ repo, contextsFile: args.contextsFile });
	} catch (error) {
		console.error(
			`check-ci-inventory: cannot read required checks for ${repo} main: ${error.message}`,
		);
		return 1;
	}
	const problems = checkInventory({ inventory, jobs, contexts });
	for (const problem of problems)
		console.error(`check-ci-inventory: ${problem}`);
	if (problems.length > 0) {
		console.error(
			`check-ci-inventory: ${problems.length} problem(s) (inventory ${path.relative(args.root, inventoryPath)})`,
		);
		return 1;
	}
	console.log(
		`check-ci-inventory: ${jobs.length} jobs in ${new Set(jobs.map((j) => j.workflow)).size} workflows, all accounted for`,
	);
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main(process.argv.slice(2));
}
