// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Behaviour tests for scripts/sync-byo-templates.sh. Run by `make test-shell`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL_SCRIPT = path.join(SCRIPT_DIR, "sync-byo-templates.sh");

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
	const scriptPath = path.join(workspaceRoot, "scripts", "sync-byo-templates.sh");
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

function createFixtureWorkspace({ registry = null, outsideFiles = {} } = {}) {
	const tmp = mkdtempSync(path.join(tmpdir(), "flisk-sync-byo-"));
	const scriptsDir = path.join(tmp, "scripts");
	mkdirSync(scriptsDir, { recursive: true });
	copyFileSync(ORIGINAL_SCRIPT, path.join(scriptsDir, "sync-byo-templates.sh"));

	if (registry !== null) {
		const byoDir = path.join(tmp, "examples", "byo");
		mkdirSync(byoDir, { recursive: true });
		writeFileSync(path.join(byoDir, "templates.json"), JSON.stringify(registry, null, 2));
	}

	for (const [relPath, content] of Object.entries(outsideFiles)) {
		const fullPath = path.join(tmp, relPath);
		mkdirSync(path.dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, content);
	}

	return tmp;
}

function createUpstreamRepo({ id = "vue", files = {}, tag = "v1.0.0" } = {}) {
	const repoDir = mkdtempSync(path.join(tmpdir(), "flisk-upstream-"));
	execFileSync("git", ["-C", repoDir, "init", "-b", "main"]);
	execFileSync("git", ["-C", repoDir, "config", "user.name", "Test Runner"]);
	execFileSync("git", ["-C", repoDir, "config", "user.email", "test@example.com"]);
	execFileSync("git", ["-C", repoDir, "config", "commit.gpgsign", "false"]);
	execFileSync("git", ["-C", repoDir, "config", "core.autocrlf", "false"]);

	const serviceJson = files["service.json"] ?? JSON.stringify({ template: { id } }, null, 2);
	writeFileSync(path.join(repoDir, "service.json"), serviceJson);

	for (const [rel, content] of Object.entries(files)) {
		if (rel === "service.json") continue;
		const full = path.join(repoDir, rel);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, content);
	}

	execFileSync("git", ["-C", repoDir, "add", "."]);
	execFileSync("git", ["-C", repoDir, "commit", "-m", "init"]);
	if (tag) {
		execFileSync("git", ["-C", repoDir, "tag", tag]);
	}
	const sha = execFileSync("git", ["-C", repoDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	return { repoDir, sha };
}

function createGitConfig(redirects = {}) {
	const cfgDir = mkdtempSync(path.join(tmpdir(), "flisk-gitconfig-"));
	const cfgPath = path.join(cfgDir, "gitconfig");
	let content = "[advice]\n\tdetachedHead = false\n[core]\n\tautocrlf = false\n";
	for (const [remoteUrl, localDir] of Object.entries(redirects)) {
		const fileUrl = "file:///" + localDir.replaceAll("\\", "/");
		content += `[url "${fileUrl}"]\n\tinsteadOf = ${remoteUrl}\n`;
	}
	writeFileSync(cfgPath, content);
	return { cfgDir, cfgPath: cfgPath.replaceAll("\\", "/") };
}

test("--help and -h print usage and exit 0", () => {
	for (const flag of ["--help", "-h"]) {
		const res = spawnSync(bashExecutable, [ORIGINAL_SCRIPT.replaceAll("\\", "/"), flag], { encoding: "utf8" });
		assert.equal(res.status, 0);
		assert.match(res.stdout, /Usage:/);
		assert.match(res.stdout, /scripts\/sync-byo-templates\.sh/);
		assert.match(res.stdout, /--check/);
	}
});

test("missing registry exits 2 with clear error", () => {
	const root = createFixtureWorkspace();
	try {
		const res = runScript(root);
		assert.equal(res.status, 2);
		assert.match(res.stderr, /no template registry:/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("--check passes when no template folders contain tracked files", () => {
	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
		outsideFiles: {
			"README.md": "# Sample repo\n",
			"examples/byo/create-vue/untracked.txt": "this is untracked",
		},
	});
	try {
		execFileSync("git", ["-C", root, "init", "-b", "main"]);
		execFileSync("git", ["-C", root, "config", "user.name", "Test Runner"]);
		execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
		execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
		execFileSync("git", ["-C", root, "config", "core.autocrlf", "false"]);
		execFileSync("git", ["-C", root, "add", "README.md", "examples/byo/templates.json"]);
		execFileSync("git", ["-C", root, "commit", "-m", "init"]);

		const res = runScript(root, ["--check"]);
		assert.equal(res.status, 0, res.stderr);
		assert.equal(res.stderr, "");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("--check fails with exit 1 when a template folder has tracked files", () => {
	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
		outsideFiles: {
			"examples/byo/create-vue/tracked.txt": "accidentally tracked file",
		},
	});
	try {
		execFileSync("git", ["-C", root, "init", "-b", "main"]);
		execFileSync("git", ["-C", root, "config", "user.name", "Test Runner"]);
		execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
		execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
		execFileSync("git", ["-C", root, "config", "core.autocrlf", "false"]);
		execFileSync("git", ["-C", root, "add", "examples/byo/create-vue/tracked.txt", "examples/byo/templates.json"]);
		execFileSync("git", ["-C", root, "commit", "-m", "add tracked template file"]);

		const res = runScript(root, ["--check"]);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /examples\/byo\/create-vue is tracked, but it comes from flisk-sh\/flisk-template-vue/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("sync clones template to expected path and leaves outside files untouched", () => {
	const upstream = createUpstreamRepo({
		id: "vue",
		files: {
			"package.json": JSON.stringify({ name: "my-vue-template", version: "1.0.0" }),
			"src/main.js": "console.log('vue template');",
		},
		tag: "v1.0.0",
	});

	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
		outsideFiles: {
			"outside.txt": "root canary file",
			"examples/outside-example.txt": "examples directory canary",
			"examples/byo/README.md": "byo directory canary",
		},
	});

	const config = createGitConfig({
		"https://github.com/flisk-sh/flisk-template-vue.git": upstream.repoDir,
	});

	try {
		const res = runScript(root, [], { GIT_CONFIG_GLOBAL: config.cfgPath });
		assert.equal(res.status, 0, res.stderr);
		assert.match(res.stdout, /synced vue: flisk-sh\/flisk-template-vue v1\.0\.0/);

		const targetDir = path.join(root, "examples", "byo", "create-vue");
		assert.equal(existsSync(targetDir), true);
		assert.equal(existsSync(path.join(targetDir, "package.json")), true);
		assert.equal(readFileSync(path.join(targetDir, "src", "main.js"), "utf8"), "console.log('vue template');");

		const syncedFrom = readFileSync(path.join(targetDir, ".synced-from"), "utf8");
		assert.match(syncedFrom, /repository: flisk-sh\/flisk-template-vue/);
		assert.match(syncedFrom, /tag: v1\.0\.0/);
		assert.match(syncedFrom, new RegExp(`commit: ${upstream.sha}`));

		// .git directory must be removed from synced folder
		assert.equal(existsSync(path.join(targetDir, ".git")), false);

		// External files must remain untouched
		assert.equal(readFileSync(path.join(root, "outside.txt"), "utf8"), "root canary file");
		assert.equal(readFileSync(path.join(root, "examples", "outside-example.txt"), "utf8"), "examples directory canary");
		assert.equal(readFileSync(path.join(root, "examples", "byo", "README.md"), "utf8"), "byo directory canary");
	} finally {
		rmSync(upstream.repoDir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
		rmSync(config.cfgDir, { recursive: true, force: true });
	}
});

test("sync filters by template id argument and by --folder flag", () => {
	const upstreamVue = createUpstreamRepo({
		id: "vue",
		files: { "name.txt": "vue-content" },
		tag: "v1.0.0",
	});
	const upstreamNext = createUpstreamRepo({
		id: "next-app",
		files: { "name.txt": "next-content" },
		tag: "v1.0.0",
	});

	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
				{
					id: "next-app",
					folder: "create-next-app",
					repository: "flisk-sh/flisk-template-next-app",
					tag: "v1.0.0",
				},
			],
		},
	});

	const config = createGitConfig({
		"https://github.com/flisk-sh/flisk-template-vue.git": upstreamVue.repoDir,
		"https://github.com/flisk-sh/flisk-template-next-app.git": upstreamNext.repoDir,
	});

	try {
		// Sync only vue by id argument
		const resVue = runScript(root, ["vue"], { GIT_CONFIG_GLOBAL: config.cfgPath });
		assert.equal(resVue.status, 0, resVue.stderr);
		assert.equal(existsSync(path.join(root, "examples", "byo", "create-vue")), true);
		assert.equal(existsSync(path.join(root, "examples", "byo", "create-next-app")), false);

		// Sync only next-app by --folder flag
		const resNext = runScript(root, ["--folder", "create-next-app"], { GIT_CONFIG_GLOBAL: config.cfgPath });
		assert.equal(resNext.status, 0, resNext.stderr);
		assert.equal(existsSync(path.join(root, "examples", "byo", "create-next-app")), true);
	} finally {
		rmSync(upstreamVue.repoDir, { recursive: true, force: true });
		rmSync(upstreamNext.repoDir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
		rmSync(config.cfgDir, { recursive: true, force: true });
	}
});

test("sync exits 2 when no templates match the selector", () => {
	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
	});
	try {
		const res = runScript(root, ["non-existent-id"]);
		assert.equal(res.status, 2);
		assert.match(res.stderr, /no template matches: non-existent-id/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("sync fails if service.json template.id does not match registry id", () => {
	const upstream = createUpstreamRepo({
		id: "mismatched-id",
		tag: "v1.0.0",
	});

	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
	});

	const config = createGitConfig({
		"https://github.com/flisk-sh/flisk-template-vue.git": upstream.repoDir,
	});

	try {
		const res = runScript(root, [], { GIT_CONFIG_GLOBAL: config.cfgPath });
		assert.equal(res.status, 1);
		assert.match(res.stderr, /FAIL vue: flisk-sh\/flisk-template-vue at v1\.0\.0 has service\.json template\.id 'mismatched-id', expected 'vue'/);
		assert.equal(existsSync(path.join(root, "examples", "byo", "create-vue")), false);
	} finally {
		rmSync(upstream.repoDir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
		rmSync(config.cfgDir, { recursive: true, force: true });
	}
});

test("sync leaves existing destination untouched if clone fails", () => {
	const root = createFixtureWorkspace({
		registry: {
			templates: [
				{
					id: "vue",
					folder: "create-vue",
					repository: "flisk-sh/flisk-template-vue",
					tag: "v1.0.0",
				},
			],
		},
		outsideFiles: {
			"examples/byo/create-vue/existing.txt": "pre-existing content",
		},
	});

	const nonexistentDir = path.join(tmpdir(), `flisk-nonexistent-repo-${Date.now()}`);
	const config = createGitConfig({
		"https://github.com/flisk-sh/flisk-template-vue.git": nonexistentDir,
	});

	try {
		const res = runScript(root, [], { GIT_CONFIG_GLOBAL: config.cfgPath });
		assert.equal(res.status, 1);
		assert.match(res.stderr, /FAIL vue: could not clone flisk-sh\/flisk-template-vue at v1\.0\.0/);
		// Previous folder must be preserved intact
		const existingPath = path.join(root, "examples", "byo", "create-vue", "existing.txt");
		assert.equal(existsSync(existingPath), true);
		assert.equal(readFileSync(existingPath, "utf8"), "pre-existing content");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(config.cfgDir, { recursive: true, force: true });
	}
});
