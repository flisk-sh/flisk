// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Checks .github/ci-inventory.json against the jobs in .github/workflows/*.yml (#1281, tracker #1279). Every job needs an
// entry with a tier, no two jobs may report the same check name, the required entries must equal the main merge queue
// ruleset's required checks, every job needs a timeout (reusable-workflow callers excepted) and every pull_request workflow
// needs a concurrency group, and report jobs never run on push. A known violation is recorded in its entry's "exempt" map,
// keyed by rule, with the tracking issue as the value, so the check stays green while the fix is scheduled.
//   node scripts/check-ci-inventory.mjs [--root <repo dir>] [--live]
// The required set comes from .github/rulesets/main.json, the checked-in snapshot of the main merge queue ruleset, so pull
// request runs need no admin token. --live reads the live ruleset with `gh api` (needs administration read; only the
// scheduled drift job on main uses it). Branch protection is not used: the ruleset is the single source of required checks.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

// exact: every required job must be in contexts and every context must be a required job. A ruleset may require a subset, so it passes exact: false.
export function checkRequiredContexts({ inventory, jobs, contexts, source, exact = true }) {
	const problems = [];
	const entries = Array.isArray(inventory?.jobs) ? inventory.jobs : [];
	const jobsByKey = new Map(jobs.map((j) => [`${j.workflow}:${j.job}`, j]));
	const requiredNames = new Set(
		entries
			.filter((entry) => entry.required === true && jobsByKey.has(`${entry.workflow}:${entry.job}`))
			.map((entry) => jobsByKey.get(`${entry.workflow}:${entry.job}`).checkName),
	);
	for (const name of exact ? requiredNames : []) {
		if (!contexts.includes(name)) {
			problems.push(`required check "${name}" is in the inventory but not in ${source}`);
		}
	}
	for (const name of contexts) {
		if (!requiredNames.has(name)) {
			problems.push(`required check "${name}" is in ${source} but not marked required in the inventory`);
		}
	}
	return problems;
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

	// Required entries must match each required-check source. Rulesets and classic branch protection are independent.
	problems.push(
		...checkRequiredContexts({
			inventory,
			jobs,
			contexts,
			source: "the main merge queue ruleset",
		}),
	);

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

export function contextsOf(ruleset) {
	return [...new Set(ruleset.rules
		.filter((rule) => rule.type === "required_status_checks")
		.flatMap((rule) => rule.parameters.required_status_checks.map((check) => check.context)))].sort();
}

export function fetchLiveRulesetContexts(repo, rulesetName) {
	const summaries = JSON.parse(
		execFileSync("gh", ["api", `repos/${repo}/rulesets?per_page=100`], { encoding: "utf8" }),
	);
	const summary = summaries.find((ruleset) => ruleset.name === rulesetName);
	if (!summary) throw new Error(`ruleset '${rulesetName}' was not found`);
	const ruleset = JSON.parse(
		execFileSync("gh", ["api", `repos/${repo}/rulesets/${summary.id}`], { encoding: "utf8" }),
	);
	return contextsOf(ruleset);
}

function main(argv) {
	const args = {
		root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
		mode: "snapshot",
	};
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
		else if (argv[i] === "--live") args.mode = "live";
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	const repo = process.env.GITHUB_REPOSITORY ?? "flisk-sh/flisk";
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
	let contexts;
	try {
		contexts =
			args.mode === "live"
				? fetchLiveRulesetContexts(repo, "main merge queue")
				: contextsOf(
						JSON.parse(
							readFileSync(path.join(args.root, ".github", "rulesets", "main.json"), "utf8"),
						),
					);
	} catch (error) {
		console.error(
			`check-ci-inventory: cannot read required checks (${args.mode}): ${error.message}`,
		);
		return 1;
	}
	const problems = checkInventory({ inventory, jobs, contexts });
	for (const problem of problems)
		console.error(`check-ci-inventory: ${problem}`);
	if (problems.length > 0) {
		console.error(
			`check-ci-inventory: ${problems.length} problem(s) (inventory ${path.relative(args.root, inventoryPath)}, required checks ${args.mode})`,
		);
		return 1;
	}
	console.log(
		`check-ci-inventory: ${jobs.length} jobs in ${new Set(jobs.map((j) => j.workflow)).size} workflows, all accounted for (required checks: ${args.mode})`,
	);
	return 0;
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main(process.argv.slice(2));
}
