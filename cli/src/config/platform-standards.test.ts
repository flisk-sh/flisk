// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { PLATFORM_STANDARDS } from "./platform-standards.js";

describe("platform standards", () => {
  it("keeps the low-level Traefik host generic and uses a non-privileged port", () => {
    expect(PLATFORM_STANDARDS.traefik.defaultHost).toBe("localhost");
    expect(PLATFORM_STANDARDS.traefik.appHost).toBe("app.localhost");
    expect(PLATFORM_STANDARDS.traefik.apiHost).toBe("api.localhost");
    expect(PLATFORM_STANDARDS.traefik.defaultPort).toBe(8080);
  });
});
