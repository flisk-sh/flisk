// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";

/**
 * The super-agent starter: a planner, an MCP tool server and three sub-agents (researcher, writer, checker), all local
 * processes (no Docker). The planner plans with rules, or with Claude when ANTHROPIC_API_KEY is set.
 */
export const SUPER_AGENT_PORTS = {
  planner: 4300,
  tools: 4301,
  researcher: 4302,
  writer: 4303,
  checker: 4304,
} as const;

const TEMPLATE_FILES = [
  "lib/agent.mjs",
  "planner/server.mjs",
  "planner/plan.mjs",
  "planner/package.json",
  "tools/server.mjs",
  "researcher/server.mjs",
  "writer/server.mjs",
  "checker/server.mjs",
] as const;

const SUB_AGENTS = ["researcher", "writer", "checker"] as const;

/** The service.json of each service, keyed by its path in the project folder. */
export function superAgentManifests(): Record<string, Record<string, unknown>> {
  const plannerUrl = `http://localhost:${SUPER_AGENT_PORTS.planner}`;
  const toolsUrl = `http://localhost:${SUPER_AGENT_PORTS.tools}`;
  const manifests: Record<string, Record<string, unknown>> = {
    "planner/service.json": {
      schemaVersion: 1,
      appName: "planner",
      appType: "backend",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS.planner,
      healthCheckPath: "/health",
    },
    "tools/service.json": {
      schemaVersion: 1,
      appName: "tools",
      appType: "mcp",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS.tools,
      healthCheckPath: "/health",
    },
  };
  for (const name of SUB_AGENTS) {
    manifests[`${name}/service.json`] = {
      schemaVersion: 1,
      appName: name,
      appType: "worker",
      command: "node server.mjs",
      port: SUPER_AGENT_PORTS[name],
      healthCheckPath: "/health",
      env: { AGENT_NAME: name, PLANNER_URL: plannerUrl, TOOLS_URL: toolsUrl },
      dependsOn: ["planner", "tools"],
    };
  }
  return manifests;
}

const README = `# Flisk super agent

A planner turns a goal into steps: research each topic, write the answer, check it. Three sub-agents pull the steps:
the researcher calls the \`lookup\` tool on an MCP tool server, the writer composes the answer, and the checker sends back
research that came back empty. Everything runs as local processes: no Docker.

\`\`\`bash
flisk up
curl -X POST localhost:${SUPER_AGENT_PORTS.planner}/goals -H 'content-type: application/json' \\
  -d '{"goal":"Explain flisk and mcp and retries"}'
curl localhost:${SUPER_AGENT_PORTS.planner}/goals
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**Planning with Claude.** Out of the box the planner splits the goal with rules, so it works offline and costs nothing:
that part is a demo. To have Claude plan, run \`npm install\` in \`planner/\` and set \`ANTHROPIC_API_KEY\`; the planner then
asks \`claude-opus-5-5\` for the topics, and falls back to the rules if the call fails. \`GET /goals\` shows which planner ran.

**Recovery.** A sub-agent that dies or hangs loses its claim after \`CLAIM_MS\` (15 s) and the step is retried; a step that
fails \`MAX_ATTEMPTS\` (3) times fails its goal. The checker may send work back \`MAX_REVISIONS\` (2) times. The planner saves
its goals to \`planner/.data/\`, so a crash and restart loses nothing. Try \`BAD_RATE=0.5\` in the researcher's \`env\`.

Add tools in \`tools/server.mjs\`, and replace the work functions in \`researcher/\`, \`writer/\` and \`checker/\` with model calls.
`;

/** Writes the super-agent project into `dir`. */
export function writeSuperAgentProject(
  dir: string,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const files: Record<string, string> = {
    "README.md": README,
    ".gitignore": ".data/\nnode_modules/\n",
  };
  for (const name of TEMPLATE_FILES) files[name] = readTemplate(`super-agent/${name}`);
  for (const [name, manifest] of Object.entries(superAgentManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}
