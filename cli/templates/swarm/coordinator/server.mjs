// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The swarm coordinator: splits a goal into subtasks, hands them to workers that pull, and merges the answers.
// No dependencies. Flisk starts it with PORT set from service.json.

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";

const goals = new Map(); // id -> { id, goal, status, subtasks: [{ id, text, status, worker, result, attempts, error }] }
const queue = []; // subtask ids waiting for a worker
// Every change is written here, so a coordinator that crashes and is restarted carries on with the same goals.
const stateFile = process.env.STATE_FILE ?? ".data/swarm-state.json";
// A worker that dies or hangs keeps its claim only this long; then the subtask goes back in the queue.
const claimMs = Number(process.env.CLAIM_MS ?? 15_000);
// A subtask that fails or times out this many times is marked failed instead of retried.
const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 3);

/** Writes the goals to a temporary file and renames it over the old one, so a crash mid-write never leaves half a file. */
function save() {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(`${stateFile}.tmp`, JSON.stringify([...goals.values()]));
  renameSync(`${stateFile}.tmp`, stateFile);
}

/** Reads the goals of the previous run. A claim keeps its deadline, so a claim whose worker died with us still expires. */
function load() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(stateFile, "utf-8"));
  } catch {
    return; // first start, or no state yet
  }
  for (const goal of saved) {
    goals.set(goal.id, goal);
    for (const subtask of goal.subtasks) if (subtask.status === "queued") queue.push(subtask.id);
  }
}
load();

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

/** Puts a subtask back in the queue, or marks it (and its goal) failed once it is out of attempts. */
function retryOrFail(goal, subtask, error) {
  subtask.error = error;
  subtask.worker = null;
  subtask.deadline = null;
  if (subtask.attempts >= maxAttempts) {
    subtask.status = "failed";
    goal.status = "failed";
  } else {
    subtask.status = "queued";
    queue.push(subtask.id);
  }
}

/** Requeues every claim whose worker missed its deadline. */
function reclaimExpired(now = Date.now()) {
  let changed = false;
  for (const goal of goals.values()) {
    for (const subtask of goal.subtasks) {
      if (subtask.status === "claimed" && subtask.deadline <= now) {
        retryOrFail(goal, subtask, `${subtask.worker} did not finish within ${claimMs} ms`);
        changed = true;
      }
    }
  }
  if (changed) save();
}
setInterval(reclaimExpired, Math.max(100, Math.min(claimMs, 1_000))).unref();

/**
 * True when the answer comes from the current claim. A worker whose claim expired may answer after another worker claimed the
 * subtask again; its attempt number is then older than the subtask's, and the answer is dropped.
 */
function ownsClaim(subtask, body) {
  return subtask.status === "claimed" && body.attempt === subtask.attempts;
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
      attempts: 0,
      error: null,
      deadline: null,
    }));
    const goal = {
      id: randomUUID(),
      goal: body.goal,
      status: subtasks.length ? "running" : "done",
      subtasks,
    };
    goals.set(goal.id, goal);
    for (const subtask of subtasks) queue.push(subtask.id);
    save();
    return json(response, 201, goal);
  }
  if (url.pathname === "/claim" && request.method === "POST") {
    const body = await readJson(request);
    const worker = body && typeof body.worker === "string" ? body.worker : "anonymous";
    reclaimExpired();
    let found = null;
    while (!found && queue.length) {
      const candidate = findSubtask(queue.shift());
      if (candidate?.subtask.status === "queued") found = candidate;
    }
    if (!found) return json(response, 200, { task: null });
    found.subtask.status = "claimed";
    found.subtask.worker = worker;
    found.subtask.attempts += 1;
    found.subtask.deadline = Date.now() + claimMs;
    save();
    return json(response, 200, {
      task: { id: found.subtask.id, text: found.subtask.text, attempt: found.subtask.attempts },
    });
  }
  if (url.pathname === "/complete" && request.method === "POST") {
    const body = await readJson(request);
    const found = body && findSubtask(body.id);
    if (!found) return json(response, 404, { error: "unknown task id" });
    if (!ownsClaim(found.subtask, body)) return json(response, 409, { error: "claim expired" });
    found.subtask.status = "done";
    found.subtask.deadline = null;
    found.subtask.result = body.result ?? null;
    if (found.goal.subtasks.every((item) => item.status === "done")) found.goal.status = "done";
    save();
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/fail" && request.method === "POST") {
    const body = await readJson(request);
    const found = body && findSubtask(body.id);
    if (!found) return json(response, 404, { error: "unknown task id" });
    if (!ownsClaim(found.subtask, body)) return json(response, 409, { error: "claim expired" });
    retryOrFail(found.goal, found.subtask, String(body.error ?? "worker reported a failure"));
    save();
    return json(response, 200, { status: found.subtask.status, attempts: found.subtask.attempts });
  }
  json(response, 404, { error: "not found" });
});

server.listen(Number(process.env.PORT ?? 4100));
