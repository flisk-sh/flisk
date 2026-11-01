// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The tool-loop starter's files, manifests and mock model. The agent needs `npm install`, so the real SDK loop is tested live
// in tests/e2e/journeys/agent-templates K1-K4.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isOneShotJob } from "../native-runtime.js";
import { toolLoopManifests, writeToolLoopProject } from "../tool-loop-template.js";

const templates = resolve(dirname(fileURLToPath(import.meta.url)), "../../../templates");
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("tool-loop template", () => {
  it("points the agent at the local mock model and waits for setup, tools and model", () => {
    const manifests = toolLoopManifests();
    expect(isOneShotJob(manifests["setup/service.json"] as never)).toBe(true);
    const agent = manifests["agent/service.json"];
    expect(agent?.dependsOn).toEqual(["setup", "tools", "model"]);
    expect(agent?.env).toMatchObject({ ANTHROPIC_BASE_URL: "http://localhost:4502" });
  });

  it("reuses the super-agent's MCP tool server and pins the SDK", () => {
    const dir = mkdtempSync(join(tmpdir(), "tool-loop-"));
    dirs.push(dir);
    writeToolLoopProject(dir);
    expect(readFileSync(join(dir, "tools/server.mjs"), "utf-8")).toBe(
      readFileSync(join(templates, "super-agent/tools/server.mjs"), "utf-8"),
    );
    const pkg = JSON.parse(readFileSync(join(dir, "agent/package.json"), "utf-8"));
    expect(pkg.dependencies).toEqual({ "@anthropic-ai/sdk": "0.135.0" });
    // A bare deep import has no extension, which Node's ESM loader does not add for a package without an exports map.
    expect(readFileSync(join(dir, "agent/server.mjs"), "utf-8")).toContain(
      'from "@anthropic-ai/sdk/helpers/beta/json-schema.mjs"',
    );
  });
});

describe("tool-loop mock model", () => {
  const load = async () =>
    (await import(pathToFileURL(join(templates, "tool-loop/model/server.mjs")).href)) as {
      reply: (body: unknown) => {
        content: { type: string; name?: string; input?: unknown; text?: string }[];
        stop_reason: string;
      };
    };

  it("calls lookup once per topic, then answers from the tool results", async () => {
    const { reply } = await load();
    const first = reply({ messages: [{ role: "user", content: "what is mcp and flisk" }] });
    expect(first.stop_reason).toBe("tool_use");
    expect(first.content.map((b) => b.input)).toEqual([
      { topic: "what is mcp" },
      { topic: "flisk" },
    ]);
    const second = reply({
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: first.content },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "a", content: "note one" },
            {
              type: "tool_result",
              tool_use_id: "b",
              content: [{ type: "text", text: "note two" }],
            },
          ],
        },
      ],
    });
    expect(second).toEqual({
      content: [{ type: "text", text: "note one\nnote two" }],
      stop_reason: "end_turn",
    });
  });
});
