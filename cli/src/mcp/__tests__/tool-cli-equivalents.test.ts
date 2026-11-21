// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseEnvelope, runFlisk } from "../../test-support/index.js";
import { createFliskTools, MCP_CLI_EQUIVALENTS } from "../tools.js";

describe("MCP tools name their CLI equivalents (#4258)", () => {
  const tools = createFliskTools();

  it("gives every MCP tool a CLI equivalent", () => {
    const names = tools.map((tool) => tool.name);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(MCP_CLI_EQUIVALENTS, `${name} has a CLI mapping`).toHaveProperty(name);
      expect(MCP_CLI_EQUIVALENTS[name]).toMatch(/^flisk\s+\S/);
    }
  });

  it("advertises the exact equivalent in every tools/list description", () => {
    for (const tool of tools) {
      const equivalent = MCP_CLI_EQUIVALENTS[tool.name];
      expect(tool.description, `${tool.name} description`).toContain(
        `CLI equivalent: \`${equivalent}\`.`,
      );
    }
  });

  it("has no stale mappings for tools that no longer exist", () => {
    const names = new Set(tools.map((tool) => tool.name));
    for (const name of Object.keys(MCP_CLI_EQUIVALENTS)) {
      expect(names.has(name), `${name} is still an MCP tool`).toBe(true);
    }
  });

  it("gives a JSON hint for `flisk network list` instead of a plain-text error", () => {
    const result = runFlisk(["network", "list", "--json"], { cwd: process.cwd() });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const envelope = parseEnvelope(result.stdout);
    expect((envelope.errors[0] as { suggestions?: string[] }).suggestions).toEqual([
      "Did you mean networks?",
    ]);
  });
});
