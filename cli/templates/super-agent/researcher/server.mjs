// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Sub-agent: researches one topic with the `lookup` tool. Replace `research` with a model call that uses more tools.
import { callTool, runAgent } from "../lib/agent.mjs";

const name = process.env.AGENT_NAME ?? "researcher";

async function research(step) {
  // BAD_RATE (0 to 1) makes this agent hand in an empty answer on purpose, to watch the checker send it back.
  if (Math.random() < Number(process.env.BAD_RATE ?? 0))
    return { topic: step.input.topic, note: "" };
  const note = await callTool("lookup", { topic: step.input.topic });
  return { topic: step.input.topic, note };
}

runAgent(name, ["research"], research);
