// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getStackEmoji } from "../constants.js";

describe("getStackEmoji", () => {
  it.each([
    ["infra", "🏗️"],
    ["core", "🔧"],
    ["api", "⚡"],
    ["app", "🎨"],
    ["orchestrator", "⚙️"],
  ])("returns the configured emoji for %s", (stackName, emoji) => {
    expect(getStackEmoji(stackName)).toBe(emoji);
  });

  it("matches case-insensitively", () => {
    expect(getStackEmoji("API")).toBe("⚡");
    expect(getStackEmoji("OrChEsTrAtOr")).toBe("⚙️");
  });

  it("matches a keyword embedded in a longer stack name", () => {
    expect(getStackEmoji("payments-api")).toBe("⚡");
  });

  it("returns the package fallback for an unrecognized stack name", () => {
    expect(getStackEmoji("mystery-stack")).toBe("📦");
  });
});
