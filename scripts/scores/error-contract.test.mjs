// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the error-contract scorer, on fixture repos that link the real typescript package into cli/node_modules.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadTypeScript, measure, throwsIn, tokenize } from "./error-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(files, { typescript = true } = {}) {
	const root = mkdtempSync(path.join(tmpdir(), "error-contract-"));
	for (const [rel, body] of Object.entries({ "cli/package.json": "{}", ...files })) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	if (typescript) {
		mkdirSync(path.join(root, "cli/node_modules"), { recursive: true });
		const real = realpathSync(path.join(repoRoot, "cli/node_modules/typescript"));
		symlinkSync(real, path.join(root, "cli/node_modules/typescript"), "dir");
	}
	return root;
}

const SOURCE = `import { FliskError } from "./utils/errors.js";

export function check(x: string, n: number): void {
  if (!x) throw new FliskError("missing", ["Pass a name"]);
  if (x === "1") throw new FliskError("empty", []);
  if (x === "2") throw new FliskError("no suggestions");
  if (x === "3") throw new FliskError(\`bad \${x}, really\`, undefined, 2);
  if (x === "4") throw new Error("plain");
  const quote = /"/; if (x === "5") throw new Error("after a regex holding a quote");
  const hash = \`#\${x}#\`;
  const half = n / 2 / 1;
  const label = \`\${x}-\${half}\`;
  if (x === "6") throw new FliskError(format(x, ["a", "b"]), [\`Try \${label}\`]);
  const s = "throw new Error('in a string')";
  // throw new Error("in a comment")
  if (x === "7") throw new EnvError("CODE", "msg", ["Fix the env file"]);
  if (x === "8") throw new EnvError("CODE", "msg");
  if (x === "9") throw new errors.FliskError("dotted", ["still a FliskError"]);
  if (x === "10") throw new StrictEnvError("CODE", "msg", ["inherits the constructor"]);
  if (x === "11") throw new FliskError(format(x, []));
}

class EnvError extends FliskError {
  constructor(readonly code: string, message: string, suggestions: string[] = []) {
    super(message, suggestions);
  }
}

class StrictEnvError extends EnvError {}
`;

test("FliskError with suggestions counts, an empty or missing suggestions argument and other errors do not", async () => {
	const root = fixture({
		"cli/src/check.ts": SOURCE,
		"cli/src/view.tsx": 'export const View = () => <p>Don\'t</p>;\nexport function v() {\n  throw new Error("tsx");\n}\n',
		"cli/src/check.test.ts": 'throw new Error("a test");\n',
		"cli/src/__tests__/helper.ts": 'throw new Error("a test helper");\n',
		"cli/src/test-support/doubles.ts": 'throw new Error("a test double");\n',
	});
	try {
		const result = await measure({ root });
		assert.deepEqual(result.findings, [
			"cli/src/check.ts:5 throw new FliskError without suggestions",
			"cli/src/check.ts:6 throw new FliskError without suggestions",
			"cli/src/check.ts:7 throw new FliskError without suggestions",
			"cli/src/check.ts:8 throw new Error",
			"cli/src/check.ts:9 throw new Error",
			"cli/src/check.ts:17 throw new EnvError without suggestions",
			"cli/src/check.ts:20 throw new FliskError without suggestions",
			"cli/src/view.tsx:3 throw new Error",
		]);
		assert.equal(result.summary, "5 of 13 throws are FliskError with a suggestion");
		assert.equal(result.value, 38.5);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a lone # does not stall the scanner", async () => {
	const ts = await loadTypeScript(repoRoot);
	const thrown = throwsIn(ts, tokenize(ts, 'a # b; throw new Error("after the hash");'));
	assert.deepEqual(
		thrown.map((t) => t.callee),
		["Error"],
	);
});

test("a missing TypeScript scanner is an error; no throw at all is no data", async () => {
	const noTs = fixture({ "cli/src/a.ts": 'throw new Error("x");\n' }, { typescript: false });
	const noThrow = fixture({ "cli/src/a.ts": "export const a = 1;\n" });
	try {
		await assert.rejects(async () => measure({ root: noTs }), /TypeScript scanner did not load/);
		assert.equal((await measure({ root: noThrow })).value, null);
	} finally {
		rmSync(noTs, { recursive: true });
		rmSync(noThrow, { recursive: true });
	}
});

test("this repository: a stable percentage", async () => {
	const first = await measure({ root: repoRoot });
	assert.ok(first.value > 0 && first.value <= 100);
	assert.deepEqual(await measure({ root: repoRoot }), first);
});
