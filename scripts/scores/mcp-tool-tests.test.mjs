// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the mcp-tool-tests scorer, on inline test sources and a small fixture repository.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { lineNames, measure, namedIn } from "./mcp-tool-tests.mjs";

const TOOLS = `
export function createFliskTools(): McpTool[] {
  return [
    {
      name: "status",
      handler: (args) => readStatus(args),
    },
    {
      name: "resource_list",
      handler: viaCli(() => ["resources", "--json"]),
    },
    {
      name: "config_verify",
      handler: viaCli(() => ["config", "verify", "--json"]),
    },
    {
      name: "up",
      handler: viaCli(() => ["up", "--json"]),
    },
  ];
}
`;

test("lineNames takes a quoted name or a bare snake_case word, not a part of a longer name or a list entry", () => {
	assert.equal(lineNames('await call("stack_list", {});', "stack_list", { bare: true }), true);
	assert.equal(lineNames("t.name === 'up'", "up", { bare: false }), true);
	assert.equal(lineNames("mcp_call resource_list --stack shop", "resource_list", { bare: true }), true);
	assert.equal(lineNames("mcp_call resource_list_all", "resource_list", { bare: true }), false);
	assert.equal(lineNames('call("upgrade")', "up", { bare: false }), false);
	assert.equal(lineNames("const up = 1;", "up", { bare: false }), false);
	assert.equal(lineNames('      "stack_list",', "stack_list", { bare: true }), false);
	assert.equal(lineNames("  'up'", "up", { bare: false }), false);
});

test("one-word names count only in a test about MCP; snake_case names count in any test", () => {
	const names = ["status", "resource_list"];
	const cliTest = 'run(["status", "--json"]);\nexpect(call("resource_list")).toBeTruthy();\n';
	assert.deepEqual(namedIn("cli/src/commands/__tests__/status.test.ts", cliTest, names), ["resource_list"]);
	assert.deepEqual(namedIn("cli/src/mcp/__tests__/tools.test.ts", cliTest, names), names);
	assert.deepEqual(namedIn("tests/e2e/x/run.sh", 'send tools/call \'{"name":"status"}\'\n', names), ["status"]);
});

test("measure: the share of tools a test names, a finding with the tool's line for each other one", () => {
	const root = mkdtempSync(path.join(tmpdir(), "mcp-tool-tests-"));
	try {
		for (const [rel, body] of Object.entries({
			"cli/src/mcp/tools.ts": TOOLS,
			"cli/src/mcp/__tests__/tools.test.ts": 'expect(names).toEqual([\n  "status",\n  "config_verify",\n]);\nawait call("status");\n',
			"cli/src/mcp/helpers.ts": 'call("up");\n',
			"tests/e2e/mcp/run.sh": "mcp_call resource_list\n",
			"tests/e2e/mcp/package-lock.json": '{ "config_verify": 1 }\n',
		})) {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), body);
		}
		const r = measure({ root });
		assert.equal(r.value, 50);
		assert.equal(r.summary, "2 of 4 MCP tools named by a test");
		assert.deepEqual(r.findings, [
			"cli/src/mcp/tools.ts:13 config_verify: no test under cli/src or tests/ calls this tool",
			"cli/src/mcp/tools.ts:17 up: no test under cli/src or tests/ calls this tool",
		]);
	} finally {
		rmSync(root, { recursive: true });
	}
});

test("a missing tools file is an error, not a silent pass", () => {
	const root = mkdtempSync(path.join(tmpdir(), "mcp-tool-tests-"));
	try {
		assert.throws(() => measure({ root }), /is missing/);
	} finally {
		rmSync(root, { recursive: true });
	}
});
