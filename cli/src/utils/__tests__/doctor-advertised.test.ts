// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import { summarizeAdvertisedProbes } from "../doctor-runtime.js";
import { buildAdvertisedTargets, buildHealthTargets } from "../service-urls.js";

const resources = [
  { name: "reservation-api", config: { appType: "backend" } },
  { name: "web", config: { appType: "frontend" } },
  { name: "jobs", config: { appType: "worker" } },
] as unknown as DiscoveredResource[];

describe("advertised endpoint targets", () => {
  beforeEach(() => {
    process.env.TDK_SERVICE_BASE_URL = "http://shop.localhost";
  });
  afterEach(() => {
    delete process.env.TDK_SERVICE_BASE_URL;
  });

  it("uses the bare advertised URL, with no /health suffix", () => {
    const targets = buildAdvertisedTargets(resources);
    expect(targets.map((target) => target.url)).toEqual([
      "http://api.shop.localhost/api/reservation",
      "http://app.shop.localhost/web",
    ]);
  });

  it("keeps the health ping on /health, and skips workers", () => {
    const targets = buildHealthTargets(resources);
    expect(targets.map((target) => target.url)).toEqual([
      "http://api.shop.localhost/api/reservation/health",
      "http://app.shop.localhost/web/health",
    ]);
  });
});

describe("summarizeAdvertisedProbes", () => {
  const probe = (name: string, status: number | undefined) => ({
    name,
    appType: "backend" as const,
    url: `http://api.shop.localhost/api/${name}`,
    ok: status !== undefined && status < 400,
    status,
  });

  it("skips when nothing answered", () => {
    const result = summarizeAdvertisedProbes([probe("reservation", undefined)]);
    expect(result.isSkipped).toBe(true);
  });

  it("passes when no advertised link is a 404", () => {
    const result = summarizeAdvertisedProbes([probe("reservation", 200), probe("menu", 401)]);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBeUndefined();
  });

  it("warns, naming the dead link, when a link returns 404", () => {
    const result = summarizeAdvertisedProbes([probe("reservation", 404), probe("menu", 200)]);
    expect(result.didPass).toBe(true);
    expect(result.isWarning).toBe(true);
    expect(result.message).toContain("http://api.shop.localhost/api/reservation");
    expect(result.fix).toContain("smoke");
  });
});
