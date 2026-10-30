#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Starts `flisk mcp` (the Flisk CLI's own stdio MCP server) from the user's PATH, in the folder the agent was
// started in. Claude Code runs this file from ${CLAUDE_PLUGIN_ROOT}. It reads no credential and uses no network.
import { spawn } from "node:child_process";

const child = spawn("flisk", ["mcp"], { stdio: "inherit" });
child.on("error", (error) => {
  const why = error.code === "ENOENT" ? "the flisk command was not found" : error.message;
  console.error(`flisk mcp: ${why}. Install the Flisk CLI first: npm install -g @flisk-sh/flisk`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
