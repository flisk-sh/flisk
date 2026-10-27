// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getStackEmoji, UNPINNED_DEPENDENCY_VERSIONS } from "../constants.js";

describe("UNPINNED_DEPENDENCY_VERSIONS", () => {
  // Adding a pin or an unpinned entry should be a deliberate change:
  // unpinned versions allow floating/breaking dependencies during installs.
  it("matches the exact set of allowed unpinned dependency specifiers", () => {
    expect(UNPINNED_DEPENDENCY_VERSIONS).toEqual(new Set(["latest", "*"]));
    expect(UNPINNED_DEPENDENCY_VERSIONS.has("latest")).toBe(true);
    expect(UNPINNED_DEPENDENCY_VERSIONS.has("*")).toBe(true);
    expect(UNPINNED_DEPENDENCY_VERSIONS.size).toBe(2);
  });
});

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
