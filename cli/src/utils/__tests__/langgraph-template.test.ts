// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The LangGraph starter's files and manifests. Its graph needs `npm install`, so the run itself (the real LangGraph runtime,
// checkpoints, retries, kill -9 recovery) is tested live in tests/e2e/journeys/agent-templates L1-L5.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { langgraphManifests, writeLanggraphProject } from "../langgraph-template.js";
import { isOneShotJob } from "../native-runtime.js";

const templates = resolve(dirname(fileURLToPath(import.meta.url)), "../../../templates");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "langgraph-"));
  dirs.push(dir);
  writeLanggraphProject(dir);
  return dir;
}

describe("langgraph template", () => {
  it("installs with a one-shot setup job that the agent waits for", () => {
    const manifests = langgraphManifests();
    expect(Object.keys(manifests)).toEqual([
      "setup/service.json",
      "tools/service.json",
      "agent/service.json",
    ]);
    const setup = manifests["setup/service.json"];
    expect(isOneShotJob(setup as never)).toBe(true);
    expect(setup).not.toHaveProperty("port");
    expect(setup?.command).toBe("cd ../agent && npm install --no-audit --no-fund");
    expect(manifests["agent/service.json"]?.dependsOn).toEqual(["setup", "tools"]);
    expect(manifests["tools/service.json"]?.appType).toBe("mcp");
  });

  it("reuses the super-agent's planner and MCP tool server instead of copying them", () => {
    const dir = project();
    expect(readFileSync(join(dir, "agent/plan.mjs"), "utf-8")).toBe(
      readFileSync(join(templates, "super-agent/planner/plan.mjs"), "utf-8"),
    );
    expect(readFileSync(join(dir, "tools/server.mjs"), "utf-8")).toBe(
      readFileSync(join(templates, "super-agent/tools/server.mjs"), "utf-8"),
    );
  });

  it("pins every package to an exact version, so a new release cannot change what a fresh project installs", () => {
    const pkg = JSON.parse(readFileSync(join(project(), "agent/package.json"), "utf-8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      "@anthropic-ai/sdk",
      "@langchain/core",
      "@langchain/langgraph",
      "@langchain/langgraph-checkpoint-postgres",
      "pg",
      "zod",
    ]);
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("writes the graph, its checkpointer and the server, and ignores the checkpoints and packages", () => {
    const dir = project();
    const graph = readFileSync(join(dir, "agent/graph.mjs"), "utf-8");
    expect(graph).toContain('from "@langchain/langgraph"');
    expect(graph).toContain("retryPolicy");
    expect(readFileSync(join(dir, "agent/file-saver.mjs"), "utf-8")).toContain(
      "extends MemorySaver",
    );
    expect(readFileSync(join(dir, ".gitignore"), "utf-8")).toBe(".data/\nnode_modules/\n");
  });
  it("writes the effect store next to the graph, so the project has everything the server imports", () => {
    const dir = project();
    expect(readFileSync(join(dir, "agent/effects.mjs"), "utf-8")).toContain(
      "export async function once(",
    );
    const server = readFileSync(join(dir, "agent/server.mjs"), "utf-8");
    for (const imported of server.matchAll(/from "\.\/([\w-]+\.mjs)"/g)) {
      expect(() => readFileSync(join(dir, "agent", imported[1] as string), "utf-8")).not.toThrow();
    }
  });

  it("stops the run for a human with interrupt() before the side effect, and only runs it when approved", () => {
    const graph = readFileSync(join(templates, "langgraph/agent/graph.mjs"), "utf-8");
    expect(graph).toContain("interrupt,");
    expect(graph).toContain("const decision = interrupt(");
    expect(graph).toContain('.addNode("approve", approveNode)');
    expect(graph).toContain('.addNode("act", actNode)');
    // the approval is opt-in, so a run without it keeps the four-node trace
    expect(graph).toContain('return state.needsApproval ? "approve" : END;');
    expect(graph).toContain('return state.approval?.approved ? "act" : END;');
    // the side effect is keyed by the run and goes through the effect store and the receiver
    expect(graph).toContain(`\`\${config.configurable.thread_id}:send\``);
    expect(graph).toContain("once(effects, key, (k) => deliver(outbox, k,");
  });

  it("continues a waiting run with POST /runs/:id/resume, and answers a run that is not waiting with 409", () => {
    const server = readFileSync(join(templates, "langgraph/agent/server.mjs"), "utf-8");
    expect(server).toContain(String.raw`/^\/runs\/([^/]+)\/resume$/`);
    expect(server).toContain("new Command({ resume:");
    expect(server).toContain('run.status = asked ? "awaiting_approval" : "done"');
    expect(server).toContain('run.status !== "awaiting_approval"');
    expect(server).toContain("json(response, 409");
    expect(server).toContain("json(response, 404");
  });

  it("uses the Postgres checkpointer and effect table when DATABASE_URL is set, and files otherwise", () => {
    const server = readFileSync(join(templates, "langgraph/agent/server.mjs"), "utf-8");
    expect(server).toContain("if (!process.env.DATABASE_URL)");
    expect(server).toContain("PostgresSaver.fromConnString(process.env.DATABASE_URL)");
    expect(server).toContain("await checkpointer.setup();");
    expect(server).toContain("new FileSaver(");
    expect(server).toContain("new PostgresEffects(");
  });

  it("explains the approval flow in the project's README", () => {
    const readme = readFileSync(join(project(), "README.md"), "utf-8");
    expect(readme).toContain("POST /runs/:id/resume");
    expect(readme).toContain('"approve":true');
    expect(readme).toContain("flisk restart agent");
    expect(readme).toContain("agent/.data/outbox.jsonl");
    // the shell example keeps its line breaks
    expect(readme).toContain(
      '-H \'content-type: application/json\' \\\n  -d \'{"goal":"Explain flisk and mcp","approve":true}\'',
    );
  });

  it("keeps error details in the agent's log instead of sending them to the caller", () => {
    const server = readFileSync(join(templates, "langgraph/agent/server.mjs"), "utf-8");
    expect(server).toContain("console.error(error);");
    expect(server).not.toMatch(/(json\(response, 502|run\.error =).*error\.message/);
  });
});
