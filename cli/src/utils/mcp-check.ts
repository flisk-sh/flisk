// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// `flisk mcp check`: a read-only protocol check of a Streamable HTTP MCP server, local or remote. It sends only
// initialize, list and get requests, plus four malformed requests to see how they are refused. It calls tools only when
// asked to, because a tool call can reach the network or change something on the server's side.

export {
  buildPromptArguments,
  buildSampleArguments,
  iconUrlFor,
  parseRpcBody,
  sampleValue,
} from "./mcp-check/protocol.js";
export { runMcpCheck } from "./mcp-check/run.js";
export { isFinalNetworkError } from "./mcp-check/taxonomy.js";
export type { McpCheckOptions, McpCheckReport, McpCheckResult } from "./mcp-check/types.js";
