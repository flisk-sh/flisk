// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createInterface } from "node:readline";
import { Command } from "commander";
import { createMcpServer } from "../mcp/server.js";
import { createTdkTools } from "../mcp/tools.js";
import { getPackageVersion } from "../utils/paths.js";
export const mcpCommand = new Command("mcp")
    .description("Run a Model Context Protocol server over stdio for coding agents")
    .action(async () => {
    const server = createMcpServer(createTdkTools(), {
        name: "flisk",
        version: getPackageVersion(),
    });
    // Stdout is the protocol channel. Nothing else may write to it; diagnostics go to stderr.
    const lines = createInterface({ input: process.stdin });
    const pending = new Set();
    lines.on("line", (line) => {
        const task = server.handleLine(line).then((response) => {
            if (response)
                process.stdout.write(`${response}\n`);
        });
        pending.add(task);
        void task.finally(() => pending.delete(task));
    });
    await new Promise((resolve) => lines.once("close", resolve));
    await Promise.allSettled(pending);
});
