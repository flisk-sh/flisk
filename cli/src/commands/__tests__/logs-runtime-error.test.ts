// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Runtime-aware logs errors: a local-process project with nothing running must not be told to look for Tilt,
// while a Docker project keeps the existing TILT_NOT_RUNNING wording. Discovery, run state and Tilt are doubles.

import { tmpdir } from "node:os";
import type { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource, parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";
import type { NativeLogLine } from "../../utils/native-runtime.js";

const paths = vi.hoisted(() => ({ findProjectRoot: vi.fn<() => string | null>() }));
const tilt = vi.hoisted(() => ({
  isTiltAvailable: vi.fn(async () => true),
  runTilt: vi.fn(),
}));
const services = vi.hoisted(() => ({
  discoverResourcesFromRoot: vi.fn<(root: string) => DiscoveredResource[]>(),
}));
const nativeService = vi.hoisted(() => ({ isNativeProject: vi.fn(() => false) }));
const nativeRuntime = vi.hoisted(() => ({
  nativeServiceStates: vi.fn(),
  readNativeLogLines: vi.fn<() => NativeLogLine[]>(() => []),
}));
const secrets = vi.hoisted(() => ({ envSecretValues: vi.fn((): string[] => []) }));
const hostPort = vi.hoisted(() => ({ resolveRuntimeTiltPort: vi.fn() }));

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  ...paths,
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  ...tilt,
}));
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  ...services,
}));
vi.mock("../../utils/native-service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-service.js")>()),
  ...nativeService,
}));
vi.mock("../../utils/native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-runtime.js")>()),
  ...nativeRuntime,
}));
vi.mock("../../utils/secret-redaction.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/secret-redaction.js")>()),
  ...secrets,
}));
vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  ...hostPort,
}));

import { logsCommand } from "../logs.js";

const NATIVE = [
  makeResource("api", "backend", { command: "node api.js" }),
  makeResource("web", "frontend", { command: "vite" }),
];

function resetOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
}

async function run(args: string[]) {
  resetOptions(logsCommand);
  return runCommandInProcess(logsCommand, args, tmpdir());
}

beforeEach(() => {
  process.exitCode = 0;
  delete process.env.TILT_PORT;
  paths.findProjectRoot.mockReturnValue("/project");
  tilt.isTiltAvailable.mockResolvedValue(true);
  tilt.runTilt.mockReset();
  services.discoverResourcesFromRoot.mockReturnValue([]);
  nativeService.isNativeProject.mockReturnValue(false);
  nativeRuntime.nativeServiceStates.mockReturnValue({});
  nativeRuntime.readNativeLogLines.mockReturnValue([]);
  secrets.envSecretValues.mockReturnValue([]);
  hostPort.resolveRuntimeTiltPort.mockReturnValue(10350);
});

afterEach(() => {
  vi.resetAllMocks();
  process.exitCode = 0;
});

describe("flisk logs with a local-process project", () => {
  beforeEach(() => {
    services.discoverResourcesFromRoot.mockReturnValue(NATIVE);
    nativeService.isNativeProject.mockReturnValue(true);
    nativeRuntime.readNativeLogLines.mockReturnValue([]);
  });

  it("--json with no running services reports a runtime-neutral error, never Tilt", async () => {
    nativeRuntime.nativeServiceStates.mockReturnValue({
      api: { status: "unknown", reason: "not running" },
      web: { status: "unknown", reason: "not running" },
    });

    const result = await run(["--json"]);
    const envelope = parseEnvelope(result.stdout);

    expect(result.status).toBe(1);
    expect(envelope.errors[0]?.code).toBe("SERVICES_NOT_RUNNING");
    expect(envelope.errors[0]?.message).toBe(
      "No services of this project are running. Start them with: flisk up",
    );
    expect(envelope.errors[0]?.message).not.toMatch(/tilt|10350/i);
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
  });

  it("text mode with no running services says to start them with flisk up, not Tilt", async () => {
    nativeRuntime.nativeServiceStates.mockReturnValue({
      api: { status: "unknown", reason: "not running" },
      web: { status: "unknown", reason: "not running" },
    });

    const result = await run([]);

    expect(result.status).toBe(1);
    const text = [result.stdout, result.stderr].join("\n");
    expect(text).not.toMatch(/tilt|10350/i);
    expect(text).toContain("No services of this project are running. Start them with: flisk up");
  });

  it("reads log lines when the native runtime is running", async () => {
    nativeRuntime.nativeServiceStates.mockReturnValue({
      api: { status: "ready" },
      web: { status: "ready" },
    });
    nativeRuntime.readNativeLogLines.mockReturnValue([
      { time: null, resource: "api", level: null, source: null, text: "listening", run: "1" },
    ]);

    const result = await run(["--json"]);
    const envelope = parseEnvelope(result.stdout);

    expect(result.status).toBeUndefined();
    expect(envelope.errors).toEqual([]);
    expect(envelope.data.lines).toEqual([
      expect.objectContaining({ text: "listening", resource: "api" }),
    ]);
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("a partial run still shows the log lines that exist", async () => {
    nativeRuntime.nativeServiceStates.mockReturnValue({
      api: { status: "ready" },
      web: { status: "unknown", reason: "not running" },
    });
    nativeRuntime.readNativeLogLines.mockReturnValue([
      { time: null, resource: "api", level: null, source: null, text: "listening", run: "1" },
    ]);

    const result = await run(["--json"]);

    expect(result.status).toBeUndefined();
    expect(parseEnvelope(result.stdout).data.lines).toHaveLength(1);
  });
});

describe("flisk logs with a Docker project", () => {
  beforeEach(() => {
    services.discoverResourcesFromRoot.mockReturnValue([makeResource("api", "backend")]);
    nativeService.isNativeProject.mockReturnValue(false);
    hostPort.resolveRuntimeTiltPort.mockReturnValue(null);
  });

  it("keeps TILT_NOT_RUNNING and the port 10350 message when Tilt is unreachable", async () => {
    const result = await run(["--json"]);
    const envelope = parseEnvelope(result.stdout);

    expect(result.status).toBe(1);
    expect(envelope.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(envelope.errors[0]?.message).toContain("Could not reach Tilt on port 10350");
    expect(envelope.errors[0]?.message).toContain("flisk up");
  });

  it("keeps the Tilt message in text mode", async () => {
    const result = await run([]);

    expect(result.status).toBe(1);
    expect([result.stdout, result.stderr].join("\n")).toContain(
      "Could not reach Tilt on port 10350",
    );
  });
});
