// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const dockerCalls: string[] = [];

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: vi.fn((file: string, args: string[]) => {
    dockerCalls.push(`${file} ${args.join(" ")}`);
    return "";
  }),
}));

import { checkIngressPorts } from "../doctor-runtime.js";
import { createHostCommandCache } from "../host-command-cache.js";
import { getHostPortPlan, toNamePortsLines } from "../host-port-config.js";

describe("shared docker ps", () => {
  let projectRoot = "";

  afterEach(() => {
    dockerCalls.length = 0;
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  });

  it("calls docker ps once when the port plan and the ingress check run together", async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-shared-docker-ps-"));
    const commandCache = createHostCommandCache();
    const exec = ((command: string) => {
      dockerCalls.push(command);
      return "";
    }) as never;

    await getHostPortPlan(projectRoot, { isPortFree: async () => true, commandCache });
    checkIngressPorts(exec, "flisk-project", undefined, { commandCache });

    expect(dockerCalls.filter((call) => call.includes("docker"))).toHaveLength(1);
  });

  it("converts tab-separated docker ps lines to name|ports lines", () => {
    const tabbed = "flisk_shop_traefik\ttraefik:v3\t0.0.0.0:80->80/tcp\nweb\tnginx\t";
    expect(toNamePortsLines(tabbed)).toBe("flisk_shop_traefik|0.0.0.0:80->80/tcp\nweb|");
  });
});
