// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportHostPortPlan,
  getHostPortPlan,
  isDockerPortOwnedByProject,
  readSavedHostPortPlan,
  writeSavedHostPortPlan,
} from "../host-port-config.js";
import type { HostPortPlan } from "../host-port-plan.js";

describe("saved host port plan", () => {
  let projectRoot = "";
  const originalEnv = {
    http: process.env.TDK_HTTP_PORT,
    https: process.env.TDK_HTTPS_PORT,
    postgres: process.env.TDK_POSTGRES_PORT,
  };

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    for (const [key, value] of [
      ["TDK_HTTP_PORT", originalEnv.http],
      ["TDK_HTTPS_PORT", originalEnv.https],
      ["TDK_POSTGRES_PORT", originalEnv.postgres],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("recognizes published ports held by the current project's containers", () => {
    expect(
      isDockerPortOwnedByProject(
        "tdk_example_traefik|0.0.0.0:8080->80/tcp, :::8080->80/tcp\ntdk_other_postgres|0.0.0.0:15432->5432/tcp",
        "tdk_example",
        8080,
      ),
    ).toBe(true);
    expect(
      isDockerPortOwnedByProject(
        "tdk_other_postgres|0.0.0.0:15432->5432/tcp",
        "tdk_example",
        15432,
      ),
    ).toBe(false);
  });

  it("persists and restores the chosen plan", () => {
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-port-config-"));
    const plan: HostPortPlan = {
      ingressHttp: 8080,
      ingressHttps: 8443,
      postgres: 15432,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: {
        ingressHttp: "selected from fallback range 8080-8180",
        ingressHttps: "selected from fallback range 8443-8543",
        postgres: "selected from fallback range 15432-15532",
      },
    };
    writeSavedHostPortPlan(projectRoot, plan);
    expect(readSavedHostPortPlan(projectRoot)).toEqual(plan);
  });

  it("exports the selected ports for Tilt and Compose child processes", () => {
    const plan: HostPortPlan = {
      ingressHttp: 8081,
      ingressHttps: 8444,
      postgres: 15433,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: {
        ingressHttp: "selected from fallback range 8080-8180",
        ingressHttps: "selected from fallback range 8443-8543",
        postgres: "selected from fallback range 15432-15532",
      },
    };
    exportHostPortPlan(plan);
    expect(process.env.TDK_HTTP_PORT).toBe("8081");
    expect(process.env.TDK_HTTPS_PORT).toBe("8444");
    expect(process.env.TDK_POSTGRES_PORT).toBe("15433");
  });

  it("uses the saved plan without inspecting Docker for dry-run", async () => {
    delete process.env.TDK_HTTP_PORT;
    delete process.env.TDK_HTTPS_PORT;
    delete process.env.TDK_POSTGRES_PORT;
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-port-config-dry-run-"));
    const plan: HostPortPlan = {
      ingressHttp: 8082,
      ingressHttps: 8445,
      postgres: 15434,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: {
        ingressHttp: "selected from fallback range 8080-8180",
        ingressHttps: "selected from fallback range 8443-8543",
        postgres: "selected from fallback range 15432-15532",
      },
    };
    writeSavedHostPortPlan(projectRoot, plan);

    await expect(getHostPortPlan(projectRoot, { inspectDocker: false })).resolves.toEqual(plan);
  });

  it("moves a saved fallback plan back to ports 80 and 443 once they are free", async () => {
    delete process.env.TDK_HTTP_PORT;
    delete process.env.TDK_HTTPS_PORT;
    delete process.env.TDK_POSTGRES_PORT;
    projectRoot = mkdtempSync(join(tmpdir(), "tdk-port-config-preferred-"));
    writeSavedHostPortPlan(projectRoot, {
      ingressHttp: 8080,
      ingressHttps: 8443,
      postgres: 15432,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: {
        ingressHttp: "selected from fallback range 8080-8180",
        ingressHttps: "selected from fallback range 8443-8543",
        postgres: "selected from fallback range 15432-15532",
      },
    });

    const plan = await getHostPortPlan(projectRoot, {
      inspectDocker: false,
      isPortFree: async () => true,
    });
    expect([plan.ingressHttp, plan.ingressHttps, plan.postgres]).toEqual([8080, 8443, 15432]);

    const moved = await getHostPortPlan(projectRoot, { isPortFree: async () => true });
    expect([moved.ingressHttp, moved.ingressHttps, moved.postgres]).toEqual([80, 443, 15432]);

    const kept = await getHostPortPlan(projectRoot, {
      isPortFree: async (port) => port !== 80 && port !== 443,
    });
    expect([kept.ingressHttp, kept.ingressHttps]).toEqual([8080, 8443]);
  });
});
