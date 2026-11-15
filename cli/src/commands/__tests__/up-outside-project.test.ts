// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

const mocks = vi.hoisted(() => ({
  findProjectRoot: vi.fn<() => string | null>(() => null),
  pruneSupersededTiltImages: vi.fn(async () => ({
    removed: [] as string[],
    kept: [] as string[],
    removedBytes: 0,
  })),
  enforceBuildCacheCeiling: vi.fn(async () => ({ pruned: false, ceilingGib: 20 })),
  enforceDiskGuard: vi.fn(() => ({
    level: "ok" as const,
    failBelowGib: 5,
    warnBelowGib: 15,
    message: "ok",
  })),
  readDockerVmFreeGib: vi.fn<() => number | null>(() => null),
  assertMachineReadyOrExit: vi.fn(async () => {}),
  detectHost: vi.fn(() => ({ kind: "local" as const, canUp: true })),
  getContainerRuntimeStatus: vi.fn(() => "running" as const),
  isTiltAvailable: vi.fn(async () => true),
}));

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: mocks.findProjectRoot,
}));
vi.mock("../../utils/tilt-images.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt-images.js")>()),
  pruneSupersededTiltImages: mocks.pruneSupersededTiltImages,
}));
vi.mock("../../utils/docker-build-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker-build-cache.js")>()),
  enforceBuildCacheCeiling: mocks.enforceBuildCacheCeiling,
}));
vi.mock("../../utils/disk-guard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/disk-guard.js")>()),
  enforceDiskGuard: mocks.enforceDiskGuard,
  readDockerVmFreeGib: mocks.readDockerVmFreeGib,
}));
vi.mock("../../utils/cold-preflight.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cold-preflight.js")>()),
  assertMachineReadyOrExit: mocks.assertMachineReadyOrExit,
}));
vi.mock("../../utils/agent-host.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/agent-host.js")>()),
  detectHost: mocks.detectHost,
}));
vi.mock("../../utils/docker.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker.js")>()),
  getContainerRuntimeStatus: mocks.getContainerRuntimeStatus,
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  isTiltAvailable: mocks.isTiltAvailable,
  runTilt: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

import { upCommand } from "../up.js";

/** Commander keeps option values across parseAsync calls, so reset them before each in-process invocation. */
function resetCommandOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
}

/** Creates a fake `docker` executable on a temp directory that logs every invocation line by line. */
function createRecordingDockerDir(options: { sleepSeconds?: number } = {}): {
  binDir: string;
  logFile: string;
} {
  const binDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-fake-docker-")));
  const logFile = join(binDir, "docker-calls.log");
  const sleepLine = options.sleepSeconds ? `sleep ${options.sleepSeconds}\n` : "";
  const shBody = `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logFile}"\n${sleepLine}exit 0\n`;
  const shPath = join(binDir, "docker");
  writeFileSync(shPath, shBody, "utf-8");
  chmodSync(shPath, 0o755);

  if (process.platform === "win32") {
    const cmdBody = `@echo off\r\necho %*>>"${logFile}"\r\nexit /b 0\r\n`;
    writeFileSync(join(binDir, "docker.cmd"), cmdBody, "utf-8");
  }
  return { binDir, logFile };
}

function readRecordedDockerCalls(logFile: string): string[] {
  if (!existsSync(logFile)) return [];
  const raw = readFileSync(logFile, "utf-8").trim();
  return raw ? raw.split(/\r?\n/) : [];
}

describe("flisk up outside a project (#4282)", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits with not-in-project and makes zero Docker calls in an empty folder", () => {
    const emptyDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-up-no-project-")));
    const { binDir, logFile } = createRecordingDockerDir();
    tempDirs.push(emptyDir, binDir);

    const fakePath = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    const result = runFlisk(["up"], {
      cwd: emptyDir,
      env: { PATH: fakePath, FLISK_ALLOW_NATIVE_WINDOWS: "1" },
      timeout: 60_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Could not find project root (no .flisk/project.json found)");
    expect(readRecordedDockerCalls(logFile)).toEqual([]);
  }, 60_000);

  it("emits the JSON error envelope and makes zero Docker calls outside a project", () => {
    const emptyDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-up-no-project-json-")));
    const { binDir, logFile } = createRecordingDockerDir();
    tempDirs.push(emptyDir, binDir);

    const fakePath = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
    const result = runFlisk(["up", "--json"], {
      cwd: emptyDir,
      env: { PATH: fakePath, FLISK_ALLOW_NATIVE_WINDOWS: "1" },
      timeout: 60_000,
    });

    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toEqual({ ok: false });
    expect(envelope.errors).toEqual([
      expect.objectContaining({
        code: "COMMAND_FAILED",
        message: expect.stringContaining(
          "Could not find project root (no .flisk/project.json found)",
        ),
      }),
    ]);
    expect(readRecordedDockerCalls(logFile)).toEqual([]);
  }, 60_000);
});

describe("flisk up guard ordering and timing (#4282)", () => {
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FLISK_ALLOW_NATIVE_WINDOWS", "1");
    mocks.findProjectRoot.mockReturnValue(null);
    mocks.detectHost.mockReturnValue({ kind: "local", canUp: true });
    mocks.getContainerRuntimeStatus.mockReturnValue("running");
    mocks.isTiltAvailable.mockResolvedValue(true);
    mocks.readDockerVmFreeGib.mockReturnValue(null);
    mocks.enforceDiskGuard.mockReturnValue({
      level: "ok",
      failBelowGib: 5,
      warnBelowGib: 15,
      message: "ok",
    });
    mocks.pruneSupersededTiltImages.mockResolvedValue({ removed: [], kept: [], removedBytes: 0 });
    mocks.enforceBuildCacheCeiling.mockResolvedValue({ pruned: false, ceilingGib: 20 });
    mocks.assertMachineReadyOrExit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finishes in under 1 second outside a project even when Docker operations are slow", async () => {
    const emptyDir = realpathSync(mkdtempSync(join(tmpdir(), "flisk-up-fast-fail-")));
    const { binDir, logFile } = createRecordingDockerDir({ sleepSeconds: 5 });
    tempDirs.push(emptyDir, binDir);

    vi.stubEnv("PATH", `${binDir}${delimiter}${process.env.PATH ?? ""}`);
    mocks.findProjectRoot.mockReturnValue(null);
    mocks.pruneSupersededTiltImages.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ removed: [], kept: [], removedBytes: 0 }), 5000),
        ),
    );
    mocks.enforceBuildCacheCeiling.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ pruned: false, ceilingGib: 20 }), 5000),
        ),
    );
    mocks.assertMachineReadyOrExit.mockRejectedValue(new Error("machine preflight should not run"));

    process.chdir(emptyDir);
    resetCommandOptions(upCommand);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const startedAt = Date.now();
    try {
      await expect(upCommand.parseAsync([], { from: "user" })).rejects.toThrow("process.exit(1)");
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeLessThan(1000);
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(errorSpy.mock.calls.flat().join("\n")).toContain("Could not find project root");
      expect(mocks.pruneSupersededTiltImages).not.toHaveBeenCalled();
      expect(mocks.enforceBuildCacheCeiling).not.toHaveBeenCalled();
      expect(mocks.enforceDiskGuard).not.toHaveBeenCalled();
      expect(mocks.readDockerVmFreeGib).not.toHaveBeenCalled();
      expect(mocks.assertMachineReadyOrExit).not.toHaveBeenCalled();
      expect(readRecordedDockerCalls(logFile)).toEqual([]);
    } finally {
      exitSpy.mockRestore();
      errorSpy.mockRestore();
    }
  }, 20_000);

  it("still runs image prune, cache trim, and disk guard in order inside a real project before startup", async () => {
    const projectDir = createTempProject({});
    tempDirs.push(projectDir);

    const order: string[] = [];
    mocks.findProjectRoot.mockImplementation(() => projectDir);
    mocks.pruneSupersededTiltImages.mockImplementation(async () => {
      order.push("prune-tilt-images");
      return { removed: [], kept: [], removedBytes: 0 };
    });
    mocks.enforceBuildCacheCeiling.mockImplementation(async () => {
      order.push("trim-build-cache");
      return { pruned: false, ceilingGib: 20 };
    });
    mocks.enforceDiskGuard.mockImplementation(() => {
      order.push("disk-guard");
      return { level: "ok", failBelowGib: 5, warnBelowGib: 15, message: "ok" };
    });
    mocks.assertMachineReadyOrExit.mockImplementation(async () => {
      order.push("machine-preflight");
      throw new Error("stop-before-tilt");
    });

    process.chdir(projectDir);
    resetCommandOptions(upCommand);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await expect(upCommand.parseAsync([], { from: "user" })).rejects.toThrow("stop-before-tilt");
      expect(order).toEqual([
        "prune-tilt-images",
        "trim-build-cache",
        "disk-guard",
        "machine-preflight",
      ]);
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});
