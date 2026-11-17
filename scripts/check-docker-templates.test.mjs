// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkDockerTemplates } from "./check-docker-templates.mjs";

const DIRECTORIES = [
	"runtime/shared-platform-engineering/docker-templates",
	"cli/shared-platform-engineering/docker-templates",
];
const SCRIPT = "#!/usr/bin/env bash\nprintf 'ok\\n'\n";

function fixture(t) {
	const root = mkdtempSync(path.join(tmpdir(), "flisk-docker-templates-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const directory of DIRECTORIES) {
		mkdirSync(path.join(root, directory), { recursive: true });
		writeFileSync(path.join(root, directory, "install-deps.sh"), SCRIPT);
		writeFileSync(path.join(root, directory, "infisical-entrypoint.sh"), SCRIPT);
	}
	return root;
}

test("matching LF templates pass", (t) => {
	assert.deepEqual(checkDockerTemplates(fixture(t)), []);
});

for (const directory of DIRECTORIES) {
	test(`a missing file in ${directory} fails with its path`, (t) => {
		const root = fixture(t);
		rmSync(path.join(root, directory, "install-deps.sh"));
		assert.deepEqual(checkDockerTemplates(root), [
			`${path.join(directory, "install-deps.sh")}: missing template`,
		]);
	});

	test(`an extra file in ${directory} fails`, (t) => {
		const root = fixture(t);
		writeFileSync(path.join(root, directory, "extra.sh"), SCRIPT);
		assert.match(checkDockerTemplates(root).join("\n"), /extra\.sh: missing template/);
	});

	test(`CR in a shebang in ${directory} fails`, (t) => {
		const root = fixture(t);
		writeFileSync(path.join(root, directory, "install-deps.sh"), SCRIPT.replace("\n", "\r\n"));
		assert.ok(checkDockerTemplates(root).includes(
			`${path.join(directory, "install-deps.sh")}: carriage return in shebang; use LF line endings`,
		));
	});

	test(`a missing ${directory} directory fails`, (t) => {
		const root = fixture(t);
		rmSync(path.join(root, directory), { recursive: true });
		assert.ok(checkDockerTemplates(root).some((problem) => problem.includes("cannot read templates (ENOENT)")));
	});
}

test("different contents fail even when file names match", (t) => {
	const root = fixture(t);
	writeFileSync(path.join(root, DIRECTORIES[1], "install-deps.sh"), SCRIPT + "echo changed\n");
	assert.deepEqual(checkDockerTemplates(root), [
		`install-deps.sh: contents differ between ${DIRECTORIES.join(" and ")}`,
	]);
});

test("identical CRLF copies still fail the shebang check", (t) => {
	const root = fixture(t);
	for (const directory of DIRECTORIES) {
		writeFileSync(path.join(root, directory, "install-deps.sh"), SCRIPT.replaceAll("\n", "\r\n"));
	}
	const problems = checkDockerTemplates(root);
	assert.equal(problems.length, 2);
	assert.ok(problems.every((problem) => problem.includes("carriage return in shebang")));
});

test("nested templates are compared too", (t) => {
	const root = fixture(t);
	for (const directory of DIRECTORIES) {
		mkdirSync(path.join(root, directory, "nested"));
		writeFileSync(path.join(root, directory, "nested", "helper.sh"), SCRIPT);
	}
	assert.deepEqual(checkDockerTemplates(root), []);
	writeFileSync(path.join(root, DIRECTORIES[0], "nested", "helper.sh"), SCRIPT + "echo changed\n");
	assert.ok(checkDockerTemplates(root).some((problem) => problem.includes("contents differ")));
});

test("the committed Docker template directories pass", () => {
	assert.deepEqual(checkDockerTemplates(), []);
});

function runShellGate(root) {
	mkdirSync(path.join(root, "scripts"));
	for (const name of ["check-shell.sh", "check-docker-templates.mjs"]) {
		copyFileSync(new URL(name, import.meta.url), path.join(root, "scripts", name));
	}
	for (const file of ["tests/e2e/lib/lib.sh", "tests/e2e/resource-types/common.sh"]) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), "#!/usr/bin/env bash\n");
	}
	return spawnSync("bash", ["scripts/check-shell.sh"], { cwd: root, encoding: "utf8", timeout: 10_000 });
}

test("the shell gate accepts matching LF templates", (t) => {
	const result = runShellGate(fixture(t));
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
});

for (const scenario of ["changed", "missing", "CRLF"]) {
	test(`the shell gate rejects ${scenario} templates`, (t) => {
		const root = fixture(t);
		if (scenario === "changed") {
			writeFileSync(path.join(root, DIRECTORIES[0], "install-deps.sh"), SCRIPT + "echo changed\n");
		} else if (scenario === "missing") {
			rmSync(path.join(root, DIRECTORIES[1], "install-deps.sh"));
		} else {
			for (const directory of DIRECTORIES) {
				writeFileSync(path.join(root, directory, "install-deps.sh"), SCRIPT.replaceAll("\n", "\r\n"));
			}
		}
		const result = runShellGate(root);
		assert.ifError(result.error);
		assert.equal(result.status, 1, result.stdout + result.stderr);
		assert.match(result.stderr, /check-docker-templates:/);
	});
}

test("the checker finds the repository independently of the caller's directory", (t) => {
	const result = spawnSync(process.execPath, [fileURLToPath(new URL("check-docker-templates.mjs", import.meta.url))], {
		cwd: fixture(t), encoding: "utf8", timeout: 10_000,
	});
	assert.ifError(result.error);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /check-docker-templates: both copies match/);
});
