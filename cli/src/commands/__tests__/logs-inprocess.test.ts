// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// In-process cases for `flisk logs`: a project of `command` services reads its own log files (no Tilt), a text-mode
// usage error, and the Tilt reads that fail or cannot be parsed. Discovery, the native runtime and Tilt are doubles,
// so each case states the services, states and lines it sees.

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
  readNativeLogLines: vi.fn((): NativeLogLine[] => []),
}));
const secrets = vi.hoisted(() => ({ envSecretValues: vi.fn((): string[] => []) }));

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

import { logsCommand } from "../logs.js";

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" });
const line = (resource: string, text: string): NativeLogLine => ({
  time: "2026-10-31T10:00:00.000Z",
  resource,
  level: null,
  source: null,
  text,
});
const NATIVE = [
  makeResource("api", "backend", { command: "node api.js" }),
  makeResource("frontend", "frontend", { command: "vite" }),
];

/**
 * Commander keeps option values on the command object between parses, so put every option back to its default first.
 * One module instance (no `vi.resetModules`) keeps v8 coverage attributed to a single copy of logs.ts.
 */
function resetOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
}

async function runLogs(args: string[]) {
  resetOptions(logsCommand);
  return runCommandInProcess(logsCommand, args, tmpdir());
}

describe("flisk logs (in-process)", () => {
  beforeEach(() => {
    process.exitCode = 0;
    delete process.env.TILT_PORT;
    paths.findProjectRoot.mockReturnValue("/project");
    tilt.isTiltAvailable.mockResolvedValue(true);
    services.discoverResourcesFromRoot.mockReturnValue([]);
    nativeService.isNativeProject.mockReturnValue(false);
    secrets.envSecretValues.mockReturnValue([]);
  });
  afterEach(() => {
    vi.resetAllMocks();
    process.exitCode = 0;
  });

  describe("a project of command services", () => {
    beforeEach(() => {
      services.discoverResourcesFromRoot.mockReturnValue(NATIVE);
      nativeService.isNativeProject.mockReturnValue(true);
    });

    it("--json reads every service's log files, redacts secrets, and never asks Tilt", async () => {
      secrets.envSecretValues.mockReturnValue(["hunter2-secret"]);
      nativeRuntime.readNativeLogLines.mockReturnValue([
        line("api", "listening with token hunter2-secret"),
        line("frontend", "ready"),
      ]);

      const run = await runLogs(["--json", "--tail", "50"]);
      const envelope = parseEnvelope(run.stdout);

      expect(run.status).toBeUndefined();
      expect(envelope.errors).toEqual([]);
      expect(envelope.data).toMatchObject({ services: [], tail: 50, since: null });
      expect(envelope.data.lines.map((l: NativeLogLine) => l.text)).toEqual([
        "listening with token [REDACTED]",
        "ready",
      ]);
      expect(nativeRuntime.readNativeLogLines).toHaveBeenCalledWith(
        "/project",
        ["api", "frontend"],
        {
          tail: 50,
          sinceMs: undefined,
        },
      );
      expect(tilt.isTiltAvailable).not.toHaveBeenCalled();
      expect(tilt.runTilt).not.toHaveBeenCalled();
    });

    it("prints each line behind its service name, padded to the longest, with secrets redacted", async () => {
      secrets.envSecretValues.mockReturnValue(["hunter2-secret"]);
      nativeRuntime.readNativeLogLines.mockReturnValue([
        line("api", "token=hunter2-secret"),
        line("frontend", "ready"),
      ]);

      const run = await runLogs([]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toBe("api      | token=[REDACTED]\nfrontend | ready\n");
      expect(tilt.runTilt).not.toHaveBeenCalled();
    });

    it("rejects a service the project does not declare with UNKNOWN_SERVICE and exit 2", async () => {
      const run = await runLogs(["--json", "--service", "apii"]);
      const envelope = parseEnvelope(run.stdout);

      expect(run.status).toBe(2);
      expect(envelope.errors[0]).toMatchObject({ code: "UNKNOWN_SERVICE" });
      expect(envelope.errors[0]?.message).toContain("Unknown service apii");
      expect(nativeRuntime.readNativeLogLines).not.toHaveBeenCalled();
    });

    it("--unhealthy --since reads only the failing services, from that long ago", async () => {
      nativeRuntime.nativeServiceStates.mockReturnValue({
        api: { status: "ready" },
        frontend: { status: "pending", reason: "starting" },
      });
      nativeRuntime.readNativeLogLines.mockReturnValue([line("frontend", "compiling")]);

      const run = await runLogs(["--json", "--unhealthy", "--since", "5m"]);

      expect(run.status).toBeUndefined();
      expect(parseEnvelope(run.stdout).data).toMatchObject({
        since: "5m",
        lines: [{ resource: "frontend", text: "compiling" }],
      });
      expect(nativeRuntime.nativeServiceStates).toHaveBeenCalledWith("/project", [
        "api",
        "frontend",
      ]);
      expect(nativeRuntime.readNativeLogLines).toHaveBeenCalledWith("/project", ["frontend"], {
        tail: 200,
        sinceMs: 300_000,
      });
    });

    it("--unhealthy reports all healthy without reading log files when every service is ready", async () => {
      nativeRuntime.nativeServiceStates.mockReturnValue({
        api: { status: "ready" },
        frontend: { status: "ready" },
      });

      const run = await runLogs(["--json", "--unhealthy", "--service", "api"]);

      expect(parseEnvelope(run.stdout).data).toEqual({
        services: ["api"],
        tail: 200,
        since: null,
        lines: [],
        unhealthy: [],
      });
      expect(nativeRuntime.readNativeLogLines).not.toHaveBeenCalled();
    });
  });

  it("prints a text-mode usage error without suggestions and exits 2", async () => {
    const run = await runLogs(["--tail", "0"]);

    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("--tail must be an integer from 1 to");
    expect(run.stderr).not.toContain("Suggestions");
  });

  it("falls back to Tilt when discovery throws, and still fetches logs when the resource list cannot be read", async () => {
    services.discoverResourcesFromRoot.mockImplementation(() => {
      throw new Error("bad manifest");
    });
    tilt.runTilt
      .mockRejectedValueOnce(new Error("spawn tilt ENOENT"))
      .mockResolvedValueOnce(ok("api | hello\n"));

    const run = await runLogs(["--service", "api", "--port", "10351"]);

    expect(run.status).toBeUndefined();
    expect(run.stdout).toBe("api | hello\n");
    expect(tilt.runTilt).toHaveBeenNthCalledWith(
      1,
      "get",
      ["uiresources", "-o", "json", "--port", "10351"],
      { inheritStdio: false },
    );
    expect(tilt.runTilt).toHaveBeenNthCalledWith(
      2,
      "logs",
      ["--port", "10351", "--tail", "200", "--", "api"],
      { inheritStdio: false },
    );
  });

  it("--unhealthy reports TILT_NOT_RUNNING when reading Tilt's resources throws", async () => {
    tilt.runTilt.mockRejectedValueOnce(new Error("connection refused"));

    const run = await runLogs(["--json", "--unhealthy"]);

    expect(run.status).toBe(1);
    expect(parseEnvelope(run.stdout).errors[0]).toMatchObject({ code: "TILT_NOT_RUNNING" });
    expect(tilt.runTilt).toHaveBeenCalledTimes(1);
  });

  it("--unhealthy reports TILT_NOT_RUNNING when Tilt's resource JSON cannot be parsed", async () => {
    tilt.runTilt.mockResolvedValueOnce(ok("not json"));

    const run = await runLogs(["--json", "--unhealthy"]);

    expect(run.status).toBe(1);
    expect(parseEnvelope(run.stdout).errors[0]).toMatchObject({ code: "TILT_NOT_RUNNING" });
    expect(tilt.runTilt).toHaveBeenCalledTimes(1);
  });

  it("--unhealthy uses Tilt's own states when the project's discovery fails", async () => {
    services.discoverResourcesFromRoot.mockImplementation(() => {
      throw new Error("bad manifest");
    });
    tilt.runTilt
      .mockResolvedValueOnce(
        ok(
          JSON.stringify({
            items: [
              {
                metadata: { name: "api" },
                status: { updateStatus: "error", runtimeStatus: "none" },
              },
              { metadata: { name: "web" }, status: { updateStatus: "ok", runtimeStatus: "ok" } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(ok(""));

    const run = await runLogs(["--json", "--unhealthy"]);

    expect(run.status).toBeUndefined();
    expect(parseEnvelope(run.stdout).data).toMatchObject({ lines: [] });
    const args = tilt.runTilt.mock.calls[1]?.[1] as string[];
    expect(args).toContain("--json");
    expect(args.slice(args.indexOf("--") + 1)).toEqual(["api"]);
  });
  it("--unhealthy reads the project's dependsOn edges alongside Tilt's states", async () => {
    services.discoverResourcesFromRoot.mockReturnValue([
      makeResource("api", "backend"),
      makeResource("web", "frontend", { dependsOn: ["api"] }),
    ]);
    tilt.runTilt
      .mockResolvedValueOnce(
        ok(
          JSON.stringify({
            items: [
              {
                metadata: { name: "api" },
                status: { updateStatus: "error", runtimeStatus: "none" },
              },
              { metadata: { name: "web" }, status: { updateStatus: "ok", runtimeStatus: "ok" } },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(ok("api | crashed\n"));

    const run = await runLogs(["--unhealthy"]);

    expect(run.status).toBeUndefined();
    expect(run.stdout).toBe("api | crashed\n");
    expect(services.discoverResourcesFromRoot).toHaveBeenCalledWith("/project");
    const args = tilt.runTilt.mock.calls[1]?.[1] as string[];
    expect(args).not.toContain("--json");
    expect(args.slice(args.indexOf("--") + 1)).toContain("api");
  });
});
