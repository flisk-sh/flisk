// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The official MCP TypeScript SDK client: connect over streamable HTTP, list the tools, call echo. Prints one JSON line.
//   node client.mjs <mcp url>
// run.sh installs @modelcontextprotocol/sdk next to a copy of this file and runs it there.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "tdk-e2e-mcp", version: "0.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(process.argv[2])));
const { tools } = await client.listTools();
const result = await client.callTool({ name: "echo", arguments: { message: "hello from the MCP client" } });
console.log(JSON.stringify({ server: client.getServerVersion()?.name, tools: tools.map((t) => t.name), echo: result.content?.[0]?.text, isError: !!result.isError }));
await client.close();
