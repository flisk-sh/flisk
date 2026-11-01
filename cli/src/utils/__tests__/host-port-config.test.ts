// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HostPortPlan } from "../../types/index.js";
import {
  exportHostPortPlan,
  getHostPortPlan,
  isDockerPortOwnedByProject,
  readSavedHostPortPlan,
  writeSavedHostPortPlan,
} from "../host-port-config.js";

describe("saved host port plan", () => {
  let projectRoot = "";
  const originalEnv = {
    http: process.env.FLISK_HTTP_PORT,
    https: process.env.FLISK_HTTPS_PORT,
    postgres: process.env.FLISK_POSTGRES_PORT,
  };

  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    for (const [key, value] of [
      ["FLISK_HTTP_PORT", originalEnv.http],
      ["FLISK_HTTPS_PORT", originalEnv.https],
      ["FLISK_POSTGRES_PORT", originalEnv.postgres],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("recognizes published ports held by the current project's containers", () => {
    expect(
      isDockerPortOwnedByProject(
        "flisk_example_traefik|0.0.0.0:8080->80/tcp, :::8080->80/tcp\nflisk_other_postgres|0.0.0.0:15432->5432/tcp",
        "flisk_example",
        8080,
      ),
    ).toBe(true);
    expect(
      isDockerPortOwnedByProject(
        "flisk_other_postgres|0.0.0.0:15432->5432/tcp",
        "flisk_example",
        15432,
      ),
    ).toBe(false);
  });

  it("persists and restores the chosen plan", () => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-config-"));
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
    expect(process.env.FLISK_HTTP_PORT).toBe("8081");
    expect(process.env.FLISK_HTTPS_PORT).toBe("8444");
    expect(process.env.FLISK_POSTGRES_PORT).toBe("15433");
  });

  it("uses the saved plan without inspecting Docker for dry-run", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.FLISK_POSTGRES_PORT;
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-config-dry-run-"));
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
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.FLISK_POSTGRES_PORT;
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-config-preferred-"));
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

  it("discards the saved plan when one of its ports is no longer free", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.FLISK_POSTGRES_PORT;
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-config-occupied-"));
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
      isPortFree: async (port) => port !== 15432,
    });

    expect(plan.ingressHttp).not.toBe(8080);
    expect(plan.postgres).not.toBe(15432);
    expect([plan.ingressHttp, plan.ingressHttps, plan.postgres]).toEqual([80, 443, 15433]);
  });
});

describe("ports a bring-your-own service publishes", () => {
  let projectRoot = "";
  afterEach(() => {
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  const project = (extraPorts: unknown[]) => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-port-config-extra-"));
    mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".flisk", "project.json"),
      JSON.stringify({ project: { name: "tube" } }),
    );
    const dir = join(projectRoot, "services", "tube", "caddy");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "service.json"),
      JSON.stringify({
        appName: "caddy",
        appType: "bring-your-own",
        stack: "tube",
        port: 8080,
        image: "caddy:2",
        extraPorts,
      }),
    );
  };

  it("keeps Traefik off a proxy's 80 and 443, even when nothing listens there yet", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    project([
      { port: 80, bind: "0.0.0.0" },
      { port: 443, bind: "0.0.0.0" },
    ]);
    const plan = await getHostPortPlan(projectRoot, { isPortFree: async () => true });
    expect(plan.ingressHttp).not.toBe(80);
    expect(plan.ingressHttps).not.toBe(443);
  });

  it("still takes 80 and 443 when the extra ports are elsewhere", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    project([{ port: 80, hostPort: 8081 }]);
    const plan = await getHostPortPlan(projectRoot, { isPortFree: async () => true });
    expect([plan.ingressHttp, plan.ingressHttps]).toEqual([80, 443]);
  });

  it("reserves the host port a publish variable resolves to, from the project .env", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.TUBEHAUS_HTTP_BIND;
    project([{ port: 80, publish: "${TUBEHAUS_HTTP_BIND:-0.0.0.0:8081}" }]);
    writeFileSync(join(projectRoot, ".env"), "TUBEHAUS_HTTP_BIND=127.0.0.1:80\n");
    const plan = await getHostPortPlan(projectRoot, { isPortFree: async () => true });
    expect(plan.ingressHttp).not.toBe(80);
  });

  it("falls back to the default of publish when the .env does not set it", async () => {
    delete process.env.FLISK_HTTP_PORT;
    delete process.env.FLISK_HTTPS_PORT;
    delete process.env.TUBEHAUS_HTTP_BIND;
    project([{ port: 80, publish: "${TUBEHAUS_HTTP_BIND:-0.0.0.0:80}" }]);
    const plan = await getHostPortPlan(projectRoot, { isPortFree: async () => true });
    expect(plan.ingressHttp).not.toBe(80);
  });
});
