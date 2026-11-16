// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { FliskError } from "../../utils/errors.js";
import { parseResourceType } from "../resource.js";

/** The suggestions `parseResourceType` attaches when it refuses `type`. */
function suggestions(type: string): string[] {
  try {
    parseResourceType(type);
  } catch (error) {
    return (error as FliskError).suggestions;
  }
  throw new Error(`${type} should have been rejected`);
}

describe("parseResourceType suggestions", () => {
  it("suggests the closest supported type for a near miss", () => {
    expect(suggestions("bakend")).toContain('Did you mean "backend"?');
  });

  it("prints no suggestion for a type with no close match", () => {
    expect(suggestions("zzzz").some((line) => line.startsWith("Did you mean"))).toBe(false);
  });

  it("keeps the supported list and the exit code", () => {
    const error = (() => {
      try {
        parseResourceType("bakend");
      } catch (caught) {
        return caught as FliskError;
      }
      throw new Error("bakend should have been rejected");
    })();
    expect(error.message).toMatch(/Unknown resource type "bakend"\. Supported types: backend/);
    expect(error.exitCode).toBe(1);
  });
});
