// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// HTTP around the LangGraph agent. Each run is a LangGraph thread checkpointed to .data/ (or to Postgres when DATABASE_URL is
// set); on start, every run that had not finished is resumed from its last checkpoint, so a crash (or kill -9) loses no
// finished node. A run started with `approve: true` stops before its side effect and waits for POST /runs/:id/resume.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Command } from "@langchain/langgraph";
import { FileEffects, PostgresEffects } from "./effects.mjs";
import { FileSaver } from "./file-saver.mjs";
import { buildGraph } from "./graph.mjs";

const dataDir = process.env.DATA_DIR ?? ".data";

/** The checkpointer and the effect store: Postgres when DATABASE_URL is set, else files under DATA_DIR. */
async function openStores() {
  if (!process.env.DATABASE_URL) {
    return {
      kind: "file",
      checkpointer: new FileSaver(`${dataDir}/checkpoints.json`),
      effects: new FileEffects(`${dataDir}/effects.json`),
    };
  }
  const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
  const { default: pg } = await import("pg");
  const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
  await checkpointer.setup();
  const effects = new PostgresEffects(new pg.Pool({ connectionString: process.env.DATABASE_URL }));
  await effects.setup();
  return { kind: "postgres", checkpointer, effects };
}

const stores = await openStores();
const graph = buildGraph(stores.checkpointer, {
  effects: stores.effects,
  outbox: `${dataDir}/outbox.jsonl`,
});
const runsFile = `${dataDir}/runs.json`;

/** id -> { id, goal, approve, status: running | awaiting_approval | done | failed, pending, error, resumed } */
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

/**
 * Runs the graph for one thread: from the start for a new run, from its last checkpoint (`null` input) to pick it up again, or
 * with a `Command({ resume })` to answer the question the run stopped on. A run that reaches interrupt() returns instead of
 * finishing, and waits for its decision.
 */
async function drive(run, input) {
  try {
    const result = await graph.invoke(input, config(run.id));
    const asked = result?.__interrupt__?.[0];
    run.status = asked ? "awaiting_approval" : "done";
    run.pending = asked ? asked.value : null;
  } catch (error) {
    run.status = "failed";
    // The details stay in the agent's log; GET /runs only says that the run failed.
    console.error(error);
    run.error = "the run failed; see the agent logs";
  }
  saveRuns();
}

async function view(run) {
  const state = await graph.getState(config(run.id));
  return { ...run, next: state.next, ...state.values };
}

/**
 * Picks up a run the last process left in the middle: from the start when it died before LangGraph's first checkpoint, from
 * the last checkpoint otherwise. A run whose graph had already reached the end is just marked done. A run that was waiting
 * for its approval is not here: it stays awaiting_approval until POST /runs/:id/resume, however often the agent restarts.
 */
async function resume(run) {
  const state = await graph.getState(config(run.id));
  run.resumed = (run.resumed ?? 0) + 1;
  if (!state.values?.goal)
    return drive(run, { goal: run.goal, needsApproval: run.approve === true });
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

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
  } catch {
    return null;
  }
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return json(response, 200, { ok: true, store: stores.kind });
  if (url.pathname === "/runs" && request.method === "GET") {
    return json(response, 200, { runs: await Promise.all([...runs.values()].map(view)) });
  }
  if (url.pathname === "/runs" && request.method === "POST") {
    const body = await readJson(request);
    if (!body || typeof body.goal !== "string" || !body.goal.trim()) {
      return json(response, 400, { error: 'send JSON like {"goal":"..."}' });
    }
    const run = {
      id: randomUUID(),
      goal: body.goal,
      approve: body.approve === true,
      status: "running",
      pending: null,
      error: null,
      resumed: 0,
    };
    runs.set(run.id, run);
    saveRuns();
    drive(run, { goal: body.goal, needsApproval: run.approve });
    return json(response, 201, run);
  }
  const resumeRoute = /^\/runs\/([^/]+)\/resume$/.exec(url.pathname);
  if (resumeRoute && request.method === "POST") {
    const run = runs.get(resumeRoute[1] ?? "");
    if (!run) return json(response, 404, { error: "no such run" });
    const body = await readJson(request);
    if (!body || typeof body.approved !== "boolean") {
      return json(response, 400, { error: 'send JSON like {"approved":true}' });
    }
    // Only a run that is waiting can be answered, and only once: a second answer would otherwise start the node again.
    if (run.status !== "awaiting_approval") {
      return json(response, 409, { error: `the run is ${run.status}, not awaiting_approval` });
    }
    run.status = "running";
    run.pending = null;
    saveRuns();
    drive(run, new Command({ resume: { approved: body.approved, note: body.note ?? null } }));
    return json(response, 202, run);
  }
  json(response, 404, { error: "not found" });
}).listen(Number(process.env.PORT ?? 4400));
