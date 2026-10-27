// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiBaseUrl, frontendBaseUrl } from "../constants.js";

beforeEach(() => {
  vi.stubEnv("FLISK_SERVICE_BASE_URL", undefined);
  vi.stubEnv("FLISK_PUBLIC_HOST", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("frontendBaseUrl", () => {
  it("combines the app subdomain with the service base URL hostname", () => {
    vi.stubEnv("FLISK_SERVICE_BASE_URL", "https://dev.example.test:8443/app");

    expect(frontendBaseUrl()).toBe("http://app.dev.example.test");
  });
});

describe("apiBaseUrl", () => {
  it("combines the API subdomain with the public host and requested protocol", () => {
    vi.stubEnv("FLISK_PUBLIC_HOST", "edge.example.test");

    expect(apiBaseUrl("https")).toBe("https://api.edge.example.test");
  });
});
