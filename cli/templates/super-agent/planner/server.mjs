// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The planner: turns a goal into steps (research each topic, write the answer, check it), hands steps to the sub-agents that
// pull them, retries a step whose agent died or failed, and redoes what the checker sends back. No dependencies unless you
// turn on model planning (see plan.mjs).
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { plan } from "./plan.mjs";

const goals = new Map();
// Every change is written here, so a planner that crashes and is restarted carries on with the same goals.
const stateFile = process.env.STATE_FILE ?? ".data/super-agent-state.json";
// An agent that dies or hangs keeps its claim only this long; then the step goes back in the queue.
const claimMs = Number(process.env.CLAIM_MS ?? 15_000);
// A step that fails or times out this many times fails its goal.
const maxFailures = Number(process.env.MAX_ATTEMPTS ?? 3);
// A failed step waits this long before its next attempt, doubling each time, so a tool server that is being restarted does
// not burn every attempt in a second.
const backoffMs = Number(process.env.RETRY_BACKOFF_MS ?? 1_000);
// How many times the checker may send work back before the goal fails.
const maxRevisions = Number(process.env.MAX_REVISIONS ?? 2);

function save() {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(`${stateFile}.tmp`, JSON.stringify([...goals.values()]));
  renameSync(`${stateFile}.tmp`, stateFile);
}

function load() {
  try {
    for (const goal of JSON.parse(readFileSync(stateFile, "utf-8"))) goals.set(goal.id, goal);
  } catch {
    // first start, or no state yet
  }
}
load();

function newStep(kind, input, deps = []) {
  return {
    id: randomUUID(),
    kind,
    input,
    deps,
    status: "queued",
    agent: null,
    attempts: 0,
    failures: 0,
    deadline: null,
    notBefore: 0,
    result: null,
    error: null,
  };
}

/** Steps for one goal: research each topic, then write from all research, then check the answer. */
export function buildSteps(goal, topics) {
  const research = topics.map((topic) => newStep("research", { topic }));
  const write = newStep(
    "write",
    { goal },
    research.map((step) => step.id),
  );
  const check = newStep("check", { goal }, [...research.map((step) => step.id), write.id]);
  return [...research, write, check];
}

function release(step) {
  step.status = "queued";
  step.agent = null;
  step.deadline = null;
}

/** A failed or expired step goes back in the queue, or fails its goal once it has failed `maxFailures` times. */
function retryOrFail(goal, step, error) {
  step.error = error;
  step.failures += 1;
  release(step);
  step.notBefore = Date.now() + backoffMs * 2 ** (step.failures - 1);
  if (step.failures >= maxFailures) {
    step.status = "failed";
    goal.status = "failed";
    goal.reason = `step ${step.kind} "${step.input.topic ?? step.input.goal}" failed ${step.failures} times: ${error}`;
  }
}

function reclaimExpired(now = Date.now()) {
  let changed = false;
  for (const goal of goals.values()) {
    for (const step of goal.steps) {
      if (step.status === "claimed" && step.deadline <= now) {
        retryOrFail(goal, step, `${step.agent} did not finish within ${claimMs} ms`);
        changed = true;
      }
    }
  }
  if (changed) save();
}
setInterval(reclaimExpired, Math.max(100, Math.min(claimMs, 1_000))).unref();

/** The answer counts only from the current claim: an agent whose claim expired may answer after the step was claimed again. */
function ownsClaim(step, body) {
  return step.status === "claimed" && body.attempt === step.attempts;
}

function find(id) {
  for (const goal of goals.values()) {
    const step = goal.steps.find((item) => item.id === id);
    if (step) return { goal, step };
  }
  return null;
}

/** The checker's verdict: done, or the research it names (and the answer and check after it) is done again. */
function applyReview(goal, review) {
  if (review.ok) {
    goal.status = "done";
    goal.answer = goal.steps.find((step) => step.kind === "write").result.answer;
    return;
  }
  if (goal.revisions >= maxRevisions) {
    goal.status = "failed";
    goal.reason = `the checker still rejected the answer after ${goal.revisions} revisions: ${review.reasons.join("; ")}`;
    return;
  }
  goal.revisions += 1;
  goal.reviews.push(review.reasons);
  const redo = new Set(
    review.redo?.length
      ? review.redo
      : goal.steps.filter((s) => s.kind === "research").map((s) => s.id),
  );
  for (const step of goal.steps) {
    if (redo.has(step.id) || step.kind === "write" || step.kind === "check") {
      release(step);
      step.result = null;
    }
  }
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

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") return json(response, 200, { ok: true });
  if (url.pathname === "/goals" && request.method === "GET")
    return json(response, 200, { goals: [...goals.values()] });
  if (url.pathname === "/goals" && request.method === "POST") {
    const body = await readJson(request);
    if (!body || typeof body.goal !== "string" || !body.goal.trim()) {
      return json(response, 400, { error: 'send JSON like {"goal":"..."}' });
    }
    const { topics, planner } = await plan(body.goal);
    const goal = {
      id: randomUUID(),
      goal: body.goal,
      status: "running",
      planner,
      topics,
      revisions: 0,
      reviews: [],
      answer: null,
      reason: null,
      steps: [],
    };
    goal.steps = buildSteps(body.goal, topics);
    goals.set(goal.id, goal);
    save();
    return json(response, 201, goal);
  }
  if (url.pathname === "/claim" && request.method === "POST") {
    const body = await readJson(request);
    const kinds = Array.isArray(body?.kinds) ? body.kinds : [];
    reclaimExpired();
    for (const goal of goals.values()) {
      if (goal.status !== "running") continue;
      const done = new Set(goal.steps.filter((s) => s.status === "done").map((s) => s.id));
      const step = goal.steps.find(
        (s) =>
          s.status === "queued" &&
          kinds.includes(s.kind) &&
          (s.notBefore ?? 0) <= Date.now() &&
          s.deps.every((d) => done.has(d)),
      );
      if (!step) continue;
      step.status = "claimed";
      step.agent = typeof body.agent === "string" ? body.agent : "anonymous";
      step.attempts += 1;
      step.deadline = Date.now() + claimMs;
      save();
      const inputs = step.deps.map((id) => ({
        stepId: id,
        ...goal.steps.find((s) => s.id === id).result,
      }));
      return json(response, 200, {
        step: { id: step.id, kind: step.kind, input: step.input, inputs, attempt: step.attempts },
      });
    }
    return json(response, 200, { step: null });
  }
  if (url.pathname === "/complete" && request.method === "POST") {
    const body = await readJson(request);
    const found = body && find(body.id);
    if (!found) return json(response, 404, { error: "unknown step id" });
    if (!ownsClaim(found.step, body)) return json(response, 409, { error: "claim expired" });
    found.step.status = "done";
    found.step.deadline = null;
    found.step.result = body.result ?? null;
    if (found.step.kind === "check")
      applyReview(
        found.goal,
        body.result ?? { ok: false, reasons: ["the checker sent no verdict"] },
      );
    save();
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/fail" && request.method === "POST") {
    const body = await readJson(request);
    const found = body && find(body.id);
    if (!found) return json(response, 404, { error: "unknown step id" });
    if (!ownsClaim(found.step, body)) return json(response, 409, { error: "claim expired" });
    retryOrFail(found.goal, found.step, String(body.error ?? "the agent reported a failure"));
    save();
    return json(response, 200, { status: found.step.status });
  }
  json(response, 404, { error: "not found" });
}).listen(Number(process.env.PORT ?? 4300));
