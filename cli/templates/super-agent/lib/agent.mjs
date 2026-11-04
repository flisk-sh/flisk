// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Shared by the sub-agents: pull a step from the planner, do it, report the answer. No dependencies.
import { createServer } from "node:http";

export const plannerUrl = process.env.PLANNER_URL ?? "http://localhost:4300";
export const toolsUrl = process.env.TOOLS_URL ?? "http://localhost:4301";

export async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

let rpcId = 0;
/** Calls one tool on the MCP tool server and returns its text, or throws with the tool's error. */
export async function callTool(name, args) {
  const reply = await post(`${toolsUrl}/mcp`, {
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "tools/call",
    params: { name, arguments: args },
  });
  if (reply.error) throw new Error(`${name}: ${reply.error.message}`);
  const text = reply.result?.content?.[0]?.text ?? "";
  if (reply.result?.isError) throw new Error(`${name}: ${text}`);
  return text;
}

/**
 * Pulls steps of the given kinds forever. `work(step)` returns the answer; when it throws, the planner is told, so it retries the
 * step now instead of waiting for the claim to expire. A planner that is down is waited for.
 */
export function runAgent(name, kinds, work) {
  createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(request.url === "/health" ? "ok" : name);
  }).listen(Number(process.env.PORT));
  (async () => {
    for (;;) {
      try {
        const { step } = await post(`${plannerUrl}/claim`, { agent: name, kinds });
        if (step) {
          try {
            await post(`${plannerUrl}/complete`, {
              id: step.id,
              attempt: step.attempt,
              result: await work(step),
            });
          } catch (error) {
            await post(`${plannerUrl}/fail`, {
              id: step.id,
              attempt: step.attempt,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          continue;
        }
      } catch {
        // the planner is not up yet, or restarting; try again
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  })();
}
