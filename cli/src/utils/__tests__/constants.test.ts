// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_DOMAIN_DEFAULT,
  getBaseDomain,
  getStackEmoji,
  UNPINNED_DEPENDENCY_VERSIONS,
} from "../constants.js";

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

describe("getBaseDomain", () => {
  beforeEach(() => {
    vi.stubEnv("FLISK_SERVICE_BASE_URL", undefined);
    vi.stubEnv("FLISK_PUBLIC_HOST", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns BASE_DOMAIN_DEFAULT when no override is set", () => {
    expect(getBaseDomain()).toBe(BASE_DOMAIN_DEFAULT);
  });

  it("returns the hostname of a FLISK_SERVICE_BASE_URL override", () => {
    vi.stubEnv("FLISK_SERVICE_BASE_URL", "https://dev.example.test:8443/app");
    expect(getBaseDomain()).toBe("dev.example.test");
  });

  it("returns a bare FLISK_PUBLIC_HOST override as the domain", () => {
    vi.stubEnv("FLISK_PUBLIC_HOST", "box.example.test");
    expect(getBaseDomain()).toBe("box.example.test");
  });
});
