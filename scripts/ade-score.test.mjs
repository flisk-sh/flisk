// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for ade-score.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	checkWeights,
	HALVES,
	invalidSkills,
	mcpToolNames,
	renderMarkdown,
	runChecks,
	score,
	stalePaths,
} from "./ade-score.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "ade-score-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const byId = (results, id) => results.find((r) => r.id === id);
const toolsTs = (names) => names.map((n) => `    {\n      name: "${n}",\n`).join("");

test("weights add up to 100, split 50/50 between substrate and workspace", () => {
	const weights = checkWeights();
	const half = (h) => weights.filter((w) => w.half === h).reduce((n, w) => n + w.weight, 0);
	assert.equal(half("substrate"), 50);
	assert.equal(half("workspace"), 50);
	assert.equal(new Set(weights.map((w) => w.id)).size, weights.length);
});

test("an empty repository scores 0", () => {
	const root = fixture({ "README.md": "x" });
	try {
		const s = score(runChecks(root));
		assert.equal(s.total, 0);
		assert.equal(s.max, 100);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("mcpToolNames reads tool names and ignores other name fields", () => {
	const root = fixture({
		"cli/src/mcp/tools.ts": `${toolsTs(["doctor", "agent_sessions"])}      description: "x",\n  const nested = { name: "ignored-because-not-snake" };\n`,
	});
	try {
		assert.deepEqual(mcpToolNames(root), ["doctor", "agent_sessions"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("agent-sessions passes with the current tool name and with the former one", () => {
	for (const [name, pass] of [
		["agent_sessions", true],
		["get_agent_sessions", true],
		["agent_list", false],
	]) {
		const root = fixture({ "cli/src/mcp/tools.ts": toolsTs(["doctor", name]) });
		try {
			assert.equal(byId(runChecks(root), "agent-sessions").pass, pass, name);
		} finally {
			rmSync(root, { recursive: true });
		}
	}
});

test("mcp-tools-documented fails naming the tool missing from llms.txt", () => {
	const root = fixture({
		"cli/src/mcp/tools.ts": toolsTs(["up", "resource_restart"]),
		"docs/agents/llms.txt": "- `up`: start\n",
	});
	try {
		const row = byId(runChecks(root), "mcp-tools-documented");
		assert.equal(row.pass, false);
		assert.equal(row.detail, "resource_restart");
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("stalePaths flags a missing repo path but not generated paths or bare filenames", () => {
	const root = fixture({
		"AGENTS.md":
			"Read `cli/AGENTS.md` and `docs/gone.md`. Never edit `.flisk/x.json`; change `service.json` instead.\n",
		"cli/AGENTS.md": "x",
	});
	try {
		assert.deepEqual(stalePaths(root), ["docs/gone.md"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("invalidSkills flags a name that differs from its folder and a thin description", () => {
	const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`;
	const long = "Start a stack and confirm the healthy URLs for the user.";
	const root = fixture({
		".claude/skills/good/SKILL.md": skill("good", long),
		".claude/skills/renamed/SKILL.md": skill("other", long),
		".claude/skills/thin/SKILL.md": skill("thin", "short"),
	});
	try {
		assert.deepEqual(invalidSkills(root).sort(), ["renamed", "thin"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("worktree-isolation needs a `worktree add` call, not a worktree detector", () => {
	const detector = fixture({
		"cli/src/utils/git.ts": "export function isInsideGitWorkTree() {}\n// a linked worktree has a .git file\n",
	});
	const creator = fixture({
		"cli/src/commands/task.ts": 'run("git", ["worktree", "add", dir]);\n',
	});
	try {
		assert.equal(byId(runChecks(detector), "worktree-isolation").pass, false);
		assert.equal(byId(runChecks(creator), "worktree-isolation").pass, true);
	} finally {
		rmSync(detector, { recursive: true });
		rmSync(creator, { recursive: true });
	}
});

test("workspace checks turn green when a matching command or MCP tool ships", () => {
	const root = fixture({
		"cli/src/commands/task.ts": "x",
		"cli/src/commands/review.ts": "x",
		"cli/src/mcp/tools.ts": toolsTs(["fleet_status", "plan_approve"]),
	});
	try {
		const results = runChecks(root);
		assert.equal(byId(results, "task-objects").pass, true);
		assert.equal(byId(results, "review-gate").pass, true);
		assert.equal(byId(results, "agent-board").pass, true);
		assert.equal(byId(results, "spec-gate").pass, true);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("test files do not count as shipped commands", () => {
	const root = fixture({ "cli/src/commands/__tests__/task.test.ts": "x", "cli/src/commands/task.test.ts": "x" });
	try {
		assert.equal(byId(runChecks(root), "task-objects").pass, false);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("score sums earned weight per half", () => {
	const s = score([
		{ half: "substrate", weight: 4, pass: true },
		{ half: "substrate", weight: 6, pass: false },
		{ half: "workspace", weight: 10, pass: true },
	]);
	assert.deepEqual(s, {
		total: 14,
		max: 20,
		halves: { substrate: { earned: 4, max: 10 }, workspace: { earned: 10, max: 10 } },
	});
});

test("markdown report lists the total, both halves and failing detail", () => {
	const md = renderMarkdown([
		{ id: "a", half: "substrate", weight: 3, title: "A", pass: false, detail: "x.md" },
		{ id: "b", half: "workspace", weight: 2, title: "B", pass: true, detail: "" },
	]);
	assert.match(md, /### ADE score: 2\/5/);
	assert.match(md, /\*\*fail\*\* \(x\.md\)/);
	for (const h of HALVES) assert.match(md, new RegExp(`\\| ${h} \\|`));
});

test("this repository: substrate checks pass and the score is stable across runs", () => {
	const first = score(runChecks(repoRoot));
	assert.deepEqual(score(runChecks(repoRoot)), first);
	assert.equal(first.halves.substrate.earned, first.halves.substrate.max);
});
