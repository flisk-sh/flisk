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
});
