// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Deterministic "ADE score": how much of an Agentic Development Environment (ADE) this repository ships, measured from
// files only (no network, no model). Each check is a yes/no predicate over the working tree with a fixed weight, so the
// same commit always gives the same score and a drop points at the check that failed, like a lint rule.
//
// Two halves of 50 points each, because an ADE is two things:
//   substrate  the environment an agent can run in and operate reliably (contract, machine interface, runtime, guardrails)
//   workspace  the surface that orchestrates and reviews the agents themselves (worktrees, tasks, board, review and spec gates)
// Flisk is built as the substrate, so the workspace half is expected to score low. Those checks stay in the total on
// purpose: they go green when the feature ships, not when the wording changes.
//
//   node scripts/ade-score.mjs [--root <repo dir>] [--json] [--markdown] [--min <total>]
// Exit 1 when the total is below --min (a ratchet; set it to the current score so it can only go up), 2 on bad usage.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HALVES = ["substrate", "workspace"];

const read = (root, rel) => {
	try {
		return readFileSync(path.join(root, rel), "utf8");
	} catch {
		return "";
	}
};
const has = (root, rel) => existsSync(path.join(root, rel));

// Every file under dir (relative paths), skipping test folders and dependency/build output.
function walk(root, dir) {
	const out = [];
	const abs = path.join(root, dir);
	if (!existsSync(abs)) return out;
	for (const name of readdirSync(abs)) {
		if (["node_modules", "dist", "__tests__", "coverage"].includes(name)) continue;
		const rel = path.join(dir, name);
		if (statSync(path.join(root, rel)).isDirectory()) out.push(...walk(root, rel));
		else if (!/\.test\.[cm]?[jt]sx?$/.test(name)) out.push(rel);
	}
	return out;
}

export function mcpToolNames(root) {
	return [...read(root, "cli/src/mcp/tools.ts").matchAll(/^\s+name: "([a-z_]+)",$/gm)].map(
		(m) => m[1],
	);
}

// Names a user or an agent can invoke: CLI command files plus MCP tools.
function surfaceNames(root) {
	const commands = walk(root, "cli/src/commands").map((f) =>
		path.basename(f).replace(/\.[^.]+$/, ""),
	);
	return [...commands, ...mcpToolNames(root)];
}

// Skill folders under .claude/skills with a SKILL.md whose frontmatter name matches the folder and has a real description.
export function invalidSkills(root) {
	const dir = path.join(root, ".claude/skills");
	if (!existsSync(dir)) return ["(no .claude/skills)"];
	const bad = [];
	for (const name of readdirSync(dir)) {
		if (!statSync(path.join(dir, name)).isDirectory() || name === "LOCAL") continue;
		const fm = read(root, `.claude/skills/${name}/SKILL.md`).match(/^---\n([\s\S]*?)\n---/);
		const field = (key) =>
			fm?.[1]
				.split("\n")
				.find((l) => l.startsWith(`${key}:`) && l.slice(key.length + 1).trim())
				?.slice(key.length + 1)
				.trim();
		if (field("name") !== name || (field("description") ?? "").length < 40) bad.push(name);
	}
	return bad;
}

// Repo paths AGENTS.md tells an agent to use that no longer exist. Generated or placeholder paths are not checked.
export function stalePaths(root) {
	const tokens = new Set(
		[...read(root, "AGENTS.md").matchAll(/`([^`\s]+)`/g)]
			.map((m) => m[1])
			// Bare filenames such as `service.json` name a file inside user projects, not a path in this repo.
			.filter((t) => /^[\w.-]+(\/[\w.-]+)+\/?$/.test(t)),
	);
	const generated = /^(\.flisk|release-dist|\.flisk-out|cli\/(coverage|test-results))/;
	return [...tokens].filter((t) => !generated.test(t) && !has(root, t.replace(/\/$/, "")));
}

const CHECKS = [
	// substrate / agent-contract: can an agent learn the rules without guessing
	{
		id: "agents-md",
		half: "substrate",
		area: "agent-contract",
		weight: 3,
		title: "AGENTS.md at the repo root",
		run: (r) => ({ pass: has(r, "AGENTS.md") }),
	},
	{
		id: "agents-md-fresh",
		half: "substrate",
		area: "agent-contract",
		weight: 4,
		title: "Every path AGENTS.md names exists",
		run: (r) => {
			const stale = stalePaths(r);
			return { pass: has(r, "AGENTS.md") && stale.length === 0, detail: stale.join(", ") };
		},
	},
	{
		id: "llms-txt",
		half: "substrate",
		area: "agent-contract",
		weight: 3,
		title: "docs/agents/llms.txt and llms-full.txt",
		run: (r) => ({ pass: has(r, "docs/agents/llms.txt") && has(r, "docs/agents/llms-full.txt") }),
	},
	{
		id: "skills-valid",
		half: "substrate",
		area: "agent-contract",
		weight: 3,
		title: "Agent skills have matching name and a real description",
		run: (r) => {
			const bad = invalidSkills(r);
			return { pass: bad.length === 0, detail: bad.join(", ") };
		},
	},
	{
		id: "repo-memory",
		half: "substrate",
		area: "agent-contract",
		weight: 2,
		title: "Repo memory file for hard-won traps",
		run: (r) => ({ pass: has(r, ".claude/memory/MEMORY.md") }),
	},
	// substrate / machine-interface: can an agent operate it without scraping text
	{
		id: "mcp-server",
		half: "substrate",
		area: "machine-interface",
		weight: 4,
		title: "MCP server (flisk mcp)",
		run: (r) => ({ pass: has(r, "cli/src/mcp/server.ts") && mcpToolNames(r).length > 0 }),
	},
	{
		id: "mcp-tools-documented",
		half: "substrate",
		area: "machine-interface",
		weight: 5,
		title: "Every MCP tool is named in llms.txt",
		run: (r) => {
			const doc = read(r, "docs/agents/llms.txt");
			const tools = mcpToolNames(r);
			const missing = tools.filter((t) => !doc.includes(`\`${t}\``));
			return { pass: tools.length > 0 && missing.length === 0, detail: missing.join(", ") };
		},
	},
	{
		id: "json-output",
		half: "substrate",
		area: "machine-interface",
		weight: 3,
		title: "status and doctor have --json",
		run: (r) => ({
			pass: ["status", "doctor"].every((c) => read(r, `cli/src/commands/${c}.ts`).includes('"--json')),
		}),
	},
	{
		id: "agent-sessions",
		half: "substrate",
		area: "machine-interface",
		weight: 3,
		title: "Agent sessions are inspectable (MCP tool)",
		// agent_sessions was get_agent_sessions before the tools were renamed noun-first; a checkout of either passes.
		run: (r) => ({ pass: mcpToolNames(r).some((name) => ["agent_sessions", "get_agent_sessions"].includes(name)) }),
	},
	// substrate / runtime: does the agent have somewhere durable to run
	{
		id: "agent-resource",
		half: "substrate",
		area: "runtime",
		weight: 3,
		title: "agent resource type with /health and /ready",
		run: (r) => {
			const doc = read(r, "docs/agents/llms.txt");
			return { pass: doc.includes("`agent`") && doc.includes("/health") && doc.includes("/ready") };
		},
	},
	{
		id: "agent-durability",
		half: "substrate",
		area: "runtime",
		weight: 3,
		title: "Agent state survives restarts (documented durability)",
		run: (r) => ({ pass: /durability/i.test(read(r, "docs/agents/llms.txt")) }),
	},
	{
		id: "agent-e2e",
		half: "substrate",
		area: "runtime",
		weight: 3,
		title: "Live-stack e2e suite for the agent resource type",
		run: (r) => ({ pass: has(r, "tests/e2e/resource-types/agent/suite.json") }),
	},
	{
		id: "diagnostics",
		half: "substrate",
		area: "runtime",
		weight: 3,
		title: "doctor and config verify exist",
		run: (r) => {
			const config = read(r, "cli/src/commands/config.ts");
			return { pass: has(r, "cli/src/commands/doctor.ts") && /["']verify["']/.test(config) };
		},
	},
	// substrate / guardrails: does the repo stop an agent's mistakes before they merge
	{
		id: "codeowners",
		half: "substrate",
		area: "guardrails",
		weight: 2,
		title: "CODEOWNERS",
		run: (r) => ({ pass: has(r, ".github/CODEOWNERS") }),
	},
	{
		id: "pr-template",
		half: "substrate",
		area: "guardrails",
		weight: 2,
		title: "Pull request template",
		run: (r) => ({ pass: has(r, ".github/pull_request_template.md") }),
	},
	{
		id: "merge-ruleset",
		half: "substrate",
		area: "guardrails",
		weight: 2,
		title: "Required checks recorded in a ruleset snapshot",
		run: (r) => ({ pass: has(r, ".github/rulesets/main.json") && has(r, ".github/ci-inventory.json") }),
	},
	{
		id: "dco",
		half: "substrate",
		area: "guardrails",
		weight: 2,
		title: "DCO sign-off enforced in CI",
		run: (r) => ({ pass: has(r, ".github/workflows/dco.yml") }),
	},
	// workspace: the surface that runs and reviews the agents themselves
	{
		id: "worktree-isolation",
		half: "workspace",
		area: "isolation",
		weight: 12,
		title: "One git worktree per agent task",
		run: (r) => {
			// Creating one (`git worktree add`), not merely detecting that the project sits inside one.
			const hit = walk(r, "cli/src").find((f) => /worktree["'`,\s]+add/i.test(read(r, f)));
			return { pass: Boolean(hit), detail: hit };
		},
	},
	{
		id: "task-objects",
		half: "workspace",
		area: "tasks",
		weight: 12,
		title: "Tasks as objects (command or MCP tool)",
		run: (r) => ({ pass: surfaceNames(r).some((n) => /task/i.test(n)) }),
	},
	{
		id: "agent-board",
		half: "workspace",
		area: "tasks",
		weight: 8,
		title: "Status board across parallel coding agents",
		run: (r) => ({ pass: surfaceNames(r).some((n) => /board|fleet/i.test(n)) }),
	},
	{
		id: "review-gate",
		half: "workspace",
		area: "gates",
		weight: 9,
		title: "Diff review or approval before merge",
		run: (r) => ({ pass: surfaceNames(r).some((n) => /review|diff|approve/i.test(n)) }),
	},
	{
		id: "spec-gate",
		half: "workspace",
		area: "gates",
		weight: 9,
		title: "Plan or spec approval before work starts",
		run: (r) => ({ pass: surfaceNames(r).some((n) => /^(plan|spec)/i.test(n)) }),
	},
];

export const checkWeights = () => CHECKS.map((c) => ({ id: c.id, half: c.half, weight: c.weight }));

export function runChecks(root) {
	return CHECKS.map((c) => {
		const { pass, detail } = c.run(root);
		return {
			id: c.id,
			half: c.half,
			area: c.area,
			weight: c.weight,
			title: c.title,
			pass,
			detail: detail ?? "",
		};
	});
}

export function score(results) {
	const sum = (rows) => rows.reduce((n, r) => n + r.weight, 0);
	const earned = (rows) => sum(rows.filter((r) => r.pass));
	const halves = Object.fromEntries(
		HALVES.map((h) => {
			const rows = results.filter((r) => r.half === h);
			return [h, { earned: earned(rows), max: sum(rows) }];
		}),
	);
	return { total: earned(results), max: sum(results), halves };
}

export function renderText(results) {
	const s = score(results);
	const lines = [];
	for (const half of HALVES) {
		lines.push(`${half}  ${s.halves[half].earned}/${s.halves[half].max}`);
		for (const r of results.filter((x) => x.half === half)) {
			const detail = r.detail ? `  (${r.detail})` : "";
			lines.push(`  ${r.pass ? "pass" : "FAIL"}  ${String(r.weight).padStart(2)}  ${r.id}: ${r.title}${detail}`);
		}
	}
	lines.push(`ADE score ${s.total}/${s.max}`);
	return lines.join("\n");
}

export function renderMarkdown(results) {
	const s = score(results);
	const lines = [`### ADE score: ${s.total}/${s.max}`, ""];
	lines.push("| Half | Score |", "| --- | --- |");
	for (const h of HALVES) lines.push(`| ${h} | ${s.halves[h].earned}/${s.halves[h].max} |`);
	lines.push("", "| Check | Weight | Result |", "| --- | --- | --- |");
	for (const r of results) {
		const detail = r.detail ? ` (${r.detail})` : "";
		lines.push(`| \`${r.id}\` ${r.title} | ${r.weight} | ${r.pass ? "pass" : `**fail**${detail}`} |`);
	}
	return lines.join("\n");
}

function main(argv) {
	const args = argv.slice(2);
	let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	let min = null;
	let format = "text";
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--root") root = path.resolve(args[++i] ?? "");
		else if (args[i] === "--json") format = "json";
		else if (args[i] === "--markdown") format = "markdown";
		else if (args[i] === "--min") min = Number(args[++i]);
		else {
			console.error(`unknown argument: ${args[i]}`);
			return 2;
		}
	}
	if (min !== null && !Number.isFinite(min)) {
		console.error("--min needs a number");
		return 2;
	}
	const results = runChecks(root);
	const s = score(results);
	if (format === "json") console.log(JSON.stringify({ ...s, checks: results }, null, 2));
	else if (format === "markdown") console.log(renderMarkdown(results));
	else console.log(renderText(results));
	if (min !== null && s.total < min) {
		console.error(`ADE score ${s.total} is below --min ${min}`);
		return 1;
	}
	return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv);
}
