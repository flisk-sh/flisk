// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject } from "../../test-support/index.js";
import { writeSavedHostPortPlan } from "../../utils/host-port-config.js";
import type { HostPortPlan } from "../../utils/host-port-plan.js";
import { openUrl } from "../../utils/url-actions.js";
import {
  type FrontendTarget,
  findReadyFrontend,
  isFrontendReady,
  listFrontendTargets,
  openFirstFrontend,
  pickReadyFrontend,
} from "../open.js";

vi.mock("../../utils/url-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/url-actions.js")>()),
  openUrl: vi.fn(),
}));

// Port 9 (discard) is closed on every machine, so nothing answers here.
const targets: FrontendTarget[] = [
  { name: "admin", url: "http://127.0.0.1:9/" },
  { name: "storefront", url: "http://127.0.0.1:9/" },
];

const SAVED_PLAN: HostPortPlan = {
  ingressHttp: 80,
  ingressHttps: 443,
  postgres: 5432,
  requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
  explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
  reason: {
    ingressHttp: "preferred port 80 is available",
    ingressHttps: "preferred port 443 is available",
    postgres: "preferred port 5432 is available",
  },
};

function createShopProject(): string {
  const projectRoot = createTempProject({
    projectJson: { project: { name: "demo-shop" } },
    stacks: {
      web: {
        admin: { appType: "frontend" },
        storefront: { appType: "frontend", basePath: "/shop" },
        "orders-api": { appType: "backend" },
      },
    },
  });
  writeSavedHostPortPlan(projectRoot, SAVED_PLAN);
  return projectRoot;
}

describe("isFrontendReady", () => {
  it("is false when the URL does not answer", async () => {
    expect(await isFrontendReady("http://127.0.0.1:1/", 200)).toBe(false);
  });
});

describe("pickReadyFrontend", () => {
  it("returns nothing when the project has no frontend", async () => {
    expect(await pickReadyFrontend([], 0)).toBeUndefined();
  });

  it("returns nothing when no frontend answers within the wait", async () => {
    const picked = await pickReadyFrontend(targets, 0);
    expect(picked).toBeUndefined();
  });

  it("reports the wait while it polls", async () => {
    const seen: number[] = [];
    // A wait of a few seconds leaves room for at least one poll to report, even when the machine is busy.
    await pickReadyFrontend(targets, 3000, (elapsed) => seen.push(elapsed));
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("listFrontendTargets", () => {
  const originalBaseUrl = process.env.FLISK_SERVICE_BASE_URL;
  const originalHttpPort = process.env.FLISK_HTTP_PORT;
  const originalHttpsPort = process.env.FLISK_HTTPS_PORT;
  const originalPostgresPort = process.env.FLISK_POSTGRES_PORT;

  beforeEach(() => {
    delete process.env.FLISK_SERVICE_BASE_URL;
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.FLISK_POSTGRES_PORT;
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.FLISK_SERVICE_BASE_URL;
    else process.env.FLISK_SERVICE_BASE_URL = originalBaseUrl;
    if (originalHttpPort === undefined) delete process.env.FLISK_HTTP_PORT;
    else process.env.FLISK_HTTP_PORT = originalHttpPort;
    if (originalHttpsPort === undefined) delete process.env.FLISK_HTTPS_PORT;
    else process.env.FLISK_HTTPS_PORT = originalHttpsPort;
    if (originalPostgresPort === undefined) delete process.env.FLISK_POSTGRES_PORT;
    else process.env.FLISK_POSTGRES_PORT = originalPostgresPort;
  });

  it("lists only frontend services with their published URLs", async () => {
    const projectRoot = createShopProject();

    const found = await listFrontendTargets(projectRoot);

    expect(found).toEqual([
      { name: "admin", url: "http://app.demo-shop.localhost/admin" },
      { name: "storefront", url: "http://app.demo-shop.localhost/shop" },
    ]);
  });
});

describe("findReadyFrontend", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the first ready frontend target", async () => {
    const projectRoot = createShopProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/shop")) {
          return new Response("ok", { status: 200 });
        }
        return new Response("unavailable", { status: 503 });
      }),
    );

    const ready = await findReadyFrontend(projectRoot, 0);

    expect(ready).toEqual({
      name: "storefront",
      url: "http://app.demo-shop.localhost/shop",
    });
  });

  it("returns undefined when no frontend is ready", async () => {
    const projectRoot = createShopProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );

    const ready = await findReadyFrontend(projectRoot, 0);

    expect(ready).toBeUndefined();
  });
});

describe("openFirstFrontend", () => {
  beforeEach(() => {
    vi.mocked(openUrl).mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens the first ready frontend in the browser once with the right URL", async () => {
    const projectRoot = createShopProject();
    vi.mocked(openUrl).mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );

    const openedUrl = await openFirstFrontend(projectRoot);

    expect(openedUrl).toBe("http://app.demo-shop.localhost/admin");
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith("http://app.demo-shop.localhost/admin");
  });

  it("returns null without opening a browser when the project has no frontend", async () => {
    const projectRoot = createTempProject({
      projectJson: { project: { name: "api-only" } },
      stacks: {
        backend: {
          "orders-api": { appType: "backend" },
        },
      },
    });
    writeSavedHostPortPlan(projectRoot, SAVED_PLAN);

    const openedUrl = await openFirstFrontend(projectRoot);

    expect(openedUrl).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
