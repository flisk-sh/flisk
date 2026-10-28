// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the json-docs scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { documents, jsonCommands, measure } from "./json-docs.mjs";
import { commandTree } from "./lib.mjs";

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
	const root = mkdtempSync(path.join(tmpdir(), "json-docs-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const PROGRAM = program(`
	program.command("status").option("--json");
	program.command("up").option("--json");
	program.command("stacks").alias("ls").option("--json");
	program.command("logs").option("--tail <n>");
	program.command("upgrade").option("--json");
	const config = program.command("config");
	config.command("verify").option("--json");
	config.command("explain").option("--json");
	config.command("edit").option("--json");
`);

test("documents needs `flisk <path>` as a whole command, across spaces, not inside a longer word", () => {
	assert.equal(documents("Run `flisk config verify --json`.", "config verify"), true);
	assert.equal(documents("flisk  config\tverify", "config verify"), true);
	assert.equal(documents("| `flisk up` | starts |", "up"), true);
	assert.equal(documents("flisk upgrade --json", "up"), false);
	assert.equal(documents("flisk up-all", "up"), false);
	assert.equal(documents("myflisk up", "up"), false);
	assert.equal(documents("flisk config", "config verify"), false);
});

test("documents accepts the page's field list items that start with the command path in backticks", () => {
	assert.equal(documents("- `config regenerate`: `dryRun`, `hasChanges`", "config regenerate"), true);
	assert.equal(documents("- `config enable-infra` and `config disable-infra`: `service`", "config disable-infra"), true);
	assert.equal(documents("- `up --dry-run`: `ok`, `dryRun`", "up"), true);
	assert.equal(documents("- `upgrade`: something", "up"), false);
	assert.equal(documents("The `config regenerate` command: rewrites files", "config regenerate"), false);
});

test("jsonCommands: leaves with --json, without human-only and interactive ones", async () => {
	const root = fixture({ "cli/dist/program.js": PROGRAM });
	try {
		assert.deepEqual(jsonCommands(await commandTree(root)), ["status", "up", "stacks", "config verify", "config explain"]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("measure: the share of --json commands the page names; an alias or a longer command does not count", async () => {
	const root = fixture({
		"cli/dist/program.js": PROGRAM,
		"docs/reference/machine-readable-cli.md": "# JSON\n\n```bash\nflisk status --json\nflisk ls --json\nflisk upgrade --json\n```\n\n`flisk config verify --json` checks.\n",
	});
	try {
		const result = await measure({ root });
		assert.equal(result.value, 40);
		assert.equal(result.summary, "2 of 5 commands with --json are in docs/reference/machine-readable-cli.md");
		assert.deepEqual(result.findings, [
			"docs/reference/machine-readable-cli.md flisk up --json: not documented",
			"docs/reference/machine-readable-cli.md flisk stacks --json: not documented",
			"docs/reference/machine-readable-cli.md flisk config explain --json: not documented",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build or reference page is an error, not a silent pass", async () => {
	const noDoc = fixture({ "cli/dist/program.js": PROGRAM });
	const noCli = fixture({ "docs/reference/machine-readable-cli.md": "flisk status --json\n" });
	try {
		await assert.rejects(async () => measure({ root: noDoc }), /machine-readable-cli\.md is missing/);
		await assert.rejects(async () => measure({ root: noCli }), /cli\/dist/);
	} finally {
		rmSync(noDoc, { recursive: true });
		rmSync(noCli, { recursive: true });
	}
});
