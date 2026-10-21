// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * A minimal Model Context Protocol server over newline-delimited JSON-RPC 2.0 (the stdio transport). It implements only
 * what a tools-only server needs: initialize, ping, tools/list and tools/call. Keeping it dependency-free keeps the
 * published CLI small; the protocol surface used here is stable across the listed protocol versions.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpToolResult {
  /** The JSON-serializable result; also returned as text for clients that ignore structured content. */
  data: unknown;
  isError: boolean;
}

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const;

function reply(id: JsonRpcRequest["id"], result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function fail(id: JsonRpcRequest["id"], code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export interface McpServer {
  /** Handle one line from the client; returns the line to send back, or null for notifications. */
  handleLine(line: string): Promise<string | null>;
}

export function createMcpServer(
  tools: McpTool[],
  info: { name: string; version: string },
): McpServer {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  async function handle(message: JsonRpcRequest): Promise<string | null> {
    const isNotification = message.id === undefined;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return isNotification ? null : fail(message.id, ERROR.invalidRequest, "Invalid request");
    }
    switch (message.method) {
      case "initialize": {
        const requested = String(message.params?.protocolVersion ?? "");
        const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(
          requested,
        )
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
        return reply(message.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: info,
        });
      }
      case "ping":
        return reply(message.id, {});
      case "tools/list":
        return reply(message.id, {
          tools: tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        });
      case "tools/call": {
        const name = message.params?.name;
        const tool = typeof name === "string" ? byName.get(name) : undefined;
        if (!tool) return fail(message.id, ERROR.invalidParams, `Unknown tool: ${String(name)}`);
        const args = message.params?.arguments;
        if (
          args !== undefined &&
          (typeof args !== "object" || args === null || Array.isArray(args))
        ) {
          return fail(message.id, ERROR.invalidParams, "arguments must be an object");
        }
        try {
          const result = await tool.handler((args ?? {}) as Record<string, unknown>);
          return reply(message.id, {
            content: [{ type: "text", text: JSON.stringify(result.data) }],
            structuredContent: result.data,
            isError: result.isError,
          });
        } catch (error) {
          // A tool failure is a tool result, not a protocol error, so the model can read and react to it.
          const text = error instanceof Error ? error.message : String(error);
          return reply(message.id, {
            content: [{ type: "text", text }],
            isError: true,
          });
        }
      }
      default:
        // Notifications such as notifications/initialized need no reply; unknown requests do.
        return isNotification
          ? null
          : fail(message.id, ERROR.methodNotFound, `Method not found: ${message.method}`);
    }
  }

  return {
    async handleLine(line) {
      if (!line.trim()) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return fail(null, ERROR.parse, "Parse error");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return fail(null, ERROR.invalidRequest, "Invalid request");
      }
      return handle(parsed as JsonRpcRequest);
    },
  };
}
