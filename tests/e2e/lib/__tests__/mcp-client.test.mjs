// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../mcp-client.mjs", import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), "mcp-client-"));

// A fake `flisk` whose `mcp` subcommand answers JSON-RPC lines: initialize, tools/list, and tools/call echoing the arguments.
const fakeTdk = path.join(dir, "flisk");
writeFileSync(
  fakeTdk,
  `#!/usr/bin/env node
const rl = require("node:readline").createInterface({ input: process.stdin });
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
rl.on("line", (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize") reply(m.id, { protocolVersion: m.params.protocolVersion, cwd: process.cwd() });
  else if (m.method === "tools/list") reply(m.id, { tools: [{ name: "echo" }] });
  else if (m.method === "tools/call" && m.params.name === "crash") process.exit(3);
  else if (m.method === "tools/call") reply(m.id, { isError: false, structuredContent: m.params.arguments });
});
`,
);
chmodSync(fakeTdk, 0o755);

const run = (calls, extra = []) => {
  const callsFile = path.join(dir, `calls-${Math.random()}.json`);
  writeFileSync(callsFile, JSON.stringify(calls));
  return spawnSync(process.execPath, [client, ...extra, callsFile], { encoding: "utf8", env: { ...process.env, TDK_BIN: fakeTdk } });
};

test("runs initialize, tools/list and each call in order", () => {
  const res = run([{ tool: "echo", arguments: { a: 1 } }, { tool: "echo" }]);
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.initialize.protocolVersion, "2025-06-18");
  assert.deepEqual(out.tools, [{ name: "echo" }]);
  assert.deepEqual(
    out.calls.map((c) => c.result.structuredContent),
    [{ a: 1 }, {}],
  );
});

test("--cwd starts the server in that directory", () => {
  const res = run([], ["--cwd", dir]);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(realpathSync(JSON.parse(res.stdout).initialize.cwd), realpathSync(dir));
});

test("fails when the server exits before answering", () => {
  const res = run([{ tool: "crash" }]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /flisk mcp exited with code 3/);
});
