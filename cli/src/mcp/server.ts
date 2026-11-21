// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * A minimal Model Context Protocol server over newline-delimited JSON-RPC 2.0 (the stdio transport). It implements only
 * what a tools-only server needs: initialize, ping, tools/list and tools/call. Keeping it dependency-free keeps the
 * published CLI small; the protocol surface used here is stable across the listed protocol versions.
 */

/** Behavior hints a client shows or uses to decide whether to ask before calling a tool (MCP 2025-03-26 and later). */
export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  /** Former names that tools/call still accepts, so older agent configs keep working; tools/list shows only `name`. */
  aliases?: readonly string[];
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
  handler: (args: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpToolResult {
  /** The JSON-serializable result, sent once as structuredContent. */
  data: unknown;
  isError: boolean;
  /**
   * Optional short text for clients that ignore structuredContent. A tool with a large structured
   * result sets this to a human summary instead of sending the same JSON twice (#4205).
   */
  text?: string;
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

/** Names callers use for the same idea; `logs` takes `services` where other tools take `resource` or `name`. */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["resource", "resources", "service", "services", "name", "names", "app", "apps"],
];

/** Edit distance where swapping two adjacent letters ("tial" for "tail") counts as one edit. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        row[j] = j;
        continue;
      }
      let best = Math.min(
        (rows[i - 1]?.[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (rows[i - 1]?.[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      row[j] = best;
    }
    rows.push(row);
  }
  return rows[a.length]?.[b.length] ?? 0;
}

/** The accepted argument name closest to an unknown one, or undefined when none is close. */
export function closestArgument(unknown: string, accepted: readonly string[]): string | undefined {
  const lower = unknown.toLowerCase();
  const group = SYNONYM_GROUPS.find((names) => names.includes(lower));
  const synonym = group ? accepted.find((name) => group.includes(name.toLowerCase())) : undefined;
  if (synonym) return synonym;
  let best: { name: string; distance: number } | undefined;
  for (const name of accepted) {
    const distance = editDistance(lower, name.toLowerCase());
    if (
      distance <= Math.max(1, Math.floor(name.length / 3)) &&
      (!best || distance < best.distance)
    ) {
      best = { name, distance };
    }
  }
  return best?.name;
}

/**
 * Check the arguments against the tool's published schema: when it declares `additionalProperties: false`, an argument it
 * does not list is refused with the accepted names and the closest match. Returns the message, or undefined when all fit.
 */
export function unknownArgumentsMessage(
  inputSchema: Record<string, unknown>,
  args: Record<string, unknown>,
): string | undefined {
  if (inputSchema.additionalProperties !== false) return undefined;
  const properties = inputSchema.properties;
  if (typeof properties !== "object" || properties === null) return undefined;
  const accepted = Object.keys(properties);
  const unknown = Object.keys(args).filter((key) => !accepted.includes(key));
  if (unknown.length === 0) return undefined;
  const lines = [
    `Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. The call was not run.`,
    `Accepted arguments: ${accepted.length > 0 ? accepted.join(", ") : "(none)"}.`,
  ];
  for (const key of unknown) {
    const match = closestArgument(key, accepted);
    if (match) lines.push(`Did you mean "${match}" instead of "${key}"?`);
  }
  return lines.join("\n");
}

export interface McpServer {
  /** Handle one line from the client; returns the line to send back, or null for notifications. */
  handleLine(line: string): Promise<string | null>;
}

/** An icon a client may show next to the server (MCP Implementation.icons). */
export interface McpIcon {
  src: string;
  mimeType?: string;
  sizes?: string[];
}

/** Which tools a server exposes: a tool the policy refuses is neither listed nor run, and tools/call explains why. */
export interface McpToolPolicy {
  isAllowed: (tool: McpTool) => boolean;
  refusal: (tool: McpTool) => string;
}

export function createMcpServer(
  allTools: McpTool[],
  info: { name: string; version: string; icons?: McpIcon[] },
  policy?: McpToolPolicy | null,
): McpServer {
  const tools = policy ? allTools.filter((tool) => policy.isAllowed(tool)) : allTools;
  const byName = new Map<string, McpTool>();
  // A refused tool stays resolvable (by name and alias) so tools/call can refuse it clearly instead of "Unknown tool".
  const refused = new Map<string, McpTool>();
  for (const tool of allTools) {
    if (tools.includes(tool)) continue;
    for (const alias of tool.aliases ?? []) refused.set(alias, tool);
    refused.set(tool.name, tool);
  }
  // Aliases first, so a tool's own name always wins over another tool's former name.
  for (const tool of tools) for (const alias of tool.aliases ?? []) byName.set(alias, tool);
  for (const tool of tools) byName.set(tool.name, tool);

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
          tools: tools.map(({ name, description, inputSchema, annotations }) => ({
            name,
            description,
            inputSchema,
            ...(annotations ? { annotations } : {}),
          })),
        });
      case "tools/call": {
        const name = message.params?.name;
        const tool = typeof name === "string" ? byName.get(name) : undefined;
        const blocked = typeof name === "string" && !tool ? refused.get(name) : undefined;
        if (blocked && policy) {
          const text = policy.refusal(blocked);
          return reply(message.id, { content: [{ type: "text", text }], isError: true });
        }
        if (!tool) return fail(message.id, ERROR.invalidParams, `Unknown tool: ${String(name)}`);
        const args = message.params?.arguments;
        if (
          args !== undefined &&
          (typeof args !== "object" || args === null || Array.isArray(args))
        ) {
          return fail(message.id, ERROR.invalidParams, "arguments must be an object");
        }
        const unknownMessage = unknownArgumentsMessage(
          tool.inputSchema,
          (args ?? {}) as Record<string, unknown>,
        );
        if (unknownMessage) {
          return reply(message.id, {
            content: [{ type: "text", text: unknownMessage }],
            isError: true,
          });
        }
        try {
          const result = await tool.handler((args ?? {}) as Record<string, unknown>);
          return reply(message.id, {
            content: [{ type: "text", text: result.text ?? JSON.stringify(result.data) }],
            structuredContent: result.data,
            isError: result.isError,
          });
        } catch (error) {
          // A tool failure is a tool result, not a protocol error, so the model can read and react to it.
          const text = error instanceof Error ? error.message : String(error);
          // A FliskError carries what to try next; read it by shape so this module stays dependency-free.
          const suggestions = (error as { suggestions?: unknown } | null)?.suggestions;
          const hints = Array.isArray(suggestions)
            ? suggestions.filter((s): s is string => typeof s === "string")
            : [];
          return reply(message.id, {
            content: [
              {
                type: "text",
                text: hints.length > 0 ? `${text}\n${hints.map((s) => `- ${s}`).join("\n")}` : text,
              },
            ],
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
