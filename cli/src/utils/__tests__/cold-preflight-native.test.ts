// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  checkDockerRuntime: vi.fn(),
  checkDockerCompose: vi.fn(),
  checkDockerVersions: vi.fn(),
  checkTilt: vi.fn(),
  getHostPortPlan: vi.fn(),
}));

vi.mock("../../commands/doctor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../commands/doctor.js")>()),
  checkDockerRuntime: probes.checkDockerRuntime,
  checkDockerCompose: probes.checkDockerCompose,
  checkDockerVersions: probes.checkDockerVersions,
  checkTilt: probes.checkTilt,
}));
vi.mock("../host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../host-port-config.js")>()),
  getHostPortPlan: probes.getHostPortPlan,
}));

import { createTempProject } from "../../test-support/index.js";
import { runColdPreflight } from "../cold-preflight.js";

describe("preflight for a project of command services", () => {
  it("checks neither Docker, Compose, Tilt nor the gateway and database ports", async () => {
    const root = createTempProject({
      files: {
        "api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          command: "node s.js",
          port: 4100,
        }),
        "web/service.json": JSON.stringify({
          appName: "web",
          appType: "frontend",
          command: "node w.js",
          dependsOn: ["api"],
        }),
      },
    });

    const result = await runColdPreflight({ cwd: root });

    expect(result).toMatchObject({ ok: true, inProject: true, scope: "native", items: [] });
    expect(result.footer).toBe("Environment ready for Flisk");
    for (const probe of Object.values(probes)) expect(probe).not.toHaveBeenCalled();
  });

  it("still runs the container checks when one service has no command", async () => {
    probes.checkDockerRuntime.mockResolvedValue({
      name: "Docker",
      didPass: false,
      message: "down",
    });
    probes.checkDockerCompose.mockResolvedValue({ name: "Compose", didPass: true, message: "" });
    probes.checkDockerVersions.mockResolvedValue({ name: "Versions", didPass: true, message: "" });
    probes.checkTilt.mockResolvedValue({ name: "Tilt", didPass: true, message: "" });
    probes.getHostPortPlan.mockResolvedValue({
      ingressHttp: 80,
      ingressHttps: 443,
      postgres: 5432,
    });
    const root = createTempProject({
      files: {
        "web/service.json": JSON.stringify({
          appName: "web",
          appType: "frontend",
          command: "node w.js",
        }),
      },
      stacks: { shop: { api: { appType: "backend", schemaVersion: 1, port: 4400 } } },
    });

    const result = await runColdPreflight({ cwd: root });

    expect(result.scope).toBe("runtime");
    expect(result.items.map((item) => item.id)).toContain("docker");
    expect(probes.checkTilt).toHaveBeenCalled();
  });
});
