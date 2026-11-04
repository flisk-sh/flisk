// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the llms-freshness scorer, on fixture repos whose cli/dist/program.js is built with the real
// Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONTRACTS, documents, measure, namesCommand, namesTool } from "./llms-freshness.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commander = pathToFileURL(createRequire(path.join(repoRoot, "cli/package.json")).resolve("commander")).href;

// up (alias deploy), networks and config are the agent surface; ui and maintainers are human-only.
const CLI = `import { Command } from ${JSON.stringify(commander)};
export function createProgram() {
	const program = new Command("flisk").version("1.0.0", "-v, --version");
	program.command("up").alias("deploy");
	program.command("networks").alias("urls");
	program.command("config").command("verify");
	program.command("ui");
	program.command("maintainers").command("check");
	return program;
}
`;

// Tool names as cli/src/mcp/tools.ts writes them (ade-score's mcpToolNames reads `name: "x",` lines).
const TOOLS = `export function createFliskTools() {
  return [
    {
      name: "status",
      handler: () => null,
    },
    {
      name: "stack_list",
      handler: () => null,
    },
  ];
}
`;

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "llms-freshness-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

test("a command is named as flisk <command> or an alias, as whole words, in prose or code", () => {
	assert.equal(namesCommand("Run `flisk up --json`.", ["up"]), true);
	assert.equal(namesCommand("then flisk up.", ["up"]), true);
	assert.equal(namesCommand("`flisk deploy shop`", ["up", "deploy"]), true);
	assert.equal(namesCommand("flisk config verify", ["config"]), true);
	assert.equal(namesCommand("flisk upgrade", ["up"]), false);
	assert.equal(namesCommand("flisk up-to-date", ["up"]), false);
	assert.equal(namesCommand("`flisk resource <name>`", ["resources"]), false);
	assert.equal(namesCommand("npm install -g @flisk-sh/flisk up", ["up"]), false);
	assert.equal(namesCommand("see flisk.sh up there", ["up"]), false);
	assert.equal(namesCommand("the `up` tool", ["up"]), false);
});

test("a tool is named only in backticks", () => {
	assert.equal(namesTool("Tools: `stack_list`, `status`.", "stack_list"), true);
	assert.equal(namesTool("call stack_list to list stacks", "stack_list"), false);
	assert.equal(namesTool("`stack_list_all`", "stack_list"), false);
});

test("the score is the share of (document, item) pairs named, human-only commands left out", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		"cli/src/mcp/tools.ts": TOOLS,
		// Names up (through its alias), config, `status` and `stack_list`; misses networks. `flisk ui` is human-only.
		"docs/agents/llms.txt": "Run `flisk deploy`, `flisk config verify` and `flisk ui`. Tools: `status`, `stack_list`.\n",
		// Names everything: networks through prose, the tools in backticks.
		"docs/agents/llms-full.txt": "flisk up\nflisk networks\nflisk config\n`status` `stack_list`\n",
	});
	try {
		const result = await measure({ root });
		assert.deepEqual(result.findings, ["docs/agents/llms.txt: no flisk networks"]);
		// 5 items (up, networks, config, status, stack_list) in 2 documents: 9 of 10.
		assert.equal(result.value, 90);
		assert.equal(result.summary, "9 of 10 (document, item) pairs named: llms.txt 4/5, llms-full.txt 5/5");
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("an AGENTS.md template under cli/templates is a third document; a missing contract names nothing", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		"cli/src/mcp/tools.ts": TOOLS,
		"docs/agents/llms.txt": "flisk up, flisk networks, flisk config, `status`, `stack_list`\n",
		"cli/templates/project/AGENTS.md.hbs": "Use `flisk up` and the `status` tool.\n",
		"cli/templates/agent-skills/x/SKILL.md": "`flisk networks` (a skill, not an AGENTS.md template)\n",
	});
	try {
		assert.deepEqual(documents(root), [...CONTRACTS, "cli/templates/project/AGENTS.md.hbs"]);
		const result = await measure({ root });
		assert.deepEqual(result.findings, [
			"docs/agents/llms-full.txt: missing, so it names none of the 5 commands and tools",
			"cli/templates/project/AGENTS.md.hbs: no flisk networks",
			"cli/templates/project/AGENTS.md.hbs: no flisk config",
			"cli/templates/project/AGENTS.md.hbs: no `stack_list`",
		]);
		// 5 + 0 + 2 of 15.
		assert.equal(result.value, 46.7);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build is an error, not a silent pass", async () => {
	const root = fixture({ "cli/src/mcp/tools.ts": TOOLS, "docs/agents/llms.txt": "`status`\n" });
	try {
		await assert.rejects(async () => measure({ root }), /cli\/dist\/program\.js is missing/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("this repository: both contracts are read and the result is stable", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value > 0 && first.value <= 100);
	assert.match(first.summary, /llms\.txt \d+\/\d+, llms-full\.txt \d+\/\d+/);
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
