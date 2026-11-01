// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The swarm coordinator: splits a goal into subtasks, hands them to workers that pull, and merges the answers.
// No dependencies. Flisk starts it with PORT set from service.json.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

const goals = new Map(); // id -> { id, goal, status, subtasks: [{ id, text, status, worker, result }] }
const queue = []; // subtask ids waiting for a worker

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
  } catch {
    return null;
  }
}

/** A goal splits on "." , ";" and " and " into subtasks, so "a and b; c" gives three. */
export function split(goal) {
  return goal
    .split(/\.|;|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findSubtask(id) {
  for (const goal of goals.values()) {
    const subtask = goal.subtasks.find((item) => item.id === id);
    if (subtask) return { goal, subtask };
  }
  return null;
}

const page = `<!doctype html><meta charset="utf-8"><title>Flisk swarm</title>
<body style="font:16px system-ui;max-width:42rem;margin:2rem auto">
<h1>Flisk swarm</h1>
<form onsubmit="send(event)"><input id="g" style="width:75%" placeholder="Research flisk. Summarize docs and list risks"> <button>Run</button></form>
<pre id="out">no goals yet</pre>
<script>
async function send(e){e.preventDefault();await fetch('/goals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal:g.value})});g.value='';}
async function tick(){out.textContent=JSON.stringify(await (await fetch('/goals')).json(),null,2);}
setInterval(tick,1000);tick();
</script>`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/" && request.method === "GET") {
    response.writeHead(200, { "content-type": "text/html" });
    return response.end(page);
  }
  if (url.pathname === "/goals" && request.method === "GET") {
    return json(response, 200, { goals: [...goals.values()], queued: queue.length });
  }
  if (url.pathname === "/goals" && request.method === "POST") {
    const body = await readJson(request);
    if (!body || typeof body.goal !== "string" || !body.goal.trim()) {
      return json(response, 400, { error: 'send JSON like {"goal":"..."}' });
    }
    const subtasks = split(body.goal).map((text) => ({
      id: randomUUID(),
      text,
      status: "queued",
      worker: null,
      result: null,
    }));
    const goal = {
      id: randomUUID(),
      goal: body.goal,
      status: subtasks.length ? "running" : "done",
      subtasks,
    };
    goals.set(goal.id, goal);
    for (const subtask of subtasks) queue.push(subtask.id);
    return json(response, 201, goal);
  }
  if (url.pathname === "/claim" && request.method === "POST") {
    const body = await readJson(request);
    const worker = body && typeof body.worker === "string" ? body.worker : "anonymous";
    const id = queue.shift();
    if (!id) return json(response, 200, { task: null });
    const found = findSubtask(id);
    found.subtask.status = "claimed";
    found.subtask.worker = worker;
    return json(response, 200, { task: { id, text: found.subtask.text } });
  }
  if (url.pathname === "/complete" && request.method === "POST") {
    const body = await readJson(request);
    const found = body && findSubtask(body.id);
    if (!found) return json(response, 404, { error: "unknown task id" });
    found.subtask.status = "done";
    found.subtask.result = body.result ?? null;
    if (found.goal.subtasks.every((item) => item.status === "done")) found.goal.status = "done";
    return json(response, 200, { ok: true });
  }
  json(response, 404, { error: "not found" });
});

server.listen(Number(process.env.PORT ?? 4100));
