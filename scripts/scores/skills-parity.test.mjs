// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the skills-parity scorer, on fixture repos whose cli/dist/program.js is built with the real Commander.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { measure, skills } from "./skills-parity.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commander = pathToFileURL(createRequire(path.join(repoRoot, "cli/package.json")).resolve("commander")).href;

const CLI = `import { Command } from ${JSON.stringify(commander)};
export function createProgram() {
	const program = new Command("flisk").version("1.0.0", "-v, --version").option("--project <dir>");
	program.command("up").alias("deploy").argument("[stack]").option("--dry-run").option("--json");
	program.command("down");
	program.command("status").option("--json");
	program.command("agent").command("sessions").option("--watch");
	return program;
}
`;

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "skills-parity-"));
	// cli/package.json makes the fake cli/dist ES modules, as in the real package.
	for (const [rel, body] of Object.entries({ "cli/package.json": '{ "type": "module" }', ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

const skill = (name, body) => `---\nname: ${name}\ndescription: A test skill.\n---\n\n${body}\n`;

test("a skill is a folder with a SKILL.md under .claude/skills, local or synced, or cli/templates/agent-skills", () => {
	const root = fixture({
		".claude/skills/LOCAL": "local-one\n",
		".claude/skills/local-one/SKILL.md": skill("local-one", ""),
		".claude/skills/synced-one/SKILL.md": skill("synced-one", ""),
		".claude/skills/synced-one/references/more.md": "more\n",
		".claude/skills/synced-one/references/nested/SKILL.md": skill("nested", ""),
		".claude/skills/notes-only/README.md": "not a skill\n",
		"cli/templates/agent-skills/generated/SKILL.md": skill("generated", ""),
	});
	try {
		assert.deepEqual(skills(root), [
			{ name: "local-one", docs: [".claude/skills/local-one/SKILL.md"] },
			{
				name: "synced-one",
				docs: [
					".claude/skills/synced-one/SKILL.md",
					".claude/skills/synced-one/references/more.md",
					".claude/skills/synced-one/references/nested/SKILL.md",
				],
			},
			{ name: "generated", docs: ["cli/templates/agent-skills/generated/SKILL.md"] },
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("the score is the share of skills whose commands all resolve, with one finding per problem", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		".claude/skills/clean/SKILL.md": skill(
			"clean",
			"Run `flisk up --dry-run`, then `flisk deploy shop`.\n```bash\nflisk agent sessions --watch\n```",
		),
		".claude/skills/quiet/SKILL.md": skill("quiet", "This skill names no command."),
		// A synced skill, not in LOCAL: its drift is what `npx skills add` installs, so it counts.
		".claude/skills/synced/SKILL.md": skill("synced", "Check with `flisk status --jsno`."),
		".claude/skills/synced/references/deep.md": "```bash\nflisk agent list\n```\n",
		"cli/templates/agent-skills/generated/SKILL.md": skill("generated", "```sh\nflisk upp\nflisk <command> --help\n```"),
	});
	try {
		const result = await measure({ root });
		assert.deepEqual(result.findings, [
			"synced (.claude/skills/synced/SKILL.md:6): flisk status --jsno: unknown option --jsno",
			"synced (.claude/skills/synced/references/deep.md:2): flisk agent list: unknown command agent list",
			"generated (cli/templates/agent-skills/generated/SKILL.md:7): flisk upp: unknown command upp",
		]);
		assert.equal(result.value, 50);
		assert.equal(result.summary, "2 of 4 skills clean (1 name no flisk command), 7 flisk commands checked");
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a documented rejection and the one-command flow are not drift", async () => {
	const root = fixture({
		"cli/dist/program.js": CLI,
		"cli/dist/utils/project-templates.js": "export const PROJECT_TEMPLATES = { demo: {} };\n",
		".claude/skills/x/SKILL.md": skill(
			"x",
			"```text\n$ flisk upp\nerror: unknown command 'upp'\n```\nStart with `flisk demo`.",
		),
	});
	try {
		const result = await measure({ root });
		assert.deepEqual(result.findings, []);
		assert.equal(result.value, 100);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing CLI build is an error, and no skills at all is no data", async () => {
	const noCli = fixture({ ".claude/skills/x/SKILL.md": skill("x", "`flisk bogus`") });
	const noSkills = fixture({ "cli/dist/program.js": CLI });
	try {
		await assert.rejects(async () => measure({ root: noCli }), /cli\/dist\/program\.js is missing/);
		assert.equal((await measure({ root: noSkills })).value, null);
	} finally {
		rmSync(noCli, { recursive: true });
		rmSync(noSkills, { recursive: true });
	}
});

test("this repository: every skill folder is scored and the result is stable", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value >= 0 && first.value <= 100);
	assert.match(first.summary, new RegExp(`of ${skills(repoRoot).length} skills clean`));
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
