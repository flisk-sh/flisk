// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The plain agent loop every framework wraps: a model asks for tools, the loop runs the MCP tool server's tools it calls,
// feeds the results back, and stops when the model answers. MODEL and the base URLs come from the environment; out of the
// box the model is the local mock in model/ (offline, free). See the README for Claude, Ollama and OpenRouter.
import { createServer } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema.mjs";
import { beforeTurn, createTurnGuard } from "./guard.mjs";

const toolsUrl = process.env.TOOLS_URL ?? "http://localhost:4501";
const mockBaseUrl = "http://localhost:4502";
const model = process.env.MODEL?.trim() || "claude-opus-5-5";
const openaiBaseUrl = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
const openaiApiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim() || mockBaseUrl;
const usingMock = !openaiBaseUrl && anthropicBaseUrl === mockBaseUrl;
// The SDK retries a request whose connection failed (the model is restarting, say) with backoff.
const client = new Anthropic({ maxRetries: 4, baseURL: anthropicBaseUrl });

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

/** Retries a call to a server that is being restarted, waiting 0.5 s and doubling. A fatal HTTP error is not retried. */
async function withRetries(call, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (error.fatal || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
}

/** Every tool the MCP server lists, each with a guarded `run` that records calls. Both model APIs use these. */
async function mcpTools(called, guard) {
  const { tools } = await withRetries(() => mcp("tools/list"));
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: guard.guardRun(tool.name, async (args) => {
      called.push(tool.name);
      const result = await withRetries(() =>
        mcp("tools/call", { name: tool.name, arguments: args }),
      );
      const text = result.content?.[0]?.text ?? "";
      if (result.isError) throw new Error(text);
      return text;
    }),
  }));
}

/**
 * OpenAI-compatible servers (Ollama, vLLM, OpenRouter) speak /chat/completions, not the Anthropic Messages API. Send the
 * MCP tools as function definitions, run the tool_calls the model makes, and feed role:tool results back until it answers.
 */
async function askOpenAI(question, tools, called) {
  const messages = [{ role: "user", content: question }];
  const endpoint = `${openaiBaseUrl}/chat/completions`;
  const definitions = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
  for (let iteration = 0; iteration < 8; iteration++) {
    const completion = await withRetries(async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(openaiApiKey ? { authorization: `Bearer ${openaiApiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          ...(definitions.length > 0 ? { tools: definitions, tool_choice: "auto" } : {}),
        }),
      });
      if (!response.ok) {
        const message = `chat/completions: ${response.status} ${await response.text()}`;
        throw Object.assign(new Error(message), {
          fatal: response.status >= 400 && response.status < 500,
        });
      }
      return response.json();
    });
    const choice = completion.choices?.[0]?.message;
    if (!choice) throw new Error("chat/completions: no message in the reply");
    messages.push(choice);
    const calls = choice.tool_calls ?? [];
    if (calls.length === 0) return { answer: choice.content ?? "", stopReason: "end_turn" };
    for (const call of calls) {
      const name = call.function?.name;
      const tool = tools.find((entry) => entry.name === name);
      let args;
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const content = tool ? await tool.run(args) : `Unknown tool: ${name}`;
      called.push(name);
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  throw new Error("the model did not finish within 8 tool turns");
}

export async function ask(question) {
  const verdict = await beforeTurn({ question });
  if (!verdict.allow)
    throw Object.assign(new Error(verdict.reason ?? "refused"), { refused: true });
  const called = [];
  const { guardRun, state } = createTurnGuard();
  const tools = await mcpTools(called, { guardRun });
  if (openaiBaseUrl) {
    const { answer, stopReason } = await askOpenAI(question, tools, called);
    return { answer, tools: called, blocked: state.blocked, stopReason, model };
  }
  const message = await client.beta.messages.toolRunner({
    model,
    max_tokens: 16000,
    // A declined request is re-run on Anthropic's recommended fallback model instead of coming back as a refusal.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    max_iterations: 8,
    system:
      "Answer the user's question. Look things up with the tools first; cite what they returned.",
    tools: tools.map((tool) => betaTool(tool)),
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
    blocked: state.blocked,
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
      if (error.refused) return json(response, 403, { error: error.message });
      // The details stay in the agent's log; the caller only learns that the request failed.
      console.error(error);
      return json(response, 502, { error: "the agent could not answer; see the agent logs" });
    }
  }
  json(response, 404, { error: "not found" });
}).listen(Number(process.env.PORT ?? 4500));
