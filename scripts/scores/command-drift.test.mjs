// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the command-drift scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { INTENTIONAL, invocations, measure } from "./command-drift.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commander = pathToFileURL(createRequire(path.join(repoRoot, "cli/package.json")).resolve("commander")).href;

const program = (body) => `import { Command } from ${JSON.stringify(commander)};
export function createProgram() {
	const program = new Command("flisk").version("1.0.0", "-v, --version").option("--verbose").option("--project <dir>");
	${body}
	return program;
}
`;

const CLI = program(`
	program.command("up").alias("deploy").argument("[stack]").option("--dry-run").option("--json");
	program.command("down").option("--prune-networks");
	program.command("resources").option("-s, --stack <name>").option("--no-stack");
	program.command("doctor").option("--no-ping");
	program.command("import").allowUnknownOption();
	const config = program.command("config");
	config.command("verify").option("--json");
`);

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "command-drift-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

test("invocations stop at shell separators, comments and a trailing backslash", () => {
	assert.deepEqual(invocations("flisk up --json && flisk down | cat"), [["up", "--json"], ["down"]]);
	assert.deepEqual(invocations("flisk logs --tail 5 > out.txt; flisk status"), [["logs", "--tail", "5"], ["status"]]);
	assert.deepEqual(invocations("npx flisk status # then flisk bogus"), [["status"]]);
	assert.deepEqual(invocations("flisk up \\"), [["up"]]);
	assert.deepEqual(invocations("flisk up\\"), [["up"]]);
	assert.deepEqual(invocations("flisk resources --stack a||flisk down"), [["resources", "--stack", "a"], ["down"]]);
});

test("invocations need a standalone flisk word and split at each one", () => {
	assert.deepEqual(invocations("git clone https://github.com/flisk-sh/flisk && open flisk.sh"), []);
	assert.deepEqual(invocations('"command": "flisk", "args": ["mcp"]'), []);
	assert.deepEqual(invocations("claude mcp add flisk -- flisk mcp"), [["--"], ["mcp"]]);
	assert.deepEqual(invocations("Run flisk doctor, then flisk up."), [["doctor", "then"], ["up"]]);
});

test("a doc command is checked against the command tree, with aliases, negations and --flag=value", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		"README.md": [
			"# Demo",
			"```bash",
			"flisk up --dry-run",
			"flisk deploy shop --json",
			"flisk resources --no-stack",
			"flisk resources --stack=shop",
			"flisk resources --stack=<name>",
			"flisk doctor --no-ping",
			"flisk doctor --ping",
			"flisk config verify --json",
			"flisk config check",
			"flisk --verbose up",
			"flisk --json up",
			"flisk up --stack=shop",
			"flisk upp",
			"flisk import ./compose --anything",
			"flisk <command> --help",
			"flisk config <subcommand> --<flag>",
			"flisk resources [--bogus] ...",
			"flisk up | flisk-sh/flisk --bogus",
			"```",
			"Then run `flisk up --jsno` or `flisk down --prune-networks`.",
		].join("\n"),
	});
	try {
		const result = await measure({ root }, []);
		assert.deepEqual(result.findings, [
			"README.md:9 flisk doctor --ping: unknown option --ping",
			"README.md:11 flisk config check: unknown command config check",
			"README.md:13 flisk --json up: unknown option --json",
			"README.md:14 flisk up --stack=shop: unknown option --stack",
			"README.md:15 flisk upp: unknown command upp",
			"README.md:22 flisk up --jsno: unknown option --jsno",
		]);
		assert.equal(result.value, 6);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("every doc agents copy from is scanned, history and roadmap docs are not", async () => {
	const bad = (word) => `Run \`flisk ${word}\`.\n`;
	const root = fixture({
		"cli/dist/program.js": CLI,
		"AGENTS.md": bad("agents-md"),
		"docs/guide/deep.md": bad("docs-md"),
		"docs/agents/llms.txt": bad("llms-txt"),
		".claude/skills/LOCAL": "# authored here\nx\n",
		".claude/skills/x/SKILL.md": bad("skill"),
		".claude/skills/synced/SKILL.md": bad("synced-from-flisk-skills"),
		"cli/templates/agent-skills/y/SKILL.md": bad("template"),
		"docs/ROADMAP.md": bad("roadmap"),
		"docs/history/CHANGELOG.md": bad("changelog"),
		"docs/notes.txt": bad("not-an-agent-contract"),
	});
	try {
		const { findings } = await measure({ root }, []);
		assert.deepEqual(findings.map((f) => f.split(" ")[0]).sort(), [
			".claude/skills/x/SKILL.md:1",
			"AGENTS.md:1",
			"cli/templates/agent-skills/y/SKILL.md:1",
			"docs/agents/llms.txt:1",
			"docs/guide/deep.md:1",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("output that names the CLI, a documented rejection and the one-command flow are not drift", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		"cli/dist/utils/project-templates.js": "export const PROJECT_TEMPLATES = { demo: {} };\n",
		"docs/x.md": [
			"```text",
			"$ flisk upp",
			"error: unknown command 'upp'",
			"flisk 1.3.79 is older than the 1.3.80 this project requires",
			"```",
			"Start with `flisk demo --project my-demo`, or `flisk --doctor`. Not `flisk demo --bogus` or `flisk tour`.",
		].join("\n"),
	});
	try {
		assert.deepEqual((await measure({ root }, [])).findings, [
			"docs/x.md:6 flisk demo --bogus: unknown option --bogus",
			"docs/x.md:6 flisk tour: unknown command tour",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build is an error, not a silent pass", async () => {
	const root = fixture({ "README.md": "`flisk bogus`\n" });
	try {
		await assert.rejects(async () => measure({ root }, []), /cli\/dist\/program\.js is missing/);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("this repository: the scan is stable across runs", async () => {
	const first = await measure({ root: repoRoot });
	assert.equal(typeof first.value, "number");
	assert.deepEqual(await measure({ root: repoRoot }), first);
});

test("an intentional mention is suppressed only where listed, and a stale entry is a finding", async () => {
	const root = fixture({ "cli/dist/program.js": CLI, "docs/a.md": "There is no `flisk db reset`.\n", "docs/b.md": "`flisk db reset`\n" });
	const intentional = [
		{ file: "docs/a.md", command: "flisk db reset", reason: "says it does not exist" },
		{ file: "docs/gone.md", command: "flisk smoke", reason: "removed since" },
	];
	try {
		const { findings } = await measure({ root }, intentional);
		assert.deepEqual(findings, [
			"docs/b.md:1 flisk db reset: unknown command db",
			"docs/gone.md flisk smoke: INTENTIONAL entry no longer matches a rejected command; remove it",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("every INTENTIONAL entry has a reason", () => {
	assert.deepEqual(INTENTIONAL.filter((e) => !e.reason), []);
});
