// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { measure, scan } from "./local-only.mjs";

test("scan finds Kubernetes kinds, apiVersions and kubectl apply in generator code", () => {
	const text = 'const m = `apiVersion: apps/v1\nkind: Deployment`;\nrun("kubectl apply -f x.yaml");\n';
	assert.deepEqual(
		scan("cli/src/generator/k8s.ts", text).map((h) => h.line),
		[1, 2, 3],
	);
});

test("scan reads Tilt cluster functions in Starlark code but not in docstrings or comments", () => {
	const text = '"""\nk8s_yaml("old.yaml")\n"""\n# helm("chart")\nk8s_resource("api")\ndocker_compose("x.yml")\n';
	assert.deepEqual(scan("runtime/engine/x.star", text), [{ line: 5, what: "k8s_resource(" }]);
	assert.deepEqual(scan("cli/src/x.ts", 'helm("chart")'), []);
});

test("measure skips tests and Markdown, honours ALLOWED and flags a stale entry", () => {
	const root = mkdtempSync(path.join(tmpdir(), "local-only-"));
	try {
		mkdirSync(path.join(root, "cli/src/__tests__"), { recursive: true });
		mkdirSync(path.join(root, "runtime/engine"), { recursive: true });
		writeFileSync(path.join(root, "cli/src/__tests__/k.test.ts"), "kind: Deployment\n");
		writeFileSync(path.join(root, "runtime/engine/AGENTS.md"), "- `k8s_resource()`\n");
		writeFileSync(path.join(root, "runtime/engine/deploy.star"), 'k8s_yaml("a.yaml")\n');
		assert.equal(measure({ root }, []).value, 1);
		const allowed = [
			{ file: "runtime/engine/deploy.star", reason: "agreed export" },
			{ file: "runtime/engine/gone.star", reason: "old" },
		];
		const { findings } = measure({ root }, allowed);
		assert.deepEqual(findings, ["runtime/engine/gone.star: ALLOWED entry no longer matches anything; remove it"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
