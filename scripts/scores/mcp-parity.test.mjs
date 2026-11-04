// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the mcp-parity scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cliArgCommands, HUMAN_ONLY, isHumanOnly, measure } from "./mcp-parity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commander = pathToFileURL(createRequire(path.join(repoRoot, "cli/package.json")).resolve("commander")).href;

const program = (body) => `import { Command } from ${JSON.stringify(commander)};
export function createProgram() {
	const program = new Command("flisk").version("1.0.0", "-v, --version");
	${body}
	return program;
}
`;

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "mcp-parity-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const TOOLS = `
export function buildLogsArgs(): string[] {
  const out = ["logs", "--json"];
  return out;
}

export function createFliskTools(): McpTool[] {
  return [
    {
      name: "status",
      handler: (args) => readStatus(args),
    },
    {
      name: "list_stacks",
      handler: viaCli(() => ["stacks", "--json"]),
    },
    {
      name: "resource_list",
      inputSchema: { required: ["restart"] },
      handler: viaCli((args) => {
        return ["ls", "--json", ...(args.all ? ["--all"] : [])];
      }),
    },
  ];
}
`;

test("cliArgCommands reads the first string of returned or assigned arrays, not schema properties or flags", () => {
	assert.deepEqual(cliArgCommands(TOOLS), ["logs", "stacks", "ls"]);
	assert.deepEqual(cliArgCommands('return id ? ["agent", "sessions", id] : ["--json"];'), ["agent"]);
});

test("a command is covered by a tool name or by the CLI arguments a handler builds, aliases included", async () => {
	const root = fixture({
		"cli/dist/program.js": program(`
			for (const name of ["status", "logs", "restart", "stacks", "ui", "upgrade"]) program.command(name);
			program.command("resources").alias("ls");
			program.command("config").command("verify");
		`),
		"cli/src/mcp/tools.ts": TOOLS,
	});
	try {
		const result = await measure({ root });
		// status (tool name), logs (const out = [...]), stacks (arrow body), resources (alias ls); restart only sits in
		// a schema's required list.
		assert.equal(result.value, 66.7);
		assert.equal(result.summary, "4 of 6 commands reachable through MCP");
		assert.deepEqual(result.findings, ["flisk restart has no MCP tool", "flisk config has no MCP tool"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("human-only commands are left out, with a reason each, and so are their subcommands", () => {
	for (const name of ["help", "completion", "ui", "mcp", "version", "maintainers", "open", "os", "upgrade"])
		assert.ok(HUMAN_ONLY[name], name);
	assert.equal(isHumanOnly("maintainers check"), true);
	assert.equal(isHumanOnly("status"), false);
	assert.equal(isHumanOnly("constructor"), false);
});

test("a missing CLI build or MCP tools file is an error, not a silent pass", async () => {
	const noTools = fixture({ "cli/dist/program.js": program('program.command("status");') });
	const noCli = fixture({ "cli/src/mcp/tools.ts": TOOLS });
	try {
		await assert.rejects(async () => measure({ root: noTools }), /is missing/);
		await assert.rejects(async () => measure({ root: noCli }), /cli\/dist/);
	} finally {
		rmSync(noTools, { recursive: true });
		rmSync(noCli, { recursive: true });
	}
});

test("this repository: a stable percentage", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value > 0 && first.value <= 100);
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
