// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { resolveToolPolicy } from "../policy.js";
import { createMcpServer, type McpToolPolicy } from "../server.js";
import { createFliskTools } from "../tools.js";

const TOOLS_LIST_BUDGET_BYTES = 12 * 1024;

const tools = createFliskTools(async () => ({ exitCode: 0, stdout: "", stderr: "" }));

async function listedTools(policy: McpToolPolicy | null = null) {
  const server = createMcpServer(tools, { name: "flisk", version: "1" }, policy);
  const line = await server.handleLine(
    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  );
  return (
    JSON.parse(line ?? "null") as {
      result: { tools: Array<{ name: string; description: string }> };
    }
  ).result.tools;
}

describe("MCP tools/list budget", () => {
  it("keeps the default tools/list result under 12 KB", async () => {
    const listed = await listedTools();
    expect(listed).toHaveLength(tools.length);
    expect(Buffer.byteLength(JSON.stringify(listed))).toBeLessThan(TOOLS_LIST_BUDGET_BYTES);
  });

  it("publishes one short sentence per tool description", async () => {
    const listed = await listedTools();
    for (const tool of listed) {
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(160);
      expect(tool.description, tool.name).not.toMatch(/[\r\n]/);
      expect(tool.description, tool.name).not.toMatch(/[.!?]\s+[A-Z]/);
    }
  });

  it("publishes exactly the tools named by --tools", async () => {
    const policy = resolveToolPolicy(tools, { tools: "logs, status, up" }, {});
    const names = (await listedTools(policy)).map((tool) => tool.name);
    expect(names).toHaveLength(3);
    expect(new Set(names)).toEqual(new Set(["status", "up", "logs"]));
  });

  it("rejects an unknown tool name with the available names", () => {
    expect(() => resolveToolPolicy(tools, { tools: "nope" }, {})).toThrow(
      /Unknown MCP tool in the allowlist: nope/,
    );
    let error: unknown;
    try {
      resolveToolPolicy(tools, { tools: "nope" }, {});
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      suggestions: [expect.stringContaining("Available tools:")],
    });
  });

  it("publishes the minimal profile from the flag or the environment", async () => {
    for (const policy of [
      resolveToolPolicy(tools, { profile: "minimal" }, {}),
      resolveToolPolicy(tools, {}, { FLISK_MCP_PROFILE: "minimal" }),
    ]) {
      expect(new Set((await listedTools(policy)).map((tool) => tool.name))).toEqual(
        new Set(["status", "up", "logs"]),
      );
    }
  });

  it("rejects an unknown tool profile with the available profiles", () => {
    expect(() => resolveToolPolicy(tools, { profile: "tiny" }, {})).toThrow(
      /Unknown MCP tool profile: tiny/,
    );
    expect(() => resolveToolPolicy(tools, { profile: "tiny" }, {})).toThrow(
      /Available profiles: minimal/,
    );
  });
});
