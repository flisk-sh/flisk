// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Written by scripts/agent-plugin.mjs. Starts the Flisk CLI's own stdio server in the folder the agent started in.
// Needs Node 22.12+ and the Flisk CLI: npm install -g @flisk-sh/flisk. Reads no credential and uses no network.
import { spawn } from "node:child_process";

const options = { stdio: "inherit" };
// npm installs flisk.cmd on Windows; Node can start .cmd files only through a shell.
if (process.platform === "win32") options.shell = true;
const child = spawn("flisk", ["mcp"], options);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`flisk mcp could not start: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
