// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import * as mcpCheck from "../mcp-check.js";

describe("mcp-check.ts public surface", () => {
  it("still exports everything it exported before it was split into modules", () => {
    expect(Object.keys(mcpCheck).sort()).toEqual([
      "buildPromptArguments",
      "buildSampleArguments",
      "iconUrlFor",
      "isFinalNetworkError",
      "parseRpcBody",
      "runMcpCheck",
      "sampleValue",
    ]);
  });
});