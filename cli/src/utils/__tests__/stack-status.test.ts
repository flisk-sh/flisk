// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { deriveStackStatus } from "../stack-status.js";

describe("deriveStackStatus", () => {
  it("is unknown for a stack with no services", () => {
    expect(deriveStackStatus([])).toBe("unknown");
  });

  it("is unknown, not error, when no service has been checked", () => {
    expect(deriveStackStatus(["unknown", "unknown"])).toBe("unknown");
  });

  it("is healthy when nearly every service is ready", () => {
    expect(deriveStackStatus(["ready", "ready", "ready"])).toBe("healthy");
  });

  it("is degraded when most services are ready", () => {
    expect(deriveStackStatus(["ready", "ready", "pending"])).toBe("degraded");
  });

  it("is error when most services are not ready", () => {
    expect(deriveStackStatus(["error", "pending", "ready"])).toBe("error");
    expect(deriveStackStatus(["error"])).toBe("error");
  });

  it("still counts unchecked services as not ready once any status is known", () => {
    expect(deriveStackStatus(["ready", "unknown", "unknown"])).toBe("error");
  });
});
