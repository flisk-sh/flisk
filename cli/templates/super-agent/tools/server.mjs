// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The tool server: an MCP server over HTTP (JSON-RPC at POST /mcp) with three read-only tools the sub-agents call.
// Add a tool to `tools`; `flisk mcp check tools --call` calls each one once.
import { createServer } from "node:http";

// A tiny offline knowledge base, so the starter works without the network. Replace `lookup` with a real search.
const notes = {
  flisk:
    "Flisk runs a local development loop: services that declare a command run as local processes, with no Docker.",
  mcp: "MCP (Model Context Protocol) lets an agent call tools a server lists, over JSON-RPC.",
  agents:
    "A multi-agent system splits work: a planner plans, workers do steps, a checker reviews the answer.",
  retries:
    "A step whose worker dies loses its claim after a deadline and goes back in the queue for another attempt.",
};

const tools = {
  lookup: {
    description: "Find a short note about a topic in the built-in knowledge base.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What to look up", examples: ["flisk"] },
      },
      required: ["topic"],
    },
    run: ({ topic }) => {
      const words = String(topic ?? "")
        .toLowerCase()
        .split(/\W+/);
      const hit = Object.keys(notes).find((key) => words.includes(key));
      return hit ? notes[hit] : `No note about "${topic}" yet. Add one to tools/server.mjs.`;
    },
  },
  calc: {
    description: "Evaluate an arithmetic expression with + - * / and parentheses.",
    inputSchema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Such as (2 + 3) * 4",
          pattern: "^[0-9+\\-*/().\\s]+$",
          examples: ["(2 + 3) * 4"],
        },
      },
      required: ["expression"],
    },
    run: ({ expression }) => {
      const text = String(expression ?? "");
      // Only digits, operators, dots, parentheses and spaces: nothing else reaches Function.
      if (!/^[\d+\-*/().\s]+$/.test(text))
        throw new Error("only numbers, + - * / and parentheses are allowed");
      const value = Function(`"use strict"; return (${text});`)();
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("the expression has no finite value");
      return String(value);
    },
  },
  word_count: {
    description: "Count the words in a text.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text to count", examples: ["one two three"] },
      },
      required: ["text"],
    },
    run: ({ text }) =>
      String(
        String(text ?? "")
          .split(/\s+/)
          .filter(Boolean).length,
      ),
  },
};

function rpcReply(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Answers one JSON-RPC message, or returns null for a notification (no id). */
export function handle(message) {
  const { id, method, params } = message ?? {};
  if (id === undefined || id === null) return null;
  if (method === "initialize") {
    return rpcReply(id, {
      protocolVersion: params?.protocolVersion ?? "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "super-agent-tools", version: "1.0.0" },
    });
  }
  if (method === "tools/list") {
    return rpcReply(id, {
      tools: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true },
      })),
    });
  }
  if (method === "tools/call") {
    const tool = tools[params?.name];
    if (!tool) return rpcError(id, -32602, `unknown tool: ${params?.name}`);
    try {
      return rpcReply(id, { content: [{ type: "text", text: tool.run(params.arguments ?? {}) }] });
    } catch (error) {
      return rpcReply(id, { content: [{ type: "text", text: error.message }], isError: true });
    }
  }
  return rpcError(id, -32601, `method not found: ${method}`);
}

createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    return response.end("ok");
  }
  if (request.url !== "/mcp") {
    response.writeHead(404);
    return response.end();
  }
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" });
    return response.end();
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let message;
  try {
    message = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    return response.end(JSON.stringify(rpcError(null, -32700, "parse error")));
  }
  const reply = handle(message);
  if (!reply) {
    response.writeHead(202);
    return response.end();
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(reply));
}).listen(Number(process.env.PORT ?? 4301));
