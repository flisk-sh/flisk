// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// A stand-in for the Anthropic Messages API, so the agent's real SDK loop runs offline and for free. It plays one fixed
// strategy: first look up each topic of the question with the `lookup` tool, then answer from what the tools returned.
// It is not a model: delete it and point the agent at Claude (see the README).
import { createServer } from "node:http";

/** The topics of a question: it splits on ".", ";", "," and " and ", like the starters' rule planner. */
export function topics(question) {
  return question
    .split(/[.;,?]|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

/** The reply to one Messages API request body: tool calls on the first turn, an answer once the tool results are in. */
export function reply(body) {
  const last = body.messages.at(-1);
  const results = Array.isArray(last.content)
    ? last.content.filter((block) => block.type === "tool_result")
    : [];
  if (results.length === 0) {
    const question =
      typeof last.content === "string"
        ? last.content
        : (last.content.find((b) => b.type === "text")?.text ?? "");
    const calls = topics(question).map((topic, index) => ({
      type: "tool_use",
      id: `toolu_mock_${index}`,
      name: "lookup",
      input: { topic },
    }));
    return { content: calls, stop_reason: "tool_use" };
  }
  const notes = results.map((result) =>
    typeof result.content === "string" ? result.content : (result.content?.[0]?.text ?? ""),
  );
  return { content: [{ type: "text", text: notes.join("\n") }], stop_reason: "end_turn" };
}

let count = 0;
createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    return response.end("ok");
  }
  if (request.method !== "POST" || !request.url?.startsWith("/v1/messages")) {
    response.writeHead(404, { "content-type": "application/json" });
    return response.end(
      JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not found" } }),
    );
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  // The agent must ask for server-side fallbacks, as it would with Claude.
  if (
    !String(request.headers["anthropic-beta"] ?? "").includes("server-side-fallback-2026-07-01")
  ) {
    response.writeHead(400, { "content-type": "application/json" });
    return response.end(
      JSON.stringify({
        type: "error",
        error: { type: "invalid_request_error", message: "missing the fallback beta" },
      }),
    );
  }
  const { content, stop_reason } = reply(body);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      id: `msg_mock_${++count}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content,
      stop_reason,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
  );
}).listen(Number(process.env.PORT ?? 4502));
