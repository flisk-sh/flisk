// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const dockerCalls: string[] = [];
let dockerPsOutput = "";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: vi.fn((file: string, args: string[]) => {
    dockerCalls.push(`${file} ${args.join(" ")}`);
    return file === "docker" ? dockerPsOutput : "";
  }),
}));

const asyncDockerCalls: string[] = [];

vi.mock("../exec-async.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../exec-async.js")>()),
  execAsync: vi.fn(async (command: string) => {
    asyncDockerCalls.push(command);
    return "";
  }),
}));

import { checkDockerRuntime } from "../../commands/doctor.js";
import { checkIngressPorts, checkPrivateNpmRegistry } from "../doctor-runtime.js";
import { createHostCommandCache, hasSharedDockerPsOutput } from "../host-command-cache.js";
import { getHostPortPlan, toNamePortsLines } from "../host-port-config.js";

describe("shared docker ps", () => {
  let projectRoot = "";

  function verdaccioProject(): string {
    const root = mkdtempSync(join(tmpdir(), "flisk-shared-docker-ps-verdaccio-"));
    writeFileSync(join(root, ".npmrc"), "registry=http://localhost:4873\n");
    return root;
  }

  afterEach(() => {
    dockerCalls.length = 0;
    asyncDockerCalls.length = 0;
    dockerPsOutput = "";
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

  it("calls docker ps once when the port plan, the ingress check and the Verdaccio check share a cache", async () => {
    projectRoot = verdaccioProject();
    dockerPsOutput = "flisk_shop_verdaccio\tverdaccio/verdaccio\t0.0.0.0:4873->4873/tcp";
    const commandCache = createHostCommandCache();
    const exec = ((command: string) => {
      dockerCalls.push(command);
      return "";
    }) as never;

    await getHostPortPlan(projectRoot, { isPortFree: async () => true, commandCache });
    checkIngressPorts(exec, "flisk-project", undefined, { commandCache });
    const registry = checkPrivateNpmRegistry(
      exec,
      projectRoot,
      "http://localhost:4873",
      true,
      commandCache,
    );

    expect(dockerCalls.filter((call) => call.includes("docker"))).toHaveLength(1);
    expect(registry.message).toContain("Verdaccio container is running");
  });

  it("asks the supplied executor, not the host, when the Verdaccio check has an empty cache", () => {
    projectRoot = verdaccioProject();
    const commandCache = createHostCommandCache();
    const exec = ((command: string) => {
      dockerCalls.push(command);
      return "flisk_shop_verdaccio\tverdaccio/verdaccio\t0.0.0.0:4873->4873/tcp";
    }) as never;

    const registry = checkPrivateNpmRegistry(
      exec,
      projectRoot,
      "http://localhost:4873",
      true,
      commandCache,
    );

    expect(dockerCalls.filter((call) => call.includes("docker"))).toHaveLength(1);
    expect(registry.message).toContain("Verdaccio container is running");
  });

  it("still runs the old docker ps --format {{.Names}} when the Verdaccio check has no cache", () => {
    projectRoot = verdaccioProject();
    const exec = ((command: string) => {
      dockerCalls.push(command);
      return "flisk_shop_verdaccio\n";
    }) as never;

    const registry = checkPrivateNpmRegistry(exec, projectRoot, "http://localhost:4873");

    expect(dockerCalls).toContain("docker ps --format '{{.Names}}'");
    expect(registry.message).toContain("Verdaccio container is running");
  });

  it("lists containers once for the port plan and the runtime check together", async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "flisk-shared-docker-ps-runtime-"));
    const commandCache = createHostCommandCache();
    expect(hasSharedDockerPsOutput(commandCache)).toBe(false);

    await getHostPortPlan(projectRoot, { isPortFree: async () => true, commandCache });
    const runtime = await checkDockerRuntime(commandCache);

    expect(hasSharedDockerPsOutput(commandCache)).toBe(true);
    expect(runtime.didPass).toBe(true);
    expect(dockerCalls.filter((call) => call.startsWith("docker"))).toHaveLength(1);
    expect(asyncDockerCalls.filter((call) => call.includes("docker ps"))).toHaveLength(0);
  });

  it("still runs its own docker ps in the runtime check when the port plan did not list containers", async () => {
    const runtime = await checkDockerRuntime(createHostCommandCache());

    expect(runtime.didPass).toBe(true);
    expect(asyncDockerCalls.filter((call) => call.includes("docker ps"))).toHaveLength(1);
  });

  it("converts tab-separated docker ps lines to name|ports lines", () => {
    const tabbed = "flisk_shop_traefik\ttraefik:v3\t0.0.0.0:80->80/tcp\nweb\tnginx\t";
    expect(toNamePortsLines(tabbed)).toBe("flisk_shop_traefik|0.0.0.0:80->80/tcp\nweb|");
  });
});
