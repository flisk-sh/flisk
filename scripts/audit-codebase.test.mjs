// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/audit-codebase.sh. Run by `make test-shell`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, "audit-codebase.sh");

function findBash() {
	if (process.platform === "win32") {
		const isBash = (p) => {
			if (!p || !existsSync(p)) return false;
			const base = path.basename(p).toLowerCase();
			return base === "bash" || base === "bash.exe";
		};
		const candidates = [
			process.env.SHELL,
			"C:\\Program Files\\Git\\bin\\bash.exe",
			"C:\\Program Files\\Git\\usr\\bin\\bash.exe",
			process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Git", "bin", "bash.exe"),
			process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Git", "bin", "bash.exe"),
			process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe"),
		].filter(Boolean);
		for (const candidate of candidates) {
			if (isBash(candidate)) return candidate;
		}
	}
	return "bash";
}

function runAudit(cwd) {
	const bash = findBash();
	const stdout = execFileSync(bash, [SCRIPT_PATH], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, NO_COLOR: "1" },
	});
	const files = readdirSync(cwd);
	const reportName = files.find((name) => name.startsWith("codebase-audit-report-") && name.endsWith(".md"));
	const reportContent = reportName ? readFileSync(path.join(cwd, reportName), "utf8") : "";
	return { stdout, reportName, reportContent };
}

test("asserts report lists only the file with TODO when clean file is also present", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "audit-test-"));
	try {
		const cliDir = path.join(tempDir, "cli", "src");
		mkdirSync(cliDir, { recursive: true });
		writeFileSync(path.join(cliDir, "dirty.ts"), "// TODO: implement this feature\n");
		writeFileSync(path.join(cliDir, "clean.ts"), "export const greeting = 'hello';\n");

		const { stdout, reportName, reportContent } = runAudit(tempDir);

		assert.ok(reportName, "audit report markdown file must be generated");
		assert.match(reportContent, /cli\/src\/dirty\.ts/);
		assert.doesNotMatch(reportContent, /clean\.ts/);
		assert.match(reportContent, /- \*\*Total markers found:\*\* 1\b/);
		assert.match(reportContent, /- \*\*CLI \(User-facing\):\*\* 1\b/);
		assert.match(reportContent, /- \*\*Discovery:\*\* 0\b/);
		assert.match(reportContent, /- \*\*Engine:\*\* 0\b/);

		assert.match(stdout, /cli\/src\/dirty\.ts/);
		assert.doesNotMatch(stdout, /clean\.ts/);
		assert.match(stdout, /Total markers found: 1\b/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("reports zero findings in a clean workspace", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "audit-test-"));
	try {
		const cliDir = path.join(tempDir, "cli", "src");
		const discoveryDir = path.join(tempDir, "discovery");
		const engineDir = path.join(tempDir, "engine");
		mkdirSync(cliDir, { recursive: true });
		mkdirSync(discoveryDir, { recursive: true });
		mkdirSync(engineDir, { recursive: true });

		writeFileSync(path.join(cliDir, "clean.ts"), "export const ready = true;\n");
		writeFileSync(path.join(discoveryDir, "clean.py"), "def run():\n    pass\n");
		writeFileSync(path.join(engineDir, "clean.star"), "def main():\n    pass\n");

		const { stdout, reportName, reportContent } = runAudit(tempDir);

		assert.ok(reportName, "audit report markdown file must be generated");
		assert.match(reportContent, /- \*\*Total markers found:\*\* 0\b/);
		assert.match(reportContent, /- \*\*CLI \(User-facing\):\*\* 0\b/);
		assert.match(reportContent, /- \*\*Discovery:\*\* 0\b/);
		assert.match(reportContent, /- \*\*Engine:\*\* 0\b/);
		assert.match(reportContent, /No findings/);

		assert.match(stdout, /Total markers found: 0\b/);
		assert.match(stdout, /No technical debt markers found!/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("counts marker occurrences within a single file rather than only marked files", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "audit-test-"));
	try {
		const cliDir = path.join(tempDir, "cli", "src");
		mkdirSync(cliDir, { recursive: true });
		writeFileSync(path.join(cliDir, "multi.ts"), "// TODO: first task\nconst a = 1;\n// FIXME: second task\n");

		const { stdout, reportName, reportContent } = runAudit(tempDir);

		assert.ok(reportName, "audit report markdown file must be generated");
		assert.match(reportContent, /- \*\*Total markers found:\*\* 2\b/);
		assert.match(reportContent, /- \*\*CLI \(User-facing\):\*\* 2\b/);
		assert.match(stdout, /Total markers found: 2\b/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("categorizes markers across CLI, discovery, and engine", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "audit-test-"));
	try {
		const cliDir = path.join(tempDir, "cli", "src");
		const discoveryDir = path.join(tempDir, "discovery");
		const engineDir = path.join(tempDir, "engine");
		mkdirSync(cliDir, { recursive: true });
		mkdirSync(discoveryDir, { recursive: true });
		mkdirSync(engineDir, { recursive: true });

		writeFileSync(path.join(cliDir, "feature.tsx"), "// FIXME: fix alignment\n");
		writeFileSync(path.join(discoveryDir, "scanner.py"), "# BUG: handle edge case\n");
		writeFileSync(path.join(discoveryDir, "clean.py"), "x = 10\n");
		writeFileSync(path.join(engineDir, "pipeline.star"), "# HACK: workaround upstream\n");

		const { stdout, reportName, reportContent } = runAudit(tempDir);

		assert.ok(reportName, "audit report markdown file must be generated");
		assert.match(reportContent, /- \*\*Total markers found:\*\* 3\b/);
		assert.match(reportContent, /- \*\*CLI \(User-facing\):\*\* 1\b/);
		assert.match(reportContent, /- \*\*Discovery:\*\* 1\b/);
		assert.match(reportContent, /- \*\*Engine:\*\* 1\b/);

		assert.match(reportContent, /cli\/src\/feature\.tsx/);
		assert.match(reportContent, /discovery\/scanner\.py/);
		assert.match(reportContent, /engine\/pipeline\.star/);
		assert.doesNotMatch(reportContent, /clean\.py/);

		assert.match(stdout, /Total markers found: 3\b/);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
