// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getCustomAgentIndexTemplate } from "./custom.js";

// Pull the body of `async close()` out of the generated postgres index so the assertions read the real output.
function closeBody(source: string): string {
  const start = source.indexOf("async close()");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n  },", start);
  return source.slice(start, end);
}

describe("custom agent runtime: postgres close()", () => {
  const close = closeBody(getCustomAgentIndexTemplate("agent", "postgres"));

  it("logs a failed client.end() instead of swallowing it", () => {
    expect(close).toContain("client.end()");
    expect(close).toContain("console.warn");
    expect(close).not.toMatch(/catch\s*\{\s*\}/);
  });

  it("clears the client even when end() fails", () => {
    const tail = close.slice(close.indexOf("catch"));
    expect(tail).toContain("client = null;");
  });
});
