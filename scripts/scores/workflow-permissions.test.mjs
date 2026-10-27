// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the workflow-permissions scorer, on inline workflows and a small fixture repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { measure, parseWorkflow, permissionProblems } from "./workflow-permissions.mjs";

const problems = (text) => permissionProblems("w.yml", parseWorkflow(text));

test("parseWorkflow reads top-level keys and jobs with their lines", () => {
	const wf = parseWorkflow("name: x\npermissions:\n  contents: read\njobs:\n  a:\n    runs-on: ubuntu-latest\n  b:\n    uses: ./r.yml\n");
	assert.deepEqual(wf.keys.get("permissions").value, { contents: "read" });
	assert.equal(wf.keys.get("permissions").line, 2);
	assert.deepEqual(wf.jobs.map((j) => [j.id, j.line, [...j.keys.keys()]]), [
		["a", 5, ["runs-on"]],
		["b", 7, ["uses"]],
	]);
	assert.match(parseWorkflow("jobs: [\n").error, /./);
});

test("read-only, empty and job-level write permissions are fine", () => {
	assert.deepEqual(problems("permissions:\n  contents: read\njobs:\n  a:\n    permissions:\n      contents: write\n"), []);
	assert.deepEqual(problems("permissions: {}\njobs: {}\n"), []);
	assert.deepEqual(problems("permissions: read-all\njobs: {}\n"), []);
});

test("a missing top-level permissions and write-all anywhere are findings", () => {
	assert.deepEqual(problems("on: push\njobs:\n  a:\n    runs-on: x\n"), [
		"w.yml:1 no top-level permissions: (the token gets the repository default)",
	]);
	assert.deepEqual(problems("on: push\npermissions: write-all\njobs:\n  a:\n    permissions: write-all\n"), [
		"w.yml:2 top-level permissions: write-all",
		"w.yml:5 job a: permissions: write-all",
	]);
	assert.match(problems("jobs: [\n")[0], /^w\.yml:1 does not parse as YAML/);
});

test("measure reads .github/workflows only", () => {
	const root = mkdtempSync(path.join(tmpdir(), "workflow-permissions-"));
	try {
		for (const [rel, body] of Object.entries({
			".github/workflows/ok.yml": "permissions:\n  contents: read\njobs: {}\n",
			".github/workflows/bad.yaml": "jobs: {}\n",
			".github/workflows/notes.md": "jobs: {}\n",
			".github/actions/a/action.yml": "runs:\n  using: composite\n",
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 1);
		assert.deepEqual(r.findings, [".github/workflows/bad.yaml:1 no top-level permissions: (the token gets the repository default)"]);
		assert.equal(r.summary, "2 workflows, 1 without least-privilege token permissions");
	} finally {
		rmSync(root, { recursive: true });
	}
});
