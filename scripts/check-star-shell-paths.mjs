#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Lists the .sh paths that Starlark local_resource() commands invoke and rejects direct execution on native Windows.
// POSIX commands must use `bash <script>`; a resource that still uses a bare ./script.sh needs an explicit Windows
// override (cmd_bat/serve_cmd_bat), or a platform helper that returns a different command when os.name == "nt".
//   node scripts/check-star-shell-paths.mjs [--root <repo dir>]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..");

const SH_PATH = /(?:\.{1,2}\/)?(?:[\w.-]+\/)*[\w.-]+\.sh\b/g;
// A local_resource call ends at the first line that contains only its closing paren.
const RESOURCE = /local_resource\(([\s\S]*?)(?:\r?\n[ \t]*\))/g;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "dist-bundle", "coverage"]);

function* starFiles(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) yield* starFiles(path.join(dir, entry.name));
			continue;
		}
		if (entry.name.endsWith(".star")) yield path.join(dir, entry.name);
	}
}

// The command of a maintenance resource is built by maintenance_command(name, posix, reason, IS_NATIVE_WINDOWS, ...).
const HAS_PLATFORM_HELPER = (block) =>
	/\bmaintenance_command\s*\(/.test(block) && /\bIS_NATIVE_WINDOWS\b/.test(block);
const HAS_WINDOWS_OVERRIDE = (block) => /\b(cmd_bat|serve_cmd_bat)\s*=/.test(block);
const WINDOWS_OVERRIDE = /\b(cmd_bat|serve_cmd_bat)\s*=\s*([\s\S]*)$/;

export function checkStarShellPaths(root = REPO_ROOT) {
	const runtimeDir = path.join(root, "runtime");
	const files = [...starFiles(runtimeDir)];
	const paths = new Set();
	const problems = [];

	for (const file of files) {
		const text = readFileSync(file, "utf8");
		const rel = path.relative(root, file).replace(/\\/g, "/");
		for (const match of text.matchAll(RESOURCE)) {
			const block = match[1];
			const scripts = [...block.matchAll(SH_PATH)];
			if (scripts.length === 0) continue;

			const hasOverride = HAS_WINDOWS_OVERRIDE(block);
			const windowsCommand = block.match(WINDOWS_OVERRIDE)?.[2] ?? "";
			const windowsScripts = [...windowsCommand.matchAll(SH_PATH)].map((s) => s[0]);
			if (windowsScripts.length) {
				problems.push(
					`${rel}: Windows override executes ${windowsScripts.join(", ")} directly; use a PowerShell twin`,
				);
			}
			if (!hasOverride && !HAS_PLATFORM_HELPER(block)) {
				problems.push(
					`${rel}: local_resource invoking ${scripts.map((s) => s[0]).join(", ")} has no Windows branch`,
				);
			}
			for (const script of scripts) {
				paths.add(script[0]);
				const before = block.slice(0, script.index);
				if (hasOverride || /\b(?:bash|sh)\s+$/.test(before)) continue;
				problems.push(
					`${rel}: ${script[0]} is executed directly; use bash <script> or a Windows override`,
				);
			}
		}
	}
	return { files: files.length, paths: [...paths].sort(), problems };
}

export function formatReport(result) {
	const lines = [
		`check-star-shell-paths: ${result.files} Starlark files, ${result.paths.length} shell scripts referenced`,
		...result.paths.map((p) => `  ${p}`),
	];
	if (result.problems.length) {
		lines.push(...result.problems.map((p) => `FAIL: ${p}`));
	} else {
		lines.push("PASS: no shell script is executed directly by a Windows local_resource");
	}
	return lines.join("\n");
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const rootArg = process.argv.indexOf("--root");
	const root = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : REPO_ROOT;
	const result = checkStarShellPaths(root);
	console.log(formatReport(result));
	if (result.problems.length) process.exitCode = 1;
}
