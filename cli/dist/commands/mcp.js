// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createInterface } from "node:readline";
import { Command } from "commander";
import { resolveToolPolicy } from "../mcp/policy.js";
import { createMcpServer } from "../mcp/server.js";
import { createFliskTools } from "../mcp/tools.js";
import { getPackageVersion } from "../utils/paths.js";
import { createMcpCheckCommand } from "./mcp-check.js";
export const mcpCommand = new Command("mcp")
    .description("Run a Model Context Protocol server over stdio for coding agents")
    // `flisk mcp` with no subcommand is still the stdio server; `flisk mcp check` is the only subcommand.
    .addCommand(createMcpCheckCommand())
    .option("--read-only", "List and allow only the tools that change nothing (env FLISK_MCP_READ_ONLY=1)")
    .option("--tools <names>", "List and allow only these comma-separated tools (env FLISK_MCP_TOOLS)")
    .option("--profile <name>", "List and allow only a named tool subset: minimal = status, up, logs (env FLISK_MCP_PROFILE)")
    .addHelpText("after", [
    "",
    "The server reads JSON-RPC on stdin and waits for a client, so it prints nothing in a terminal.",
    "Add it to an MCP client instead:",
    '  { "command": "flisk", "args": ["mcp"] }',
    "",
    "Examples:",
    "  flisk mcp                # started by an MCP client",
    "  flisk mcp --read-only    # for a reviewer or CI agent: doctor, status, logs and the other read tools only",
    "  flisk mcp --profile minimal  # publish only status, up and logs",
    "  flisk mcp --tools status,logs,doctor",
    "  flisk mcp check tools    # check the MCP resource named tools",
].join("\n"))
    .action(async (options) => {
    const tools = createFliskTools();
    const server = createMcpServer(tools, {
        name: "flisk",
        version: getPackageVersion(),
        icons: [
            { src: "https://mcp.flisk.sh/icon-512.png", mimeType: "image/png", sizes: ["512x512"] },
        ],
    }, resolveToolPolicy(tools, options));
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
