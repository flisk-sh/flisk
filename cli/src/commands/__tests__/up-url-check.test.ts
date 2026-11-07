// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import type { DiscoveredResource } from "../../types/index.js";
import type { checkPrintedUrls, UrlTarget } from "../../utils/url-check.js";

const { uiResourcesMock, logsMock } = vi.hoisted(() => ({
  uiResourcesMock: vi.fn(),
  logsMock: vi.fn(),
}));

vi.mock("../../utils/up-readiness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/up-readiness.js")>();
  return { ...actual, tiltGetUiResources: uiResourcesMock, tiltResourceLogs: logsMock };
});

const { checkStackUrls, formatUpSuccess } = await import("../up.js");

function resource(name: string, config: Record<string, unknown>): DiscoveredResource {
  return { name, path: `/p/${name}`, config } as unknown as DiscoveredResource;
}

describe("checkStackUrls (#3211)", () => {
  it("checks nothing when no started service has a printed URL", async () => {
    const check = vi.fn();
    const checks = await checkStackUrls(
      10350,
      [resource("jobs", { appType: "worker" })],
      80,
      new Set(),
      {
        check: check as unknown as typeof checkPrintedUrls,
      },
    );
    expect(checks).toEqual([]);
    expect(check).not.toHaveBeenCalled();
  });

  it("probes the printed URLs and diagnoses a failure from the Tilt resource and its logs", async () => {
    uiResourcesMock.mockResolvedValue(
      JSON.stringify({
        items: [{ metadata: { name: "api" }, status: { runtimeStatus: "error" } }],
      }),
    );
    logsMock.mockResolvedValue("api | Error: Missing required environment variable: DATABASE_URL");
    let seen: UrlTarget[] = [];
    const check = (async (targets, options) => {
      seen = [...targets];
      const diagnosis = options?.diagnosis;
      return [
        {
          service: "api",
          url: targets[0]?.url ?? "",
          didAnswer: false,
          exited: await diagnosis?.hasExited?.("api"),
          logs: await diagnosis?.logs?.("api"),
        },
      ];
    }) as typeof checkPrintedUrls;

    const checks = await checkStackUrls(
      10351,
      [
        resource("api", { appType: "backend", port: 3000 }),
        resource("web", { appType: "frontend" }),
      ],
      80,
      new Set(["web"]),
      { check },
    );

    // The deferred frontend is left out; the api has its URL and its health URL.
    expect(seen.map((t) => t.service)).toEqual(["api", "api"]);
    expect(seen[1]?.url.endsWith("/api/health")).toBe(true);
    expect(checks[0]).toMatchObject({
      exited: true,
      logs: expect.stringContaining("DATABASE_URL"),
    });
    expect(uiResourcesMock).toHaveBeenCalledWith(10351);
    expect(logsMock).toHaveBeenCalledWith(10351, "api");
  });
});

describe("formatUpSuccess health URLs", () => {
  it("does not double the slash of a service URL that ends in one", () => {
    const lines = formatUpSuccess(10350, {
      serviceHealth: [{ name: "api", status: "ready", url: "http://api.demo.localhost/api/api/" }],
    });
    expect(lines).toContain("  ✓ api: http://api.demo.localhost/api/api/health");
  });
});
