// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from "vitest";
import { pathDelimiter } from "../platform.js";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
const originalPlatformValue = process.platform;

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
}

afterEach(() => {
  if (originalPlatform) {
    Object.defineProperty(process, "platform", originalPlatform);
  }
  expect(process.platform).toBe(originalPlatformValue);
});

describe("pathDelimiter", () => {
  it.each([
    ["linux", ":"],
    ["darwin", ":"],
    ["win32", ";"],
  ] as const)("uses %s PATH separator", (platform, expected) => {
    stubPlatform(platform);

    expect(pathDelimiter()).toBe(expected);
  });
});
