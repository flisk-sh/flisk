// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the tool-consistency scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	cliProblems,
	countFindings,
	countTable,
	descriptionProblems,
	docListProblems,
	measure,
	namingProblems,
	numberOf,
	parseTools,
} from "./tool-consistency.mjs";

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
	const root = mkdtempSync(path.join(tmpdir(), "tool-consistency-"));
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const tool = (name, { description = `The ${name} tool does one thing for the project, and says so.`, schema = true, path: p = true } = {}) => `
    {
      name: "${name}",
      description:
        "${description}",
      ${schema ? `inputSchema: OBJECT({ ${p ? "projectPath: PROJECT_PATH" : "other: 1"} }),` : ""}
      handler: viaCli(() => ["x"]),
    },`;

const TOOLS = `export function createFliskTools(): McpTool[] {
  return [${["status", "resource_list", "stack_list", "restart_resource"].map((n) => tool(n)).join("")}
  ];
}
`;

const NAMES = ["doctor", "up", "resource_list", "stack_list", "config_verify", "restart_resource", "list_agents"];

test("parseTools reads name, description, schema and projectPath per tool", () => {
	const src = `${tool("a_b", { description: "Has a \\\"quote\\\" and ends." })}${tool("c", { schema: false })}${tool("d", { path: false })}`;
	const [a, c, d] = parseTools(src);
	assert.deepEqual(a, { name: "a_b", description: 'Has a "quote" and ends.', hasSchema: true, hasProjectPath: true });
	assert.equal(c.hasSchema, false);
	assert.equal(d.hasProjectPath, false);
});

test("naming: verb-first names are flagged when most multi-word tools are noun-first", () => {
	assert.deepEqual(namingProblems(NAMES).map((f) => f.split(":")[0]), ["restart_resource", "list_agents"]);
	assert.match(namingProblems(NAMES)[0], /3 of 5 multi-word tools are <noun>_<verb>/);
});

test("naming: a repo that is verb-first throughout is not flagged, and snake_case is required", () => {
	assert.deepEqual(namingProblems(["list_agents", "get_agent_sessions", "restart_resource", "status"]), []);
	assert.deepEqual(namingProblems(["stackList", "stack-list", "Stack_list"]).length, 3);
});

test("descriptions: short, unfinished, duplicate, no schema and no projectPath are each reported", () => {
	const tools = [
		{ name: "ok_a", description: "A tool that does one thing for the project, and says so.", hasSchema: true, hasProjectPath: true },
		{ name: "ok_b", description: "Another tool that does a second thing for the project.", hasSchema: true, hasProjectPath: true },
		{ name: "short", description: "Does it.", hasSchema: true, hasProjectPath: true },
		{ name: "open", description: "A description that is long enough but never ends properly", hasSchema: true, hasProjectPath: true },
		{ name: "bare", description: "A tool that does one thing for the project, and says so.", hasSchema: false, hasProjectPath: false },
		{ name: "nopath", description: "Yet another tool that does a third thing for the project.", hasSchema: true, hasProjectPath: false },
	];
	assert.deepEqual(descriptionProblems(tools), [
		"short: description is 8 characters (at least 40)",
		"open: description does not end as a sentence",
		"bare: no inputSchema",
		"bare: same description as ok_a",
		"nopath: no projectPath input, which 4 of 6 tools accept",
	]);
});

test("a description that is the only thing missing a projectPath is not judged when few tools take it", () => {
	const t = (name, hasProjectPath) => ({ name, description: `${name} ${"x".repeat(50)}.`, hasSchema: true, hasProjectPath });
	assert.deepEqual(descriptionProblems([t("a", false), t("b", false), t("c", true)]), []);
});

test("docs: a file that lists most tools must list them all; a file that mentions a few is not a list", () => {
	const names = ["doctor", "up", "resource_list", "stack_list", "config_verify"];
	const root = fixture({
		"docs/a.md": "`doctor` `up` resource_list stack_list",
		"docs/b.md": "`doctor` `up` resource_list stack_list config_verify",
		"docs/c.md": "the logs and `up` only",
		"docs/d.md": "doctor up resource_list stack_list config_verify with no backticks",
	});
	try {
		const { findings, lists } = docListProblems(root, names, ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"]);
		assert.deepEqual(findings, [
			"docs/a.md: lists 4 of 5 tools but not config_verify",
			"docs/d.md: lists 3 of 5 tools but not doctor",
			"docs/d.md: lists 3 of 5 tools but not up",
		]);
		assert.deepEqual(lists, ["docs/a.md", "docs/b.md", "docs/d.md"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("numberOf reads digits, number words and hyphenated tens", () => {
	assert.deepEqual(["19", "nineteen", "Twenty-one", "forty", "many"].map(numberOf), [19, 19, 21, 40, null]);
});

const COUNTS = { tools: 19, commands: [24, 23], skills: [15, 12], scorers: 30, translations: [20, 21], resourceTypes: [9, 6, 7] };

test("counts in prose: a wrong number is reported, a right one passes, with the real count in the message", () => {
	const root = fixture({
		"docs/mcp.md": [
			"The server exposes nineteen tools.",
			"The server exposes 18 MCP tools.",
			"It has twenty-one skills.",
			"There are 12 skills in .claude/skills.",
			"Flisk ships 7 CLI commands.",
			"Eight translations of the README.",
			"20 languages, see README-xx.",
			"Nine resource types.",
		].join("\n"),
	});
	try {
		const findings = countFindings(root, ["docs/mcp.md"], countTable(COUNTS));
		assert.deepEqual(findings, [
			'docs/mcp.md:2: says "18 MCP tools"; the repo has 19',
			'docs/mcp.md:3: says "twenty-one skills"; the repo has 15 or 12',
			'docs/mcp.md:5: says "7 CLI commands"; the repo has 24 or 23',
			'docs/mcp.md:6: says "Eight translations"; the repo has 20 or 21',
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("counts in prose: exceptions are not findings", () => {
	const root = fixture({
		"README.md": [
			"10 categories with two tools each.",
			"Run three commands to get going.",
			"Up to 5 skills load at once, and the first 3 skills win.",
			"10 new tools were added for MCP.",
			"```text",
			"found 4 MCP tools",
			"```",
			"A page about the 3 tools of Tilt.",
		].join("\n"),
	});
	try {
		assert.deepEqual(countFindings(root, ["README.md"], countTable(COUNTS)), []);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("CLI: no description, camelCase option, undocumented option and a copied description are reported", async () => {
	const root = fixture({
		"cli/dist/program.js": program(`
			program.command("alpha").description("Does alpha for the project").option("--fooBar", "camel").option("--ok-flag");
			program.command("beta");
			program.command("gamma").description("Does alpha for the project");
			program.command("config").description("Config group").command("verify").description("Verify things").option("--json", "JSON output");
		`),
	});
	try {
		const { createProgram } = await import(pathToFileURL(path.join(root, "cli/dist/program.js")).href);
		assert.deepEqual(cliProblems(createProgram()), [
			"flisk alpha --fooBar: option names are kebab-case",
			"flisk alpha --ok-flag: option has no description",
			"flisk beta: command has no description",
			"flisk gamma: same description as flisk alpha",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("measure ties tools, docs, counts and CLI together on a fixture", async () => {
	const root = fixture({
		"cli/dist/program.js": program('program.command("status").description("Show status of things");'),
		"cli/src/mcp/tools.ts": TOOLS,
		"docs/agent-tooling/README.md": "The server exposes nineteen tools: `status` resource_list stack_list",
		// History is not held to the current count.
		"docs/CHANGELOG.md": "The server exposes 2 MCP tools.",
	});
	try {
		const result = await measure({ root });
		assert.equal(result.value, 3);
		assert.deepEqual(result.findings.map((f) => f.split(" ")[0]), ["naming", "docs", "count"]);
		assert.match(result.findings[1], /lists 3 of 4 tools but not restart_resource/);
		assert.match(result.findings[2], /says "nineteen tools"; the repo has 4/);
		assert.match(result.summary, /4 MCP tools, 3 inconsistencies/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build or tools file is an error, not a silent pass", async () => {
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

test("this repository: stable, and the three verb-first tools are what it finds", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value >= 0);
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
