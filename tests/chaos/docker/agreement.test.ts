// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { validateDockerfileSyntax, validateOciImageReference } from "./static-validate.js";
import { FRONTEND_VARIANTS, VARIANTS } from "./variants.js";

describe("variant list agreement between tiers", () => {
  it("backend variants catalog is non-empty and has unique IDs", () => {
    expect(VARIANTS.length).toBeGreaterThan(100);
    const ids = VARIANTS.map((v) => v.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("frontend variants catalog is non-empty and has unique IDs", () => {
    expect(FRONTEND_VARIANTS.length).toBeGreaterThan(30);
    const ids = FRONTEND_VARIANTS.map((v) => v.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every variant defines patch and an expect of accept or reject", () => {
    for (const v of [...VARIANTS, ...FRONTEND_VARIANTS]) {
      expect(v.id).toBeTypeOf("string");
      expect(v.patch).toBeTypeOf("object");
      expect(["accept", "reject"]).toContain(v.expect);
    }
  });

  it("static validators correctly check OCI references and Dockerfile syntax", () => {
    expect(validateOciImageReference("nginx:1.27")).toBe(true);
    expect(validateOciImageReference("ghcr.io/acme/app:1.2.3")).toBe(true);
    expect(validateOciImageReference("Nginx:1.27")).toBe(false);
    expect(validateOciImageReference("has space:latest")).toBe(false);

    expect(validateDockerfileSyntax("FROM oven/bun:alpine\nRUN echo 1").valid).toBe(true);
    expect(validateDockerfileSyntax("# comment only\nRUN echo 1").valid).toBe(false);
  });
});
