// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// In-process cases for `flisk wait`: the one standard envelope with each service's state, the exit codes for ready,
// failure, timeout and unknown names, and the log tails printed for a failing service. Discovery and the native run
// state are doubles so every case says exactly what the wait sees, with no Docker, Tilt or child CLI needed.

import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import type { DiscoveredResource, ServiceRuntimeState } from "../../types/index.js";

const discovery = vi.hoisted(() => ({
  createDiscoveryContext: vi.fn((): { resources: DiscoveredResource[] } => ({ resources: [] })),
}));
const project = vi.hoisted(() => ({ resolveCommandProject: vi.fn((): string => "/project") }));
const nativeService = vi.hoisted(() => ({ isNativeProject: vi.fn(() => true) }));
const native = vi.hoisted(() => ({
  nativeServiceStates: vi.fn(
    (_root: string, _services: readonly string[]): Record<string, ServiceRuntimeState> => ({}),
  ),
}));
const waitLogs = vi.hoisted(() => ({
  fetchUnhealthyLogLines: vi.fn(async () => [] as Array<{ resource: string | null; text: string }>),
}));

vi.mock("../../utils/discovery-context.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/discovery-context.js")>()),
  ...discovery,
}));
vi.mock("../../utils/project-resolution.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/project-resolution.js")>()),
  ...project,
}));
vi.mock("../../utils/native-service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-service.js")>()),
  ...nativeService,
}));
vi.mock("../../utils/native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-runtime.js")>()),
  ...native,
}));
vi.mock("../../utils/up-wait.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/up-wait.js")>()),
  ...waitLogs,
}));

import { waitCommand } from "../wait.js";

function resetOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
}

let root: string;

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes from captured output.
const ANSI = /\u001b\[[0-9;]*m/g;

async function runWait(args: string[]) {
  resetOptions(waitCommand);
  const run = await runCommandInProcess(waitCommand, args, root);
  return { ...run, stdout: run.stdout.replace(ANSI, ""), stderr: run.stderr };
}

describe("flisk wait (in-process)", () => {
  beforeEach(() => {
    process.exitCode = 0;
    root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-wait-inprocess-")));
    project.resolveCommandProject.mockReturnValue(root);
    nativeService.isNativeProject.mockReturnValue(true);
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [makeResource("api", "backend"), makeResource("web", "backend")],
    });
    native.nativeServiceStates.mockReturnValue({
      api: { status: "ready" },
      web: { status: "ready" },
    });
    waitLogs.fetchUnhealthyLogLines.mockResolvedValue([]);
  });

  it("prints one envelope with every service's state and exits 0 when all are healthy", async () => {
    const run = await runWait(["--json"]);

    expect(run.status).toBeUndefined();
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.errors).toEqual([]);
    expect(envelope.data).toMatchObject({
      ok: true,
      state: "ready",
      ready: true,
      timeoutSeconds: 1800,
      runtime: "native",
      unhealthy: [],
    });
    expect(envelope.data.services).toEqual([
      { name: "api", status: "ready" },
      { name: "web", status: "ready" },
    ]);
  });

  it("waits only for the named services", async () => {
    native.nativeServiceStates.mockReturnValue({ web: { status: "ready" } });
    const run = await runWait(["web", "--json"]);

    expect(run.status).toBeUndefined();
    expect(parseEnvelope(run.stdout).data.services).toEqual([{ name: "web", status: "ready" }]);
    expect(native.nativeServiceStates).toHaveBeenCalledWith(root, ["web"]);
  });

  it("reports a failing service, its last log lines and exit 1", async () => {
    native.nativeServiceStates.mockReturnValue({
      api: { status: "error", reason: "exited repeatedly" },
      web: { status: "ready" },
    });
    waitLogs.fetchUnhealthyLogLines.mockResolvedValue([
      { resource: "api", text: "TypeError: missing DATABASE_URL" },
    ]);
    const run = await runWait(["--json"]);

    expect(run.status).toBe(1);
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data).toMatchObject({
      ok: false,
      state: "failed",
      ready: false,
      unhealthy: ["api"],
    });
    expect(envelope.errors[0].code).toBe("WAIT_RESOURCE_FAILED");
    expect(envelope.errors[0].message).toContain("api");
    expect(envelope.data.services[0]).toMatchObject({
      name: "api",
      status: "error",
      logs: ["TypeError: missing DATABASE_URL"],
    });
    expect(run.stderr).toContain("api");
    expect(run.stderr).toContain("TypeError: missing DATABASE_URL");
  });

  it("reports a timeout, naming the still-starting service and its last log lines", async () => {
    native.nativeServiceStates.mockReturnValue({
      api: { status: "pending", reason: "starting" },
      web: { status: "ready" },
    });
    waitLogs.fetchUnhealthyLogLines.mockResolvedValue([
      { resource: "api", text: "still starting" },
    ]);
    const run = await runWait(["--timeout=1", "--json"]);

    expect(run.status).toBe(1);
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data).toMatchObject({
      ok: false,
      state: "timeout",
      ready: false,
      timeoutSeconds: 1,
      unhealthy: ["api"],
    });
    expect(envelope.errors[0].code).toBe("WAIT_TIMEOUT");
    expect(run.stderr).toContain("Timed out after 1s");
    expect(run.stderr).toContain("api");
    expect(run.stderr).toContain("still starting");
  });

  it("rejects an unknown service name with the standard envelope and exit 2", async () => {
    const run = await runWait(["typo", "--json"]);

    expect(run.status).toBe(2);
    const envelope = parseEnvelope(run.stdout);
    expect(envelope.data).toMatchObject({ ok: false, state: "unknown-service", unknown: ["typo"] });
    expect(envelope.errors[0].code).toBe("UNKNOWN_SERVICE");
    expect(run.stderr).toContain("typo");
  });

  it("names the failing service in human output too", async () => {
    native.nativeServiceStates.mockReturnValue({
      api: { status: "error", reason: "exited repeatedly" },
      web: { status: "ready" },
    });
    const run = await runWait([]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("flisk wait:");
    expect(run.stderr).toContain("api");
  });
});
