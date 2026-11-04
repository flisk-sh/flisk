// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadTemplate } from "../generator/template-engine.js";
/**
 * The tool-loop starter: the plain agent loop (the Anthropic SDK's tool runner) over the super-agent's MCP tool server, a
 * local mock of the Messages API so it runs offline, and a one-shot job that installs the SDK. All local processes.
 */
export const TOOL_LOOP_PORTS = { agent: 4500, tools: 4501, model: 4502 };
/** Project path -> template path. The tool server is the super-agent starter's, so it is not copied. */
const TEMPLATE_FILES = {
    "agent/package.json": "tool-loop/agent/package.json",
    "agent/server.mjs": "tool-loop/agent/server.mjs",
    "model/server.mjs": "tool-loop/model/server.mjs",
    "tools/server.mjs": "super-agent/tools/server.mjs",
};
/** The service.json of each service, keyed by its path in the project folder. */
export function toolLoopManifests() {
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
                // The local mock model. Delete these two lines and set a real ANTHROPIC_API_KEY in .env to use Claude.
                ANTHROPIC_BASE_URL: `http://localhost:${TOOL_LOOP_PORTS.model}`,
                ANTHROPIC_API_KEY: "mock-model-no-key-needed",
            },
            dependsOn: ["setup", "tools", "model"],
        },
    };
}
const README = `# Flisk tool loop

The agent loop every framework wraps, with nothing hidden: the Anthropic SDK's tool runner asks the model, runs the tools it
calls, feeds the results back, and stops when the model answers. The tools come from an MCP tool server (\`tools/\`), found
through \`tools/list\`. Everything runs as local processes: no Docker. \`flisk up\` first runs \`setup\`, which installs the
SDK (\`agent/package.json\`, pinned).

\`\`\`bash
flisk up
curl -X POST localhost:${TOOL_LOOP_PORTS.agent}/ask -H 'content-type: application/json' -d '{"question":"what is mcp and flisk"}'
flisk mcp check tools --call --no-icon   # the tool server speaks MCP
\`\`\`

**The model is a mock out of the box.** \`model/\` stands in for the Messages API with one fixed strategy (look up each topic,
then answer from the results), so the real SDK loop runs offline and costs nothing. It is not a model. To use Claude, delete
\`ANTHROPIC_BASE_URL\` and \`ANTHROPIC_API_KEY\` from \`agent/service.json\`, put your key in \`.env\` as \`ANTHROPIC_API_KEY\`,
and run \`flisk up\` again; the agent asks \`claude-opus-5-5\`, with server-side refusal fallbacks.

**Recovery.** The SDK retries a request whose connection failed (\`maxRetries: 4\`), and the agent retries a tool server call
with backoff, so a model or tool server that Flisk is restarting is waited for.
`;
/** Writes the tool-loop project into `dir`. */
export function writeToolLoopProject(dir, readTemplate = loadTemplate) {
    const files = { "README.md": README, ".gitignore": "node_modules/\n" };
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
