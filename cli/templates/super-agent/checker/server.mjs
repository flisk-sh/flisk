// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Sub-agent: reviews the answer. A research step with an empty note is sent back, and the planner redoes it and the answer.
import { runAgent } from "../lib/agent.mjs";

const name = process.env.AGENT_NAME ?? "checker";

/** `inputs` are the research results and, last, the writer's answer. */
export function review(step) {
  const answer = step.inputs.at(-1)?.answer ?? "";
  const research = step.inputs.slice(0, -1);
  const redo = research.filter((item) => !item.note?.trim()).map((item) => item.stepId);
  const missing = research.filter((item) => !answer.includes(item.topic)).map((item) => item.topic);
  const reasons = [
    ...redo.map((id) => `research step ${id} has no note`),
    ...missing.map((topic) => `the answer does not cover "${topic}"`),
  ];
  return { ok: reasons.length === 0, reasons, redo };
}

runAgent(name, ["check"], async (step) => review(step));
