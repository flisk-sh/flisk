// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";

/**
 * The LangGraph starter: an agent built as a LangGraph StateGraph with file checkpoints, the super-agent's MCP tool server,
 * and a one-shot job that installs the agent's packages before it starts. All local processes (no Docker).
 */
export const LANGGRAPH_PORTS = { agent: 4400, tools: 4401 } as const;

/** Project path -> template path. The planner and the tool server are the super-agent starter's, so they are not copied. */
const TEMPLATE_FILES: Record<string, string> = {
  "agent/package.json": "langgraph/agent/package.json",
  "agent/server.mjs": "langgraph/agent/server.mjs",
  "agent/graph.mjs": "langgraph/agent/graph.mjs",
  "agent/file-saver.mjs": "langgraph/agent/file-saver.mjs",
  "agent/plan.mjs": "super-agent/planner/plan.mjs",
  "tools/server.mjs": "super-agent/tools/server.mjs",
};

/** The service.json of each service, keyed by its path in the project folder. */
export function langgraphManifests(): Record<string, Record<string, unknown>> {
  return {
    "setup/service.json": {
      schemaVersion: 1,
      appName: "setup",
      appType: "bring-your-own",
      // A one-shot job: Flisk runs it once, and the agent starts only after it exits 0.
      command: "cd ../agent && npm install --no-audit --no-fund",
      restart: "no",
    },
    "tools/service.json": {
      schemaVersion: 1,
      appName: "tools",
      appType: "mcp",
      command: "node server.mjs",
      port: LANGGRAPH_PORTS.tools,
      healthCheckPath: "/health",
    },
    "agent/service.json": {
      schemaVersion: 1,
      appName: "agent",
      appType: "backend",
      command: "node server.mjs",
      port: LANGGRAPH_PORTS.agent,
      healthCheckPath: "/health",
      env: { TOOLS_URL: `http://localhost:${LANGGRAPH_PORTS.tools}` },
      dependsOn: ["setup", "tools"],
    },
  };
}

const README = `# Flisk LangGraph agent

An agent built with [LangGraph](https://langchain-ai.github.io/langgraphjs/): a \`StateGraph\` that plans a goal, researches
each topic with the \`lookup\` tool on an MCP tool server, writes the answer and checks it, and goes back to research when the
checker finds a topic with no note. Everything runs as local processes: no Docker. \`flisk up\` first runs \`setup\`, which
installs the agent's packages (\`agent/package.json\`, pinned versions).

\`\`\`bash
flisk up
curl -X POST localhost:${LANGGRAPH_PORTS.agent}/runs -H 'content-type: application/json' \\
  -d '{"goal":"Explain flisk and mcp and retries"}'
curl localhost:${LANGGRAPH_PORTS.agent}/runs
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**Durable runs.** Every node's result is a LangGraph checkpoint, written to \`agent/.data/checkpoints.json\`. Kill the agent in
the middle of a run and Flisk starts it again; it resumes the run at the node it was in, and finished nodes do not run again.
Try it with \`STEP_DELAY_MS=2000 flisk up\`, then \`kill -9\` the agent mid-run. For production, swap \`FileSaver\` for
\`@langchain/langgraph-checkpoint-postgres\`.

**Retries.** A node that throws (the tool server is restarting, say) is retried by LangGraph's \`retryPolicy\`: up to
\`MAX_ATTEMPTS\` (5) times, starting \`RETRY_BACKOFF_MS\` (1 s) apart and doubling.

**Planning with Claude.** Out of the box the plan node splits the goal with rules, so it works offline and costs nothing:
that part is a demo. Set \`ANTHROPIC_API_KEY\` and it asks \`claude-opus-5-5\` for the topics instead (\`agent/plan.mjs\`), and
falls back to the rules if the call fails. \`GET /runs\` shows which planner ran.
`;

/** Writes the LangGraph project into `dir`. */
export function writeLanggraphProject(
  dir: string,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const files: Record<string, string> = {
    "README.md": README,
    ".gitignore": ".data/\nnode_modules/\n",
  };
  for (const [target, source] of Object.entries(TEMPLATE_FILES))
    files[target] = readTemplate(source);
  for (const [name, manifest] of Object.entries(langgraphManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}
