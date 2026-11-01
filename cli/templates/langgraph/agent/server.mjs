// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// HTTP around the LangGraph agent. Each run is a LangGraph thread checkpointed to .data/; on start, every run that had not
// finished is resumed from its last checkpoint, so a crash (or kill -9) loses no finished node.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { FileSaver } from "./file-saver.mjs";
import { buildGraph } from "./graph.mjs";

const dataDir = process.env.DATA_DIR ?? ".data";
const graph = buildGraph(new FileSaver(`${dataDir}/checkpoints.json`));
const runsFile = `${dataDir}/runs.json`;

/** id -> { id, goal, status: running | done | failed, error, resumed } */
const runs = new Map();
try {
  for (const run of JSON.parse(readFileSync(runsFile, "utf-8"))) runs.set(run.id, run);
} catch {
  // first start
}

function saveRuns() {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(`${runsFile}.tmp`, JSON.stringify([...runs.values()]));
  renameSync(`${runsFile}.tmp`, runsFile);
}

const config = (id) => ({ configurable: { thread_id: id } });

/** Runs the graph for one thread: from the start for a new run, or from its last checkpoint (`null` input) to resume. */
async function drive(run, input) {
  try {
    await graph.invoke(input, config(run.id));
    run.status = "done";
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : String(error);
  }
  saveRuns();
}

async function view(run) {
  const state = await graph.getState(config(run.id));
  return { ...run, next: state.next, ...state.values };
}

/**
 * Picks up a run the last process left in the middle: from the start when it died before LangGraph's first checkpoint, from
 * the last checkpoint otherwise. A run whose graph had already reached the end is just marked done.
 */
async function resume(run) {
  const state = await graph.getState(config(run.id));
  run.resumed = (run.resumed ?? 0) + 1;
  if (!state.values?.goal) return drive(run, { goal: run.goal });
  if (state.next.length === 0) {
    run.status = "done";
    return saveRuns();
  }
  return drive(run, null);
}
for (const run of runs.values()) if (run.status === "running") resume(run);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/runs" && request.method === "GET") {
    return json(response, 200, { runs: await Promise.all([...runs.values()].map(view)) });
  }
  if (url.pathname === "/runs" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
    } catch {
      body = null;
    }
    if (!body || typeof body.goal !== "string" || !body.goal.trim()) {
      return json(response, 400, { error: 'send JSON like {"goal":"..."}' });
    }
    const run = { id: randomUUID(), goal: body.goal, status: "running", error: null, resumed: 0 };
    runs.set(run.id, run);
    saveRuns();
    drive(run, { goal: body.goal });
    return json(response, 201, run);
  }
  json(response, 404, { error: "not found" });
}).listen(Number(process.env.PORT ?? 4400));
