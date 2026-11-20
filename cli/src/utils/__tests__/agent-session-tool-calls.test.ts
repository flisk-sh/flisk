// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  formatAgentToolCalls,
  parseAgentToolCalls,
  TOOL_CALL_PREVIEW_CHARS,
  truncateToolPreview,
} from "../agent-sessions.js";

describe("GET /session toolCalls schema", () => {
  it("accepts one tool-call list per turn and truncates args and results", () => {
    const longArgs = { topic: "x".repeat(TOOL_CALL_PREVIEW_CHARS * 2) };
    const parsed = parseAgentToolCalls({
      sessionId: "s1",
      messages: [{ role: "user" }],
      toolCalls: [
        [
          {
            name: "lookup",
            args: longArgs,
            resultSummary: "y".repeat(TOOL_CALL_PREVIEW_CHARS + 50),
            ok: true,
            ms: 12.5,
          },
        ],
        [],
      ],
    });

    expect(parsed).not.toBeNull();
    expect(parsed).toHaveLength(2);
    const call = parsed?.[0]?.[0];
    expect(call?.name).toBe("lookup");
    expect(call?.ok).toBe(true);
    expect(call?.ms).toBe(12.5);
    expect(call?.args).toHaveLength(TOOL_CALL_PREVIEW_CHARS);
    expect(call?.args.endsWith("...")).toBe(true);
    expect(call?.resultSummary).toHaveLength(TOOL_CALL_PREVIEW_CHARS);
    expect(call?.resultSummary.endsWith("...")).toBe(true);
    expect(parsed?.[1]).toEqual([]);
  });

  it("reports an absent field as null, but an empty list as reported", () => {
    expect(parseAgentToolCalls({ messages: [] })).toBeNull();
    expect(parseAgentToolCalls({ toolCalls: "nope" })).toBeNull();
    expect(parseAgentToolCalls({ toolCalls: [] })).toEqual([]);
  });

  it("drops malformed calls and turns instead of printing unusable rows", () => {
    expect(
      parseAgentToolCalls({
        toolCalls: [
          "not-a-turn",
          [{ name: "", args: {}, resultSummary: "", ok: true, ms: 1 }],
          [{ name: "ok", args: {}, resultSummary: "", ok: false, ms: 0.4 }],
        ],
      }),
    ).toEqual([[], [], [{ name: "ok", args: "{}", resultSummary: "", ok: false, ms: 0.4 }]]);
  });

  it("serializes non-string previews as JSON", () => {
    expect(truncateToolPreview({ topic: "flisk" })).toBe('{"topic":"flisk"}');
  });
});

describe("session view tool-call printing", () => {
  it("prints the turn's calls, including a failed one", () => {
    const lines = formatAgentToolCalls({
      toolCalls: [
        [
          { name: "lookup", args: { topic: "mcp" }, resultSummary: "MCP docs", ok: true, ms: 12 },
          { name: "save", args: {}, resultSummary: "disk full", ok: false, ms: 3 },
        ],
      ],
    });
    expect(lines).toEqual([
      "Tool calls:",
      "  Turn 1:",
      "    - ok lookup (12 ms)",
      '      args: {"topic":"mcp"}',
      "      result: MCP docs",
      "    - failed save (3 ms)",
      "      args: {}",
      "      result: disk full",
    ]);
  });

  it("prints 'not reported' when an agent omits toolCalls", () => {
    expect(formatAgentToolCalls({ sessionId: "s1", messages: [] })).toEqual([
      "Tool calls: not reported",
    ]);
  });

  it("truncates a hostile agent's long strings in the printed view too", () => {
    const lines = formatAgentToolCalls({
      toolCalls: [
        [
          {
            name: "lookup",
            args: "a".repeat(TOOL_CALL_PREVIEW_CHARS + 20),
            resultSummary: "b".repeat(TOOL_CALL_PREVIEW_CHARS + 20),
            ok: true,
            ms: 1,
          },
        ],
      ],
    });
    const joined = lines.join("\n");
    expect(joined).toContain(`${"a".repeat(TOOL_CALL_PREVIEW_CHARS - 3)}...`);
    expect(joined).toContain(`${"b".repeat(TOOL_CALL_PREVIEW_CHARS - 3)}...`);
    expect(joined).not.toContain(`${"a".repeat(TOOL_CALL_PREVIEW_CHARS + 1)}`);
  });
});
