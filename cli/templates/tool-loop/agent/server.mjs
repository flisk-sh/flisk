// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The plain agent loop every framework wraps: the Anthropic SDK's tool runner asks the model, runs the tools it calls, feeds
// the results back, and stops when the model answers. The tools are the MCP tool server's, found through tools/list.
// Out of the box the model is the mock in model/ (offline, free); see the README to use Claude.
import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema.mjs";

const toolsUrl = process.env.TOOLS_URL ?? "http://localhost:4501";
// The SDK retries a request whose connection failed (the model is restarting, say) with backoff.
const client = new Anthropic({ maxRetries: 4 });
const usingMock = Boolean(process.env.ANTHROPIC_BASE_URL);

let rpcId = 0;
async function mcp(method, params) {
  const response = await fetch(`${toolsUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const reply = await response.json();
  if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
  return reply.result;
}

/** Retries a call to the tool server, waiting 0.5 s and doubling, so a tool server that is being restarted is waited for. */
async function withRetries(call, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
}

/** Every tool the MCP server lists, as a tool the SDK's runner can call. */
async function mcpTools(called) {
  const { tools } = await withRetries(() => mcp("tools/list"));
  return tools.map((tool) =>
    betaTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      run: async (args) => {
        called.push(tool.name);
        const result = await withRetries(() =>
          mcp("tools/call", { name: tool.name, arguments: args }),
        );
        const text = result.content?.[0]?.text ?? "";
        if (result.isError) throw new Error(text);
        return text;
      },
    }),
  );
}

export async function ask(question) {
  const called = [];
  const message = await client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    // A declined request is re-run on Anthropic's recommended fallback model instead of coming back as a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    max_iterations: 8,
    system:
      "Answer the user's question. Look things up with the tools first; cite what they returned.",
    tools: await mcpTools(called),
    messages: [{ role: "user", content: question }],
  });
  if (message.stop_reason === "refusal") throw new Error("the model declined to answer");
  const answer = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return {
    answer,
    tools: called,
    stopReason: message.stop_reason,
    model: usingMock ? "mock" : message.model,
  };
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.url === "/health") return json(response, 200, { ok: true });
  if (request.url === "/ask" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
    } catch {
      body = null;
    }
    if (!body || typeof body.question !== "string" || !body.question.trim()) {
      return json(response, 400, { error: 'send JSON like {"question":"..."}' });
    }
    try {
      return json(response, 200, await ask(body.question));
    } catch (error) {
      return json(response, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  json(response, 404, { error: "not found" });
}).listen(Number(process.env.PORT ?? 4500));
