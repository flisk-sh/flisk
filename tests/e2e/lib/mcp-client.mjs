// Copyright (c) 2026 Flisk contributors
// SPDX-License-Identifier: MIT
// Speaks newline-delimited JSON-RPC to `flisk mcp` over stdio.
//   node mcp-client.mjs [--cwd <dir>] <calls.json>
// <calls.json> is [{ "tool": "...", "arguments": {...} }, ...]. It runs initialize, notifications/initialized and tools/list,
// then each call in order, and prints { initialize, tools, calls: [{ result | error }] } as JSON. Every response has a bounded wait.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const argv = process.argv.slice(2);
let cwd = process.cwd();
if (argv[0] === "--cwd") {
  cwd = argv[1];
  argv.splice(0, 2);
}
const calls = JSON.parse(readFileSync(argv[0], "utf8"));
const RESPONSE_TIMEOUT_MS = 90_000;

const child = spawn(process.env.TDK_BIN ?? "flisk", ["mcp"], { cwd, stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let nextId = 1;
let exited = false;
child.on("exit", (code) => {
  exited = true;
  for (const { reject } of pending.values()) reject(new Error(`flisk mcp exited with code ${code}`));
});
createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.error(`non-JSON line on MCP stdout: ${line}`);
    process.exit(1);
  }
  const waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    waiter.resolve(message);
  }
});

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`no response to ${method} within ${RESPONSE_TIMEOUT_MS / 1000}s`));
    }, RESPONSE_TIMEOUT_MS);
    pending.set(id, {
      resolve: (m) => (clearTimeout(timer), resolve(m)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "agent-e2e", version: "0.0.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const list = await request("tools/list", {});
  const results = [];
  for (const call of calls) {
    const response = await request("tools/call", { name: call.tool, arguments: call.arguments ?? {} });
    results.push(response.error ? { error: response.error } : { result: response.result });
  }
  // The server must still be alive after the last call.
  if (exited) throw new Error("flisk mcp exited before the end of the session");
  console.log(JSON.stringify({ initialize: init.result, tools: list.result?.tools ?? [], calls: results }));
  child.kill();
} catch (error) {
  console.error(`MCP client failed: ${error.message}`);
  child.kill();
  process.exit(1);
}
