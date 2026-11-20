// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnvelope } from "../../test-support/index.js";
import { STANDARD_PORTS } from "../../utils/constants.js";
import { ProcessExitError } from "../../utils/errors.js";
import { restartCommand } from "../restart.js";

const paths = vi.hoisted(() => ({
  findProjectRoot: vi.fn<() => string | null>(),
}));

const tilt = vi.hoisted(() => ({
  isTiltAvailable: vi.fn<() => Promise<boolean>>(),
  runTilt:
    vi.fn<
      (
        command: string,
        args: string[],
        options?: { inheritStdio?: boolean; timeoutMs?: number },
      ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
    >(),
}));

const container = vi.hoisted(() => ({
  restartContainer:
    vi.fn<
      (
        projectRoot: string,
        stack: string,
        resourceName: string,
        run?: unknown,
        options?: { stopGracePeriod?: string },
      ) => { exitCode: number; stdout: string; stderr: string }
    >(),
}));

const discovery = vi.hoisted(() => ({
  createDiscoveryContext:
    vi.fn<
      () => {
        resources: Array<{
          name: string;
          stack?: string;
          config?: Record<string, unknown>;
        }>;
      }
    >(),
}));

const orchestration = vi.hoisted(() => ({
  isTiltfileOrchestration: vi.fn<(projectRoot: string) => boolean>(),
}));

const nativeRuntime = vi.hoisted(() => ({
  requestNativeRestart:
    vi.fn<
      (
        projectRoot: string,
        service: string,
        options: { waitMs: number },
      ) => Promise<{ state: "not-running"; reason: string }>
    >(),
}));

const ports = vi.hoisted(() => ({
  resolveRuntimeTiltPort:
    vi.fn<(projectRoot: string, options: { envPort?: string }) => number | null>(),
}));

vi.mock("../../utils/paths.js", () => paths);
vi.mock("../../utils/tilt.js", () => tilt);
vi.mock("../../utils/container-restart.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/container-restart.js")>()),
  ...container,
}));
vi.mock("../../utils/discovery-context.js", () => discovery);
vi.mock("../../utils/native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-runtime.js")>()),
  ...nativeRuntime,
}));
vi.mock("../../generator/project-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generator/project-config.js")>()),
  ...orchestration,
}));
vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  ...ports,
}));

interface EnvelopeResult {
  schemaVersion: number;
  data: { resource: string; restarted: boolean } | null;
  errors: Array<{ code: string; message: string; suggestions?: string[] }>;
}

let stdout: string[];
let stderr: string[];
let capturedExitCode: number | null;

async function runRestart(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  envelope: EnvelopeResult | null;
}> {
  stdout = [];
  stderr = [];
  capturedExitCode = null;

  try {
    await restartCommand.parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof ProcessExitError) && (error as Error).message !== "exit") throw error;
  }

  const rawStdout = stdout.join("\n");
  let envelope: EnvelopeResult | null = null;
  if (rawStdout.trim().startsWith("{")) {
    try {
      envelope = parseEnvelope(rawStdout) as EnvelopeResult;
    } catch {
      envelope = null;
    }
  }

  return {
    stdout: rawStdout,
    stderr: stderr.join("\n"),
    exitCode: capturedExitCode,
    envelope,
  };
}

function expectTiltProbe(port = String(STANDARD_PORTS.tiltUi)): void {
  expect(tilt.runTilt).toHaveBeenCalledTimes(1);
  expect(tilt.runTilt).toHaveBeenCalledWith("get", ["uiresources", "-o", "json", "--port", port], {
    inheritStdio: false,
    timeoutMs: 5_000,
  });
}

/** `api` and `web` are container resources; `local` declares a top-level command (a local process). */
const resources = [
  {
    name: "api",
    stack: "main",
    config: { appName: "api", appType: "backend" },
  },
  {
    name: "web",
    stack: "main",
    config: { appName: "web", appType: "frontend" },
  },
  {
    name: "unknown-service",
    stack: "main",
    config: { appName: "unknown-service" },
  },
  {
    name: "local",
    stack: "main",
    config: { appName: "local", command: "node server.js" },
  },
];

describe("restart command unit tests", () => {
  const originalTiltPort = process.env.TILT_PORT;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    capturedExitCode = null;
    delete process.env.TILT_PORT;

    vi.spyOn(console, "log").mockImplementation((...parts) => {
      stdout.push(parts.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...parts) => {
      stderr.push(parts.join(" "));
    });

    vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      capturedExitCode ??= code;
      throw new ProcessExitError(code);
    }) as never);

    paths.findProjectRoot.mockReturnValue("/workspace/myproject");
    tilt.isTiltAvailable.mockResolvedValue(true);
    tilt.runTilt.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    nativeRuntime.requestNativeRestart.mockResolvedValue({
      state: "not-running",
      reason: "no local processes of this project are running",
    });
    container.restartContainer.mockReturnValue({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    orchestration.isTiltfileOrchestration.mockReturnValue(false);
    ports.resolveRuntimeTiltPort.mockImplementation((_root, { envPort }) =>
      envPort === undefined ? STANDARD_PORTS.tiltUi : Number(envPort),
    );
    // Resources the existing cases restart; a name absent from this list is unknown.
    discovery.createDiscoveryContext.mockReturnValue({ resources });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    restartCommand.setOptionValue("json", false);
    restartCommand.setOptionValue("port", undefined);
    restartCommand.setOptionValue("rebuild", false);
    if (originalTiltPort !== undefined) {
      process.env.TILT_PORT = originalTiltPort;
    } else {
      delete process.env.TILT_PORT;
    }
  });

  it("fails with USAGE error in text mode when --port is invalid", async () => {
    const { exitCode, stderr } = await runRestart(["api", "--port", "not-a-port"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("--port must be a valid port number");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("fails with USAGE error in text mode when TILT_PORT env is invalid", async () => {
    process.env.TILT_PORT = "70000";
    const { exitCode, stderr } = await runRestart(["api"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("TILT_PORT must be a valid port number");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("fails with error in text mode when executed outside a Flisk project", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const { exitCode, stderr } = await runRestart(["api"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Could not find project root");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports UNKNOWN_RESOURCE in text mode for a name not in the project, before probing Tilt", async () => {
    const { exitCode, stderr } = await runRestart(["nope"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('Resource "nope" not found in project.');
    expect(stderr).toContain("Resources: api, local, web, unknown-service");
    expect(stderr).toContain("See the names with: flisk resources");
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports UNKNOWN_RESOURCE in --json mode with project resource suggestions, before probing Tilt", async () => {
    const { envelope, exitCode } = await runRestart(["nope", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "UNKNOWN_RESOURCE",
      message: 'Resource "nope" not found in project.',
      suggestions: [
        "Resources: api, local, web, unknown-service",
        "See the names with: flisk resources",
      ],
    });
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("puts the closest resource name first for a near-miss in --json mode", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [{ name: "zeta" }, { name: "ok1" }],
    });

    const { envelope, exitCode } = await runRestart(["ok", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "UNKNOWN_RESOURCE",
      message: 'Resource "ok" not found in project.',
      suggestions: [
        'Did you mean "ok1"?',
        "Resources: ok1, zeta",
        "See the names with: flisk resources",
      ],
    });
  });

  it("reports NATIVE_RESTART_UNSUPPORTED for a local-process project without probing Tilt", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [
        { name: "api", config: { appName: "api", command: "node api.js" } },
        { name: "web", config: { appName: "web", command: "node web.js" } },
      ],
    });

    const { envelope, exitCode, stderr } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.data).toBeNull();
    expect(envelope?.errors[0]).toEqual({
      code: "NATIVE_RESTART_UNSUPPORTED",
      message:
        "`flisk restart` requires Tilt and works on Tilt resources; this project runs as local processes (no Tilt).",
      suggestions: ["Restart the project with: flisk down && flisk up"],
    });
    expect(stderr).not.toContain("Start it with: flisk up");
    expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(nativeRuntime.requestNativeRestart).toHaveBeenCalledWith("/workspace/myproject", "api", {
      waitMs: 60_000,
    });
  });

  it("reports error in text mode when isTiltAvailable returns false", async () => {
    tilt.isTiltAvailable.mockResolvedValue(false);

    const { exitCode, stderr } = await runRestart(["api"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Could not reach Tilt on port 10350");
    expect(stderr).toContain("Start the stack first with: flisk up");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when isTiltAvailable returns false", async () => {
    tilt.isTiltAvailable.mockResolvedValue(false);

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(envelope?.errors[0]?.message).toContain(String(STANDARD_PORTS.tiltUi));
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when isTiltAvailable throws", async () => {
    tilt.isTiltAvailable.mockRejectedValue(new Error("Tilt check crashed"));

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("fails with error message and exit code when trigger output indicates connection failure for a local process", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connect: connection refused",
    });

    const { exitCode, stderr } = await runRestart(["local"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Could not reach Tilt on port 10350");
    expect(stderr).toContain("Start the stack first with: flisk up");
  });

  it("reports TILT_NOT_RUNNING when trigger output indicates connection failure for a local process in --json mode", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connect: connection refused",
    });

    const { envelope, exitCode } = await runRestart(["local", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(envelope?.errors[0]?.message).toContain("Start it with: flisk up");
  });

  it("reports TILT_NOT_RUNNING when trigger output has empty stderr for a local process", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "   ",
    });

    const { exitCode, stderr } = await runRestart(["local"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Could not reach Tilt on port 10350");
    expect(stderr).toContain("Start the stack first with: flisk up");
  });

  it("reports TILT_NOT_RUNNING when trigger fails with empty stderr in --json mode for a local process", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });

    const { envelope, exitCode } = await runRestart(["local", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
  });

  it("reports TILT_TRIGGER_FAILED when trigger fails with a non-connection error for a local process", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: 'resource "unknown-service" not found',
    });

    const { envelope, exitCode } = await runRestart(["local", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "TILT_TRIGGER_FAILED",
      message: 'resource "unknown-service" not found',
    });
  });

  it("writes machine error when action throws an unexpected error in --json mode", async () => {
    paths.findProjectRoot.mockImplementation(() => {
      throw new Error("File system failure");
    });

    const { envelope, exitCode, stderr } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(2);
    expect(envelope?.errors[0]).toEqual({
      code: "INTERNAL",
      message: "File system failure",
    });
    expect(stderr).toContain("File system failure");
  });

  it("fails with USAGE error in --json mode when --port is invalid", async () => {
    const { envelope, exitCode, stderr } = await runRestart([
      "api",
      "--port",
      "not-a-port",
      "--json",
    ]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("--port must be a valid port number");
    expect(envelope?.errors[0]).toEqual({
      code: "USAGE",
      message: "--port must be a valid port number",
    });
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("fails with USAGE error in --json mode when TILT_PORT env is invalid", async () => {
    process.env.TILT_PORT = "70000";
    const { envelope, exitCode, stderr } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(2);
    expect(stderr).toContain("TILT_PORT must be a valid port number");
    expect(envelope?.errors[0]).toEqual({
      code: "USAGE",
      message: "TILT_PORT must be a valid port number",
    });
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("fails with COMMAND_FAILED error when executed outside a Flisk project", async () => {
    paths.findProjectRoot.mockReturnValue(null);

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("COMMAND_FAILED");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  // #4192: container resources restart without rebuilding the image.

  it.each([
    {
      scenario: "explicit port",
      args: ["--port", "1"],
      port: "1",
      resolvedPort: 10350,
    },
    {
      scenario: "saved port after down",
      args: [],
      port: "10600",
      resolvedPort: 10600,
    },
  ])(
    "reports one TILT_NOT_RUNNING envelope when Tilt is unreachable on the $scenario",
    async ({ args, port, resolvedPort }) => {
      ports.resolveRuntimeTiltPort.mockReturnValue(resolvedPort);
      tilt.runTilt.mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "connect: connection refused",
      });

      const { envelope, exitCode, stdout, stderr } = await runRestart(["api", ...args, "--json"]);

      expect(exitCode).toBe(1);
      expect(envelope?.schemaVersion).toBe(1);
      expect(envelope?.data).toBeNull();
      expect(envelope?.errors).toHaveLength(1);
      expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
      expect(envelope?.errors[0]?.message).toContain(`Could not reach Tilt on port ${port}.`);
      expect(stdout.split("\n")).toHaveLength(1);
      expect(stderr).toBe("");
      expectTiltProbe(port);
      expect(container.restartContainer).not.toHaveBeenCalled();
    },
  );

  it("fails in text mode before touching Docker when Tilt is unreachable on the explicit port", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connection refused",
    });

    const { exitCode, stderr } = await runRestart(["api", "--port", "1"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Could not reach Tilt on port 1.");
    expect(stderr).toContain("Start the stack first with: flisk up");
    expectTiltProbe("1");
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when the bounded probe exits without an error message", async () => {
    tilt.runTilt.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "" });

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expectTiltProbe();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports one TILT_NOT_RUNNING envelope when the reachability probe throws", async () => {
    tilt.runTilt.mockRejectedValue(new Error("Failed to spawn tilt"));

    const { envelope, exitCode, stdout, stderr } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors).toHaveLength(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(stdout.split("\n")).toHaveLength(1);
    expect(stderr).toBe("");
    expectTiltProbe();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("does not query Tilt or touch Docker when port resolution rejects a foreign Tilt", async () => {
    ports.resolveRuntimeTiltPort.mockReturnValue(null);

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(tilt.runTilt).not.toHaveBeenCalled();
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it.each([
    {
      scenario: "explicit flag over env and saved port",
      args: ["--port", "10500"],
      envPort: "10400",
      resolvedPort: 10600,
      port: "10500",
    },
    {
      scenario: "environment port",
      args: [],
      envPort: "10400",
      resolvedPort: 10400,
      port: "10400",
    },
    {
      scenario: "saved runtime port",
      args: [],
      envPort: undefined,
      resolvedPort: 10600,
      port: "10600",
    },
    {
      scenario: "default port",
      args: [],
      envPort: undefined,
      resolvedPort: 10350,
      port: "10350",
    },
  ])(
    "probes the $scenario before restarting the container",
    async ({ args, envPort, resolvedPort, port }) => {
      if (envPort !== undefined) process.env.TILT_PORT = envPort;
      ports.resolveRuntimeTiltPort.mockReturnValue(resolvedPort);

      const { envelope, exitCode } = await runRestart(["api", ...args, "--json"]);

      expect(exitCode).toBeNull();
      expect(envelope?.data).toEqual({ resource: "api", restarted: true });
      expectTiltProbe(port);
      expect(container.restartContainer).toHaveBeenCalledWith(
        "/workspace/myproject",
        "main",
        "api",
      );
      expect(tilt.runTilt.mock.invocationCallOrder[0]).toBeLessThan(
        container.restartContainer.mock.invocationCallOrder[0],
      );
      if (args.length > 0) {
        expect(ports.resolveRuntimeTiltPort).not.toHaveBeenCalled();
      } else {
        expect(ports.resolveRuntimeTiltPort).toHaveBeenCalledWith("/workspace/myproject", {
          envPort,
        });
      }
    },
  );

  it.each(["api", "web"])(
    "restarts container resource %s through the labelled container, with no tilt trigger, in --json mode",
    async (name) => {
      const { envelope, exitCode } = await runRestart([name, "--json"]);

      expect(exitCode).toBeNull();
      expect(envelope?.schemaVersion).toBe(1);
      expect(envelope?.data).toEqual({ resource: name, restarted: true });
      expect(envelope?.errors).toEqual([]);
      expect(container.restartContainer).toHaveBeenCalledWith("/workspace/myproject", "main", name);
      expectTiltProbe();
    },
  );

  it("restarts a container resource in text mode without a tilt trigger", async () => {
    const { stdout, exitCode } = await runRestart(["web"]);

    expect(exitCode).toBeNull();
    expect(stdout).toContain("Restarted web");
    expect(stdout).not.toContain("Triggered restart");
    expect(container.restartContainer).toHaveBeenCalledWith("/workspace/myproject", "main", "web");
    expectTiltProbe();
  });

  it("falls back to the resource name when a container resource has no stack", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [{ name: "api", config: { appName: "api" } }],
    });

    await runRestart(["api"]);

    expect(container.restartContainer).toHaveBeenCalledWith("/workspace/myproject", "api", "api");
  });

  it("keeps tilt trigger for a local-process resource", async () => {
    const { stdout, exitCode } = await runRestart(["local"]);

    expect(exitCode).toBeNull();
    expect(stdout).toContain("Triggered restart for local");
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["local", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("keeps tilt trigger for a local-process resource in --json mode", async () => {
    const { envelope, exitCode } = await runRestart(["local", "--json"]);

    expect(exitCode).toBeNull();
    expect(envelope?.data).toEqual({ resource: "local", restarted: true });
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["local", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "keeps tilt trigger for imported Tiltfile containers with rebuild=%s in --json mode",
    async (rebuild) => {
      orchestration.isTiltfileOrchestration.mockReturnValue(true);
      const flags = rebuild ? ["--rebuild"] : [];

      const { envelope, exitCode } = await runRestart([
        "api",
        "--port",
        "10500",
        ...flags,
        "--json",
      ]);

      expect(exitCode).toBeNull();
      expect(envelope?.data).toEqual({ resource: "api", restarted: true });
      expect(tilt.runTilt).toHaveBeenCalledTimes(1);
      expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "10500"], {
        inheritStdio: false,
      });
      expect(container.restartContainer).not.toHaveBeenCalled();
    },
  );

  it("keeps tilt trigger for imported Tiltfile containers in text mode", async () => {
    orchestration.isTiltfileOrchestration.mockReturnValue(true);

    const { stdout, exitCode } = await runRestart(["api"]);

    expect(exitCode).toBeNull();
    expect(stdout).toContain("Triggered restart for api");
    expect(orchestration.isTiltfileOrchestration).toHaveBeenCalledWith("/workspace/myproject");
    expect(tilt.runTilt).toHaveBeenCalledTimes(1);
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING through the imported Tiltfile fallback when Tilt is unreachable", async () => {
    orchestration.isTiltfileOrchestration.mockReturnValue(true);
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connection refused",
    });

    const { envelope, exitCode } = await runRestart(["api", "--port", "1", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(tilt.runTilt).toHaveBeenCalledTimes(1);
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "1"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("rebuilds through tilt trigger when --rebuild is passed for a container resource", async () => {
    const { stdout, exitCode } = await runRestart(["api", "--rebuild"]);

    expect(exitCode).toBeNull();
    expect(stdout).toContain("Triggered restart for api");
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("rebuilds through tilt trigger when --rebuild is passed in --json mode", async () => {
    const { envelope, exitCode } = await runRestart(["api", "--rebuild", "--json"]);

    expect(exitCode).toBeNull();
    expect(envelope?.data).toEqual({ resource: "api", restarted: true });
    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("keeps tilt trigger for a local-process resource even with --rebuild", async () => {
    await runRestart(["local", "--rebuild"]);

    expect(tilt.runTilt).toHaveBeenCalledWith("trigger", ["local", "--port", "10350"], {
      inheritStdio: false,
    });
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_NOT_RUNNING when a --rebuild trigger fails with a connection error", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "connect: connection refused",
    });

    const { envelope, exitCode } = await runRestart(["api", "--rebuild", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]?.code).toBe("TILT_NOT_RUNNING");
    expect(container.restartContainer).not.toHaveBeenCalled();
  });

  it("reports TILT_TRIGGER_FAILED when a --rebuild trigger fails with a non-connection error", async () => {
    tilt.runTilt.mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "trigger failed: image build error",
    });

    const { envelope, exitCode } = await runRestart(["api", "--rebuild", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "TILT_TRIGGER_FAILED",
      message: "trigger failed: image build error",
    });
  });

  it("reports TILT_TRIGGER_FAILED when the container restart fails in --json mode", async () => {
    container.restartContainer.mockImplementation(() => {
      throw new Error("No running container for api");
    });

    const { envelope, exitCode } = await runRestart(["api", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "TILT_TRIGGER_FAILED",
      message: "No running container for api",
    });
    expectTiltProbe();
  });

  it("reports the container restart failure with suggestions in text mode", async () => {
    const { FliskError } = await import("../../utils/errors.js");
    container.restartContainer.mockImplementation(() => {
      throw new FliskError("No running container for api", [
        "Start the stack first with: flisk up",
      ]);
    });

    const { exitCode, stderr } = await runRestart(["api"]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Failed to restart api: No running container for api");
    expect(stderr).toContain("Start the stack first with: flisk up");
    expectTiltProbe();
  });

  it("resolves port precedence for the --rebuild trigger: --port flag > TILT_PORT env > default", async () => {
    // 1. With --port flag overriding TILT_PORT
    process.env.TILT_PORT = "10400";
    await runRestart(["api", "--port", "10500", "--rebuild", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10500"], {
      inheritStdio: false,
    });

    // 2. Without --port flag, uses TILT_PORT
    restartCommand.setOptionValue("port", undefined);
    process.env.TILT_PORT = "10400";
    await runRestart(["api", "--rebuild", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10400"], {
      inheritStdio: false,
    });

    // 3. Without --port and without TILT_PORT, uses default (10350)
    delete process.env.TILT_PORT;
    restartCommand.setOptionValue("port", undefined);
    await runRestart(["api", "--rebuild", "--json"]);
    expect(tilt.runTilt).toHaveBeenLastCalledWith("trigger", ["api", "--port", "10350"], {
      inheritStdio: false,
    });
  });

  it("forwards container.stopGracePeriod from resource config to restartContainer", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [
        {
          name: "worker",
          stack: "main",
          config: {
            appType: "worker",
            container: { stopGracePeriod: "1m30s" },
          },
        },
      ],
    });
    tilt.runTilt.mockResolvedValue({ exitCode: 0, stdout: "NAME", stderr: "" });

    await runRestart(["worker"]);

    expect(container.restartContainer).toHaveBeenCalledWith(
      "/workspace/myproject",
      "main",
      "worker",
      undefined,
      { stopGracePeriod: "1m30s" },
    );
  });

  it.each([
    { name: "db", stack: "main", config: { appType: "database" } },
    { name: "ui-lib", stack: "main", config: { appType: "library" } },
    { name: "client-sdk", stack: "main", config: { appType: "sdk" } },
    { name: "legacy-db", stack: "main", type: "database" },
  ])(
    "preserves tilt trigger for non-container resource $name instead of running docker ps",
    async (resource) => {
      discovery.createDiscoveryContext.mockReturnValue({
        resources: [resource],
      });

      const { stdout, exitCode } = await runRestart([resource.name]);

      expect(exitCode).toBeNull();
      expect(stdout).toContain(`Triggered restart for ${resource.name}`);
      expect(tilt.runTilt).toHaveBeenCalledTimes(1);
      expect(tilt.runTilt).toHaveBeenCalledWith("trigger", [resource.name, "--port", "10350"], {
        inheritStdio: false,
      });
      expect(container.restartContainer).not.toHaveBeenCalled();
    },
  );

  it("restarts direct and nested sidecarOf containers sequentially after their host", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [
        { name: "tubehaus", stack: "tube", config: { appType: "bring-your-own" } },
        {
          name: "bgutil",
          stack: "tube",
          config: { appType: "bring-your-own", sidecarOf: "tubehaus" },
        },
        {
          name: "bgutil-helper",
          stack: "tube",
          config: {
            appType: "bring-your-own",
            sidecarOf: "bgutil",
            container: { stopGracePeriod: "45s" },
          },
        },
        { name: "unrelated", stack: "tube", config: { appType: "bring-your-own" } },
      ],
    });
    tilt.runTilt.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        items: [
          { metadata: { name: "tubehaus" } },
          { metadata: { name: "bgutil" } },
          { metadata: { name: "bgutil-helper" } },
        ],
      }),
      stderr: "",
    });

    await runRestart(["tubehaus"]);

    expect(container.restartContainer).toHaveBeenCalledTimes(3);
    expect(container.restartContainer).toHaveBeenNthCalledWith(
      1,
      "/workspace/myproject",
      "tube",
      "tubehaus",
    );
    expect(container.restartContainer).toHaveBeenNthCalledWith(
      2,
      "/workspace/myproject",
      "tube",
      "bgutil",
    );
    expect(container.restartContainer).toHaveBeenNthCalledWith(
      3,
      "/workspace/myproject",
      "tube",
      "bgutil-helper",
      undefined,
      { stopGracePeriod: "45s" },
    );
  });

  it("skips dependent sidecars disabled by --only or omitted from the active Tilt session", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [
        { name: "tubehaus", stack: "tube", config: { appType: "bring-your-own" } },
        {
          name: "bgutil",
          stack: "tube",
          config: { appType: "bring-your-own", sidecarOf: "tubehaus" },
        },
        {
          name: "bgutil-profiled",
          stack: "tube",
          config: { appType: "bring-your-own", sidecarOf: "tubehaus", profiles: ["debug"] },
        },
      ],
    });
    tilt.runTilt.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        items: [
          { metadata: { name: "tubehaus" } },
          { metadata: { name: "bgutil" }, status: { disableStatus: { state: "Disabled" } } },
        ],
      }),
      stderr: "",
    });

    const { exitCode } = await runRestart(["tubehaus", "--json"]);

    expect(exitCode).toBeNull();
    expect(container.restartContainer).toHaveBeenCalledTimes(1);
    expect(container.restartContainer).toHaveBeenCalledWith(
      "/workspace/myproject",
      "tube",
      "tubehaus",
    );
  });

  it("keeps missing-container errors when the explicitly requested target is excluded in Tilt", async () => {
    discovery.createDiscoveryContext.mockReturnValue({
      resources: [
        { name: "tubehaus", stack: "tube", config: { appType: "bring-your-own" } },
        {
          name: "bgutil",
          stack: "tube",
          config: { appType: "bring-your-own", sidecarOf: "tubehaus" },
        },
      ],
    });
    tilt.runTilt.mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({
        items: [
          { metadata: { name: "tubehaus" }, status: { disableStatus: { state: "Disabled" } } },
          { metadata: { name: "bgutil" }, status: { disableStatus: { state: "Disabled" } } },
        ],
      }),
      stderr: "",
    });
    container.restartContainer.mockImplementation(() => {
      throw new Error("No container for tubehaus in Compose project p-tube-autogenerated.");
    });

    const { envelope, exitCode } = await runRestart(["tubehaus", "--json"]);

    expect(exitCode).toBe(1);
    expect(envelope?.errors[0]).toEqual({
      code: "TILT_TRIGGER_FAILED",
      message: "No container for tubehaus in Compose project p-tube-autogenerated.",
    });
    expect(container.restartContainer).toHaveBeenCalledTimes(1);
    expect(container.restartContainer).toHaveBeenCalledWith(
      "/workspace/myproject",
      "tube",
      "tubehaus",
    );
  });
});
