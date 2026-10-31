// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// A local Streamable HTTP MCP server for tests of `flisk mcp check`. It listens on a port the OS picks and can be told to
// break one rule at a time, so a test can see each check fail for its own reason.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeMcpServerOptions {
  /** Path of the MCP endpoint. Default /mcp. */
  endpoint?: string;
  /** Answer JSON-RPC in event-stream framing instead of plain JSON. */
  isEventStream?: boolean;
  /** readOnlyHint on every tool. Default true. */
  isReadOnly?: boolean;
  /** Declare and serve one prompt. Default true. */
  hasPrompts?: boolean;
  /** Status for GET on the endpoint. Default 405. */
  getStatus?: number;
  /** Status for a body that is not JSON. Default 400. */
  badJsonStatus?: number;
  /** Answer 406 to a client that accepts only application/json. */
  isJsonOnlyRejected?: boolean;
  /** Serve a real PNG at icon-512.png beside the endpoint. Default true. */
  hasIcon?: boolean;
  /** Reset the connection of this many requests before answering normally, to exercise the retries. */
  dropFirstRequests?: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  userAgent: string;
  accept: string;
  /** The JSON-RPC method, for POSTs with a JSON body. */
  rpcMethod?: string;
  params?: Record<string, unknown>;
}

export interface FakeMcpServer {
  /** The full endpoint URL, such as http://127.0.0.1:<port>/mcp. */
  url: string;
  /** The URL of any path on the server. */
  urlFor: (path: string) => string;
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

// The smallest valid PNG: the signature, one IHDR chunk and IEND. Only the signature is checked.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000049454e44ae426082",
  "hex",
);

const TOOLS = (isReadOnly: boolean) => [
  {
    name: "lookup",
    description: "Look something up",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 3 },
        optional: { type: "string" },
      },
      required: ["query", "limit"],
    },
    annotations: { readOnlyHint: isReadOnly },
  },
  {
    name: "ping",
    description: "Answer pong",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startFakeMcpServer(
  options: FakeMcpServerOptions = {},
): Promise<FakeMcpServer> {
  const endpoint = options.endpoint ?? "/mcp";
  const iconPath = `${endpoint.slice(0, endpoint.lastIndexOf("/") + 1)}icon-512.png`;
  const hasPrompts = options.hasPrompts ?? true;
  const requests: RecordedRequest[] = [];
  let toDrop = options.dropFirstRequests ?? 0;

  const send = (res: ServerResponse, status: number, message: unknown): void => {
    if (options.isEventStream) {
      res.writeHead(status, { "content-type": "text/event-stream" });
      res.end(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      return;
    }
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(message));
  };

  const answer = (method: string, params: Record<string, unknown>): Record<string, unknown> => {
    if (method === "initialize") {
      return {
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {}, ...(hasPrompts ? { prompts: {} } : {}) },
          serverInfo: { name: "fake-mcp", version: "1.0.0" },
        },
      };
    }
    if (method === "tools/list") return { result: { tools: TOOLS(options.isReadOnly ?? true) } };
    if (method === "tools/call") {
      return { result: { content: [{ type: "text", text: `called ${String(params.name)}` }] } };
    }
    if (method === "prompts/list") {
      return hasPrompts
        ? {
            result: {
              prompts: [{ name: "explain", arguments: [{ name: "topic", required: true }] }],
            },
          }
        : { error: { code: -32601, message: "Method not found" } };
    }
    if (method === "prompts/get") {
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (!args.topic) return { error: { code: -32602, message: "topic is required" } };
      return {
        result: {
          messages: [
            { role: "user", content: { type: "text", text: `Explain ${String(args.topic)}` } },
          ],
        },
      };
    }
    return { error: { code: -32601, message: "Method not found" } };
  };

  const server = createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    const body = await readBody(req);
    const record: RecordedRequest = {
      method: req.method ?? "",
      path,
      userAgent: String(req.headers["user-agent"] ?? ""),
      accept: String(req.headers.accept ?? ""),
    };
    requests.push(record);
    if (toDrop > 0) {
      toDrop -= 1;
      req.socket.destroy();
      return;
    }
    if (path === iconPath && req.method === "GET") {
      if (options.hasIcon === false) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end('{"error":"not_found"}');
        return;
      }
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
      return;
    }
    if (path !== endpoint) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end('{"error":"not_found"}');
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(options.getStatus ?? 405, { allow: "POST" });
      res.end();
      return;
    }
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(body) as Record<string, unknown>;
    } catch {
      send(res, options.badJsonStatus ?? 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }
    record.rpcMethod = String(message.method);
    record.params = (message.params ?? {}) as Record<string, unknown>;
    if (options.isJsonOnlyRejected && !record.accept.includes("text/event-stream")) {
      res.writeHead(406);
      res.end();
      return;
    }
    if (message.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }
    send(res, 200, { jsonrpc: "2.0", id: message.id, ...answer(record.rpcMethod, record.params) });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const urlFor = (path: string): string => new URL(path, `http://127.0.0.1:${port}`).toString();
  return {
    url: urlFor(endpoint),
    urlFor,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
