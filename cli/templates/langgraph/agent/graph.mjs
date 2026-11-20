// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The agent as a LangGraph StateGraph: plan -> research -> write -> check, and back to research when the checker finds a
// topic with no note. Every node's result is checkpointed, so a run that crashes resumes at the node it was in.
// A run started with `approve: true` goes on after the check: approve (a human decides, through interrupt) -> act (the side
// effect, sent once however many times the run is resumed).
import { Annotation, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import { deliver, once } from "./effects.mjs";
import { plan } from "./plan.mjs";

const toolsUrl = process.env.TOOLS_URL ?? "http://localhost:4401";
// Slows every node down, so you can watch a run (or kill the agent in the middle of one).
const stepDelayMs = Number(process.env.STEP_DELAY_MS ?? 0);
// How many times the checker may send research back before the run ends with what it has.
const maxRevisions = Number(process.env.MAX_REVISIONS ?? 2);

export const State = Annotation.Root({
  goal: Annotation(),
  planner: Annotation(),
  topics: Annotation(),
  notes: Annotation({ reducer: (old, update) => ({ ...old, ...update }), default: () => ({}) }),
  answer: Annotation(),
  review: Annotation(),
  // Set by `POST /runs` with `approve: true`: the run waits for a human before its side effect.
  needsApproval: Annotation(),
  // The human's decision ({ approved, note }), then the result of the side effect ({ delivered, key, ... }).
  approval: Annotation(),
  effect: Annotation(),
  revisions: Annotation({ reducer: (old, update) => old + update, default: () => 0 }),
  // Every node that ran, in order, with the process it ran in. A run resumed after a crash shows that the nodes it had
  // finished kept the old process: they were not run again.
  trace: Annotation({ reducer: (old, update) => old.concat(update), default: () => [] }),
});

let rpcId = 0;
/** Calls one tool on the MCP tool server; throws when the server is down or the tool fails, so LangGraph retries the node. */
export async function callTool(name, args) {
  const response = await fetch(`${toolsUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++rpcId,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const reply = await response.json();
  if (reply.error) throw new Error(`${name}: ${reply.error.message}`);
  const text = reply.result?.content?.[0]?.text ?? "";
  if (reply.result?.isError) throw new Error(`${name}: ${text}`);
  return text;
}

const ran = (node) => ({ node, pid: process.pid });

const pause = () =>
  stepDelayMs ? new Promise((resolve) => setTimeout(resolve, stepDelayMs)) : undefined;

async function planNode(state) {
  await pause();
  const { topics, planner } = await plan(state.goal);
  return { topics, planner, trace: [ran("plan")] };
}

/** Researches every topic without a note yet: on a revision, only the ones the checker sent back. */
async function researchNode(state) {
  await pause();
  const notes = {};
  for (const topic of state.topics) {
    if (state.notes[topic]?.trim()) continue;
    // BAD_RATE (0 to 1) hands in an empty note on purpose, to watch the checker send it back.
    notes[topic] =
      Math.random() < Number(process.env.BAD_RATE ?? 0) ? "" : await callTool("lookup", { topic });
  }
  return { notes, trace: [ran("research")] };
}

async function writeNode(state) {
  await pause();
  const lines = state.topics.map((topic) => `- ${topic}: ${state.notes[topic]}`);
  return { answer: `${state.goal}\n\n${lines.join("\n")}`, trace: [ran("write")] };
}

/** Sends empty research back while revisions are left; the run then ends with what it has, and says so in `review`. */
async function checkNode(state) {
  await pause();
  const empty = state.topics.filter((topic) => !state.notes[topic]?.trim());
  const reasons = empty.map((topic) => `no note for "${topic}"`);
  const trace = [ran("check")];
  if (empty.length === 0) return { review: { ok: true, redo: false, reasons }, trace };
  if (state.revisions >= maxRevisions)
    return { review: { ok: false, redo: false, reasons }, trace };
  return { review: { ok: false, redo: true, reasons }, revisions: 1, trace };
}

/**
 * Waits for a human. interrupt() stops the run here and saves it; it stays stopped, across restarts, until `POST /runs/:id/resume`
 * continues it, and the body of that request is what interrupt() then returns. The node starts over from its first line on
 * resume, so nothing before interrupt() may have a side effect.
 */
async function approveNode(state) {
  await pause();
  const decision = interrupt({ question: "Send this answer?", answer: state.answer });
  return {
    approval: { approved: decision?.approved === true, note: decision?.note ?? null },
    trace: [ran("approve")],
  };
}

/** After the check: back to research when the checker sent work back, then the approval if the run asked for one, else done. */
export function afterCheck(state) {
  if (state.review.redo) return "research";
  return state.needsApproval ? "approve" : END;
}

/** After the decision: the side effect when it was approved, else the run ends without one. */
export function afterApprove(state) {
  return state.approval?.approved ? "act" : END;
}

export function buildGraph(checkpointer, { effects, outbox } = {}) {
  /**
   * The side effect, keyed by the run and the step, so a run resumed after a crash (or an agent that died between the effect
   * and its checkpoint) sends once: the key is looked up in the effect store first, and goes to the receiver with the call.
   */
  async function actNode(state, config) {
    const key = `${config.configurable.thread_id}:send`;
    const effect = await once(effects, key, (k) => deliver(outbox, k, { answer: state.answer }));
    return { effect, trace: [ran("act")] };
  }

  // A node that throws (the tool server is down, say) is retried with backoff before the run fails.
  const retryPolicy = {
    maxAttempts: Number(process.env.MAX_ATTEMPTS ?? 5),
    initialInterval: Number(process.env.RETRY_BACKOFF_MS ?? 1_000),
    backoffFactor: 2,
    jitter: false,
  };
  return new StateGraph(State)
    .addNode("plan", planNode, { retryPolicy })
    .addNode("research", researchNode, { retryPolicy })
    .addNode("write", writeNode)
    .addNode("check", checkNode)
    .addNode("approve", approveNode)
    .addNode("act", actNode)
    .addEdge(START, "plan")
    .addEdge("plan", "research")
    .addEdge("research", "write")
    .addEdge("write", "check")
    .addConditionalEdges("check", afterCheck)
    .addConditionalEdges("approve", afterApprove)
    .addEdge("act", END)
    .compile({ checkpointer });
}
