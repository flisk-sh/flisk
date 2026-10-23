// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject, makeResource } from "../../test-support/index.js";
import {
  appendHealthPath,
  buildAdvertisedTargets,
  buildHealthTargets,
  getProjectName,
  getProjectNameFor,
  pingHealthTarget,
  pingHealthTargets,
  resolveServicePath,
  resolveSubdomainBases,
} from "../service-urls.js";

describe("appendHealthPath", () => {
  it("appends /health", () => {
    expect(appendHealthPath("/menu")).toBe("/menu/health");
  });

  it("collapses trailing slashes", () => {
    expect(appendHealthPath("/menu///")).toBe("/menu/health");
  });
});

describe("getProjectNameFor", () => {
  it("reads the project name from .tdk/project.json", () => {
    const root = createTempProject({ projectJson: { project: { name: "demo-shop" } } });
    expect(getProjectNameFor(root)).toBe("demo-shop");
  });

  it("falls back when the project file has no project name", () => {
    const root = createTempProject({ projectJson: { project: {} } });
    expect(getProjectNameFor(root)).toBe("tdk-project");
  });

  it("falls back when the project file is not valid JSON", () => {
    const root = createTempProject({ projectJson: "{not json" });
    expect(getProjectNameFor(root)).toBe("tdk-project");
  });

  it("falls back when there is no project root", () => {
    expect(getProjectNameFor(null)).toBe("tdk-project");
  });
});

describe("getProjectName", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("uses the project that contains the current directory", () => {
    const root = createTempProject({
      projectJson: { project: { name: "demo-shop" } },
      files: { "apps/web/package.json": "{}" },
    });
    process.chdir(join(root, "apps", "web"));
    expect(getProjectName()).toBe("demo-shop");
  });
});

describe("resolveSubdomainBases", () => {
  const original = process.env.TDK_SERVICE_BASE_URL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TDK_SERVICE_BASE_URL;
    } else {
      process.env.TDK_SERVICE_BASE_URL = original;
    }
  });

  it("splits a bare domain into app/api subdomains", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost";
    expect(resolveSubdomainBases()).toEqual({
      appBase: "http://app.demo.localhost",
      apiBase: "http://api.demo.localhost",
    });
  });

  it("does not add subdomains to plain localhost", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://localhost:8080";
    expect(resolveSubdomainBases()).toEqual({
      appBase: "http://localhost:8080",
      apiBase: "http://localhost:8080",
    });
  });

  it("adds the planned ingress port when a configured hostname has no port", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost";
    expect(resolveSubdomainBases(8081)).toEqual({
      appBase: "http://app.demo.localhost:8081",
      apiBase: "http://api.demo.localhost:8081",
    });
  });

  it("leaves the default port out of the URL", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost";
    expect(resolveSubdomainBases(80)).toEqual({
      appBase: "http://app.demo.localhost",
      apiBase: "http://api.demo.localhost",
    });
  });

  it("preserves an explicit port in the configured base URL", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost:9000";
    expect(resolveSubdomainBases(8081)).toEqual({
      appBase: "http://app.demo.localhost:9000",
      apiBase: "http://api.demo.localhost:9000",
    });
  });

  it("uses the project name when no base URL is configured", () => {
    delete process.env.TDK_SERVICE_BASE_URL;
    const root = createTempProject({ projectJson: { project: { name: "demo-shop" } } });
    expect(resolveSubdomainBases(undefined, root)).toEqual({
      appBase: "http://app.demo-shop.localhost",
      apiBase: "http://api.demo-shop.localhost",
    });
  });

  it("adds the ingress port to the project default base URL", () => {
    delete process.env.TDK_SERVICE_BASE_URL;
    const root = createTempProject({ projectJson: { project: { name: "demo-shop" } } });
    expect(resolveSubdomainBases(8081, root)).toEqual({
      appBase: "http://app.demo-shop.localhost:8081",
      apiBase: "http://api.demo-shop.localhost:8081",
    });
  });

  it("accepts a base URL without a scheme", () => {
    process.env.TDK_SERVICE_BASE_URL = "demo.localhost";
    expect(resolveSubdomainBases()).toEqual({
      appBase: "http://app.demo.localhost",
      apiBase: "http://api.demo.localhost",
    });
  });

  it("drops the https default port", () => {
    process.env.TDK_SERVICE_BASE_URL = "https://demo.localhost";
    expect(resolveSubdomainBases(443)).toEqual({
      appBase: "https://app.demo.localhost",
      apiBase: "https://api.demo.localhost",
    });
  });

  it("keeps plain localhost without a port", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://localhost";
    expect(resolveSubdomainBases()).toEqual({
      appBase: "http://localhost",
      apiBase: "http://localhost",
    });
  });

  it("keeps an IP address as the host for both bases", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://127.0.0.1:8080";
    expect(resolveSubdomainBases()).toEqual({
      appBase: "http://127.0.0.1:8080",
      apiBase: "http://127.0.0.1:8080",
    });
  });

  it("falls back to the project defaults when the base URL is malformed", () => {
    process.env.TDK_SERVICE_BASE_URL = "http://bad host";
    const root = createTempProject({ projectJson: { project: { name: "demo-shop" } } });
    expect(resolveSubdomainBases(undefined, root)).toEqual({
      appBase: "http://app.demo-shop.localhost",
      apiBase: "http://api.demo-shop.localhost",
    });
  });
});

describe("resolveServicePath", () => {
  it("strips the -api suffix for backends", () => {
    expect(resolveServicePath(makeResource("menu-api", "backend"))).toBe("/api/menu");
  });

  it("prefers an explicit apiPath", () => {
    expect(
      resolveServicePath(makeResource("menu-api", "backend", { apiPath: "/api/v2/menu" })),
    ).toBe("/api/v2/menu");
  });

  it("prefers an explicit basePath for frontends", () => {
    expect(resolveServicePath(makeResource("floor-app", "frontend", { basePath: "/floor" }))).toBe(
      "/floor",
    );
  });

  it("falls back to the service name for frontends", () => {
    expect(resolveServicePath(makeResource("floor-app", "frontend"))).toBe("/floor-app");
  });
});

describe("buildHealthTargets", () => {
  const original = process.env.TDK_SERVICE_BASE_URL;

  beforeEach(() => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TDK_SERVICE_BASE_URL;
    } else {
      process.env.TDK_SERVICE_BASE_URL = original;
    }
  });

  it("routes frontends to app.* and backends to api.*", () => {
    const targets = buildHealthTargets([
      makeResource("floor-app", "frontend"),
      makeResource("menu-api", "backend"),
    ]);

    expect(targets).toEqual([
      { name: "floor-app", appType: "frontend", url: "http://app.demo.localhost/floor-app/health" },
      { name: "menu-api", appType: "backend", url: "http://api.demo.localhost/api/menu/health" },
    ]);
  });

  it("skips services that have no Traefik route", () => {
    const targets = buildHealthTargets([
      makeResource("kitchen-worker", "worker"),
      makeResource("shared-lib", "library"),
      makeResource("client-sdk", "sdk"),
      makeResource("db-migrator", "migrator"),
      makeResource("menu-api", "backend"),
    ]);

    expect(targets.map((t) => t.name)).toEqual(["menu-api"]);
  });
});

describe("buildAdvertisedTargets", () => {
  const original = process.env.TDK_SERVICE_BASE_URL;

  beforeEach(() => {
    process.env.TDK_SERVICE_BASE_URL = "http://demo.localhost";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TDK_SERVICE_BASE_URL;
    } else {
      process.env.TDK_SERVICE_BASE_URL = original;
    }
  });

  it("advertises the route without the /health suffix", () => {
    const targets = buildAdvertisedTargets([
      makeResource("floor-app", "frontend", { basePath: "/floor" }),
      makeResource("menu-api", "backend"),
    ]);

    expect(targets).toEqual([
      { name: "floor-app", appType: "frontend", url: "http://app.demo.localhost/floor" },
      { name: "menu-api", appType: "backend", url: "http://api.demo.localhost/api/menu" },
    ]);
  });

  it("has no targets when nothing is routable", () => {
    expect(buildAdvertisedTargets([makeResource("kitchen-worker", "worker")])).toEqual([]);
  });
});

describe("pingHealthTarget", () => {
  const target = { name: "menu-api", appType: "backend" as const, url: "http://api/health" };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports ok for a 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    await expect(pingHealthTarget(target, 100)).resolves.toMatchObject({ ok: true, status: 200 });
  });

  it("reports the status code for a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    await expect(pingHealthTarget(target, 100)).resolves.toMatchObject({ ok: false, status: 404 });
  });

  it("captures the reason when the request never completes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );
    const probe = await pingHealthTarget(target, 100);
    expect(probe.ok).toBe(false);
    expect(probe.status).toBeUndefined();
    expect(probe.error).toContain("ECONNREFUSED");
  });

  it("reports a timeout as a timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("timed out");
        err.name = "TimeoutError";
        throw err;
      }),
    );
    await expect(pingHealthTarget(target, 100)).resolves.toMatchObject({
      ok: false,
      error: "no response within 100ms",
    });
  });

  it("stringifies a thrown value that is not an Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "socket hang up";
      }),
    );
    await expect(pingHealthTarget(target, 100)).resolves.toMatchObject({
      ok: false,
      error: "socket hang up",
    });
  });
});

describe("pingHealthTargets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probes every target and keeps the input order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) => new Response("{}", { status: url.includes("/api/") ? 200 : 404 }),
      ),
    );

    const probes = await pingHealthTargets(
      [
        { name: "menu-api", appType: "backend", url: "http://api.demo.localhost/api/menu/health" },
        {
          name: "floor-app",
          appType: "frontend",
          url: "http://app.demo.localhost/floor-app/health",
        },
      ],
      100,
    );

    expect(probes.map((probe) => [probe.name, probe.status])).toEqual([
      ["menu-api", 200],
      ["floor-app", 404],
    ]);
  });

  it("returns no probes for no targets", async () => {
    await expect(pingHealthTargets([], 100)).resolves.toEqual([]);
  });
});
