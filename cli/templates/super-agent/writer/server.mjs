// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Sub-agent: writes the answer from the research the planner hands over with the step.
import { callTool, runAgent } from "../lib/agent.mjs";

const name = process.env.AGENT_NAME ?? "writer";

async function write(step) {
  const lines = step.inputs.map((research) => `- ${research.topic}: ${research.note}`);
  const answer = `${step.input.goal}\n\n${lines.join("\n")}`;
  return { answer, words: Number(await callTool("word_count", { text: answer })) };
}

runAgent(name, ["write"], write);
