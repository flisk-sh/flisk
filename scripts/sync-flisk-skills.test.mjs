// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/sync-flisk-skills.sh. Run by `make test-shell`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL_SCRIPT = path.join(SCRIPT_DIR, "sync-flisk-skills.sh");

function resolveBash() {
	if (process.platform !== "win32") {
		return "bash";
	}
	const candidates = [
		process.env.SHELL,
		"C:\\Program Files\\Git\\bin\\bash.exe",
		"C:\\Program Files\\Git\\usr\\bin\\bash.exe",
		"C:\\Program Files (x86)\\Git\\bin\\bash.exe",
	].filter(Boolean);
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	try {
		const out = execFileSync("where", ["bash.exe"], { encoding: "utf8" });
		const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
		for (const line of lines) {
			if (!line.toLowerCase().includes("system32")) {
				return line;
			}
		}
	} catch {
		// fall through
	}
	return "bash";
}

const bashExecutable = resolveBash();

function runScript(workspaceRoot, args = [], extraEnv = {}) {
	const scriptPath = path.join(workspaceRoot, "scripts", "sync-flisk-skills.sh");
	const normalizedScript = scriptPath.replaceAll("\\", "/");
	return spawnSync(bashExecutable, [normalizedScript, ...args], {
		cwd: workspaceRoot,
		encoding: "utf8",
		env: {
			...process.env,
			...extraEnv,
		},
	});
}

function createFixtureWorkspace({ localSkills = null, existingSkills = {}, outsideFiles = {} } = {}) {
	const tmp = mkdtempSync(path.join(tmpdir(), "flisk-sync-skills-ws-"));
	const scriptsDir = path.join(tmp, "scripts");
	mkdirSync(scriptsDir, { recursive: true });
	copyFileSync(ORIGINAL_SCRIPT, path.join(scriptsDir, "sync-flisk-skills.sh"));
	chmodSync(path.join(scriptsDir, "sync-flisk-skills.sh"), 0o755);

	if (localSkills !== null) {
		const localDir = path.join(tmp, ".claude", "skills");
		mkdirSync(localDir, { recursive: true });
		writeFileSync(path.join(localDir, "LOCAL"), localSkills.join("\n"));
	}

	for (const [skillName, skillContent] of Object.entries(existingSkills)) {
		const skillDir = path.join(tmp, ".claude", "skills", skillName);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
	}

	for (const [relPath, content] of Object.entries(outsideFiles)) {
		const fullPath = path.join(tmp, relPath);
		mkdirSync(path.dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, content);
	}

	return tmp;
}

function createSourceSkillsRepo({ hasMarketplace = true, skills = {} } = {}) {
	const repoDir = mkdtempSync(path.join(tmpdir(), "flisk-skills-src-"));
	if (hasMarketplace) {
		const pluginDir = path.join(repoDir, ".claude-plugin");
		mkdirSync(pluginDir, { recursive: true });
		writeFileSync(
			path.join(pluginDir, "marketplace.json"),
			JSON.stringify({ name: "flisk-skills", version: "1.0.0" }, null, 2),
		);
	}

	for (const [skillName, skillContent] of Object.entries(skills)) {
		const skillDir = path.join(repoDir, "skills", skillName);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(path.join(skillDir, "SKILL.md"), skillContent);
	}

	return repoDir;
}

test("fails with exit 1 when source repository marketplace metadata is missing", () => {
	const ws = createFixtureWorkspace();
	const emptySource = createSourceSkillsRepo({ hasMarketplace: false });
	try {
		const res = runScript(ws, [], { FLISK_SKILLS_REPO: emptySource });
		assert.equal(res.status, 1);
		assert.match(res.stderr, /Missing Flisk skills source repo/);
	} finally {
		rmSync(ws, { recursive: true, force: true });
		rmSync(emptySource, { recursive: true, force: true });
	}
});

test("fails with exit 1 when FLISK_SKILLS_REPO points to non-existent directory", () => {
	const ws = createFixtureWorkspace();
	const nonExistent = path.join(tmpdir(), `flisk-skills-nonexistent-${Date.now()}`);
	try {
		const res = runScript(ws, [], { FLISK_SKILLS_REPO: nonExistent });
		assert.equal(res.status, 1);
		assert.match(res.stderr, /Missing Flisk skills source repo/);
	} finally {
		rmSync(ws, { recursive: true, force: true });
	}
});

test("synchronizes skills from valid source repo, copies SKILL.md, and creates expected symlinks", () => {
	const ws = createFixtureWorkspace({
		outsideFiles: {
			"sentinel.txt": "outside root sentinel",
			".claude/settings.json": '{"setting":"active"}',
		},
	});
	const source = createSourceSkillsRepo({
		skills: {
			"flisk-release": "# Flisk Release Skill\nRelease procedures.",
			"docker-helper": "# Docker Helper Skill\nDocker guidance.",
		},
	});

	try {
		const res = runScript(ws, [], { FLISK_SKILLS_REPO: source });
		assert.equal(res.status, 0, res.stderr);

		// Assert SKILL.md copied to .claude/skills
		const releaseSkill = path.join(ws, ".claude", "skills", "flisk-release", "SKILL.md");
		const dockerSkill = path.join(ws, ".claude", "skills", "docker-helper", "SKILL.md");
		assert.equal(existsSync(releaseSkill), true);
		assert.equal(existsSync(dockerSkill), true);
		assert.equal(readFileSync(releaseSkill, "utf8"), "# Flisk Release Skill\nRelease procedures.");
		assert.equal(readFileSync(dockerSkill, "utf8"), "# Docker Helper Skill\nDocker guidance.");

		// Assert symlinks created under .agents/skills
		const releaseLink = path.join(ws, ".agents", "skills", "flisk-release");
		const dockerLink = path.join(ws, ".agents", "skills", "docker-helper");
		assert.equal(existsSync(releaseLink), true);
		assert.equal(existsSync(dockerLink), true);

		// Assert symlink targets
		assert.equal(readlinkSync(releaseLink), "../../.claude/skills/flisk-release");
		assert.equal(readlinkSync(dockerLink), "../../.claude/skills/docker-helper");

		// Assert sentinel files outside the target remain unchanged
		assert.equal(readFileSync(path.join(ws, "sentinel.txt"), "utf8"), "outside root sentinel");
		assert.equal(readFileSync(path.join(ws, ".claude", "settings.json"), "utf8"), '{"setting":"active"}');
	} finally {
		rmSync(ws, { recursive: true, force: true });
		rmSync(source, { recursive: true, force: true });
	}
});

test("preserves pre-existing local skills listed in LOCAL, removes unlisted obsolete skills, and updates symlinks", () => {
	const ws = createFixtureWorkspace({
		localSkills: [
			"# In-repo custom skills that must be preserved",
			"my-custom-skill",
			"",
			"  another-local-skill   # with trailing comment",
		],
		existingSkills: {
			"my-custom-skill": "# My Custom Skill\nCustom authoring.",
			"another-local-skill": "# Another Local Skill\nLocal authoring.",
			"obsolete-remote-skill": "# Obsolete Skill\nShould be removed.",
		},
		outsideFiles: {
			"sentinel.md": "# Sentinel File",
		},
	});

	const source = createSourceSkillsRepo({
		skills: {
			"new-remote-skill": "# New Remote Skill\nIncoming.",
		},
	});

	try {
		const res = runScript(ws, [], { FLISK_SKILLS_REPO: source });
		assert.equal(res.status, 0, res.stderr);

		// Local skills preserved
		const localSkill1 = path.join(ws, ".claude", "skills", "my-custom-skill", "SKILL.md");
		const localSkill2 = path.join(ws, ".claude", "skills", "another-local-skill", "SKILL.md");
		assert.equal(existsSync(localSkill1), true);
		assert.equal(existsSync(localSkill2), true);
		assert.equal(readFileSync(localSkill1, "utf8"), "# My Custom Skill\nCustom authoring.");
		assert.equal(readFileSync(localSkill2, "utf8"), "# Another Local Skill\nLocal authoring.");

		// Obsolete remote skill removed
		const obsoleteSkill = path.join(ws, ".claude", "skills", "obsolete-remote-skill");
		assert.equal(existsSync(obsoleteSkill), false);

		// New remote skill added
		const newSkill = path.join(ws, ".claude", "skills", "new-remote-skill", "SKILL.md");
		assert.equal(existsSync(newSkill), true);
		assert.equal(readFileSync(newSkill, "utf8"), "# New Remote Skill\nIncoming.");

		// Symlinks created for both local and new remote skills
		const localLink1 = path.join(ws, ".agents", "skills", "my-custom-skill");
		const localLink2 = path.join(ws, ".agents", "skills", "another-local-skill");
		const newLink = path.join(ws, ".agents", "skills", "new-remote-skill");
		const obsoleteLink = path.join(ws, ".agents", "skills", "obsolete-remote-skill");

		assert.equal(readlinkSync(localLink1), "../../.claude/skills/my-custom-skill");
		assert.equal(readlinkSync(localLink2), "../../.claude/skills/another-local-skill");
		assert.equal(readlinkSync(newLink), "../../.claude/skills/new-remote-skill");
		assert.equal(existsSync(obsoleteLink), false);

		// Sentinel unchanged
		assert.equal(readFileSync(path.join(ws, "sentinel.md"), "utf8"), "# Sentinel File");
	} finally {
		rmSync(ws, { recursive: true, force: true });
		rmSync(source, { recursive: true, force: true });
	}
});

test("handles non-directory entries in source skills directory gracefully", () => {
	const ws = createFixtureWorkspace();
	const source = createSourceSkillsRepo({
		skills: {
			"valid-skill": "# Valid Skill",
		},
	});

	// Place a stray non-directory file inside source/skills
	writeFileSync(path.join(source, "skills", "README.txt"), "This is not a skill directory");

	try {
		const res = runScript(ws, [], { FLISK_SKILLS_REPO: source });
		assert.equal(res.status, 0, res.stderr);

		assert.equal(existsSync(path.join(ws, ".claude", "skills", "valid-skill", "SKILL.md")), true);
		assert.equal(existsSync(path.join(ws, ".claude", "skills", "README.txt")), false);
		assert.equal(existsSync(path.join(ws, ".agents", "skills", "README.txt")), false);
	} finally {
		rmSync(ws, { recursive: true, force: true });
		rmSync(source, { recursive: true, force: true });
	}
});
