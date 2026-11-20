// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: service.json env values are Compose-style variable references
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";

/**
 * The tool-loop starter: the plain agent loop (the Anthropic SDK's tool runner) over the super-agent's MCP tool server, a
 * local mock of the Messages API so it runs offline, and a one-shot job that installs the SDK. All local processes.
 */
export const TOOL_LOOP_PORTS = { agent: 4500, tools: 4501, model: 4502 } as const;

/** Project path -> template path. The tool server is the super-agent starter's, so it is not copied. */
const TEMPLATE_FILES: Record<string, string> = {
  "agent/package.json": "tool-loop/agent/package.json",
  "agent/server.mjs": "tool-loop/agent/server.mjs",
  "agent/guard.mjs": "tool-loop/agent/guard.mjs",
  "model/server.mjs": "tool-loop/model/server.mjs",
  "tools/server.mjs": "super-agent/tools/server.mjs",
};

/** The service.json of each service, keyed by its path in the project folder. */
export function toolLoopManifests(): Record<string, Record<string, unknown>> {
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
      port: TOOL_LOOP_PORTS.tools,
      healthCheckPath: "/health",
    },
    "model/service.json": {
      schemaVersion: 1,
      appName: "model",
      appType: "backend",
      command: "node server.mjs",
      port: TOOL_LOOP_PORTS.model,
      healthCheckPath: "/health",
    },
    "agent/service.json": {
      schemaVersion: 1,
      appName: "agent",
      appType: "backend",
      command: "node server.mjs",
      port: TOOL_LOOP_PORTS.agent,
      healthCheckPath: "/health",
      env: {
        TOOLS_URL: `http://localhost:${TOOL_LOOP_PORTS.tools}`,
        // Every model choice lives in the environment, so an env file or profile switches models without template edits.
        // With no base URL set, the agent uses the local mock model and its placeholder key.
        MODEL: "${MODEL:-claude-opus-5-5}",
        OPENAI_BASE_URL: "${OPENAI_BASE_URL:-}",
        OPENAI_API_KEY: "${OPENAI_API_KEY:-}",
        ANTHROPIC_BASE_URL: `\${ANTHROPIC_BASE_URL:-http://localhost:${TOOL_LOOP_PORTS.model}}`,
        ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-mock-model-no-key-needed}",
      },
      dependsOn: ["setup", "tools", "model"],
    },
  };
}

const README = `# Flisk tool loop

The agent loop every framework wraps, with nothing hidden: a model asks for tools, the loop runs them, feeds the results back,
and stops when the model answers. The tools come from an MCP tool server (\`tools/\`), found
through \`tools/list\`. Everything runs as local processes: no Docker. \`flisk up\` first runs \`setup\`, which installs the
SDK (\`agent/package.json\`, pinned).

\`\`\`bash
flisk up
curl -X POST localhost:${TOOL_LOOP_PORTS.agent}/ask -H 'content-type: application/json' -d '{"question":"what is mcp and flisk"}'
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**The model is a mock out of the box.** \`model/\` stands in for the Messages API with one fixed strategy (look up each topic,
then answer from the results), so the real loop runs offline and costs nothing. It is not a model. Every model choice lives in
the environment, so an env file or profile switches models without editing these files:

- **Anthropic-compatible:** set \`MODEL\` (default \`claude-opus-5-5\`), \`ANTHROPIC_BASE_URL\` (default \`http://localhost:${TOOL_LOOP_PORTS.model}\`)
  and \`ANTHROPIC_API_KEY\`. For Claude, set \`ANTHROPIC_BASE_URL\` to \`https://api.anthropic.com\` and put your key in \`.env\`.
- **OpenAI-compatible** (Ollama, vLLM, OpenRouter): set \`MODEL\` and \`OPENAI_BASE_URL\` (ending in \`/v1\`, such as the
  \`OPENAI_BASE_URL\` an \`inference\` resource provides) and \`OPENAI_API_KEY\` when the server needs one. The agent calls
  \`/chat/completions\` and runs the tools the model asks for.

With neither base URL set, the mock is used and no key is needed. Keep keys in \`.env\`, not in \`service.json\`.

**Recovery.** The SDK retries a request whose connection failed (\`maxRetries: 4\`), and the agent retries a tool server call
with backoff, so a model or tool server that Flisk is restarting is waited for.
`;

/** Writes the tool-loop project into `dir`. */
export function writeToolLoopProject(
  dir: string,
  readTemplate: (name: string) => string = loadTemplate,
): void {
  const files: Record<string, string> = { "README.md": README, ".gitignore": "node_modules/\n" };
  for (const [target, source] of Object.entries(TEMPLATE_FILES))
    files[target] = readTemplate(source);
  for (const [name, manifest] of Object.entries(toolLoopManifests())) {
    files[name] = `${JSON.stringify(manifest, null, 2)}\n`;
  }
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}
