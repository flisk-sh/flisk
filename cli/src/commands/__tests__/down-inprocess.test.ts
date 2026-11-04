// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// In-process cases for `flisk down`: a project of `command` services stops its local processes (no Tilt), the Tilt
// path's focus targets, `tilt up` stop and verbose line, the Compose fallback that cannot run, and the Docker build
// cache prune prompt. Discovery, Docker, Tilt and the native runtime are doubles, so each case states what it sees.

import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnvelope, runCommandInProcess } from "../../test-support/index.js";
import type { DiscoveredResource } from "../../types/index.js";

const paths = vi.hoisted(() => ({ findProjectRoot: vi.fn<(from?: string) => string | null>() }));
const docker = vi.hoisted(() => ({ getContainerRuntimeStatus: vi.fn(() => "running") }));
const tilt = vi.hoisted(() => ({
  getTiltfilePath: vi.fn(() => "/project/.flisk/.flisk-out/Tiltfile"),
  isTiltAvailable: vi.fn(async () => true),
  runTilt: vi.fn(async () => ({ exitCode: 0, stdout: "", stderr: "" })),
}));
const cleanup = vi.hoisted(() => ({
  findRunningFliskProjects: vi.fn((): string[] => []),
  pruneProjectNetworks: vi.fn(),
  stopProjectComposeProjects: vi.fn(),
  stopProjectTiltUp: vi.fn((): number[] => []),
  waitForTiltUpExit: vi.fn(async () => true),
}));
const cache = vi.hoisted(() => ({ pruneDockerBuildCache: vi.fn() }));
const prompt = vi.hoisted(() => ({ promptConfirm: vi.fn<() => Promise<boolean>>() }));
const native = vi.hoisted(() => ({
  readNativeRunState: vi.fn((): unknown => null),
  stopNativeRun: vi.fn(),
}));
const nativeService = vi.hoisted(() => ({ isNativeProject: vi.fn(() => false) }));
const services = vi.hoisted(() => ({
  discoverResources: vi.fn((): DiscoveredResource[] => []),
  discoverResourcesFromRoot: vi.fn((): DiscoveredResource[] => []),
  discoverStacks: vi.fn((): Array<{ name: string }> => []),
}));
const json = vi.hoisted(() => ({ emitted: [] as unknown[] }));

vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  ...paths,
}));
vi.mock("../../utils/docker.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker.js")>()),
  ...docker,
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  ...tilt,
}));
vi.mock("../../utils/down-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/down-cleanup.js")>()),
  ...cleanup,
}));
vi.mock("../../utils/docker-build-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker-build-cache.js")>()),
  ...cache,
}));
vi.mock("../../utils/prompt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/prompt.js")>()),
  ...prompt,
}));
vi.mock("../../utils/native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-runtime.js")>()),
  ...native,
}));
vi.mock("../../utils/native-service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/native-service.js")>()),
  ...nativeService,
}));
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  ...services,
}));
// The real emitter writes with writeSync(1) and listens for `exit`; record the one object instead.
vi.mock("../../utils/json-output.js", () => ({
  createJsonEmitter: () => (data: unknown) => void json.emitted.push(data),
}));

import { downCommand } from "../down.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI colour codes from captured output.
const ANSI = /\u001b\[[0-9;]*m/g;

let root: string;
const stdinTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setStdinTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

/** Commander keeps option values on the command object between parses, so put every option back to its default. */
function resetOptions(command: Command): void {
  for (const option of command.options) {
    command.setOptionValue(option.attributeName(), option.defaultValue);
  }
}

async function runDown(args: string[]) {
  resetOptions(downCommand);
  const run = await runCommandInProcess(downCommand, args, root);
  return {
    ...run,
    stdout: run.stdout.replace(ANSI, ""),
    stderr: run.stderr.replace(ANSI, ""),
  };
}

describe("flisk down (in-process)", () => {
  beforeEach(() => {
    process.exitCode = 0;
    json.emitted = [];
    root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-down-inprocess-")));
    paths.findProjectRoot.mockReturnValue(root);
    docker.getContainerRuntimeStatus.mockReturnValue("running");
    tilt.getTiltfilePath.mockReturnValue(join(root, ".flisk/.flisk-out/Tiltfile"));
    tilt.isTiltAvailable.mockResolvedValue(true);
    tilt.runTilt.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    cleanup.findRunningFliskProjects.mockReturnValue([]);
    cleanup.stopProjectTiltUp.mockReturnValue([]);
    cleanup.waitForTiltUpExit.mockResolvedValue(true);
    native.readNativeRunState.mockReturnValue(null);
    nativeService.isNativeProject.mockReturnValue(false);
    services.discoverResources.mockReturnValue([]);
    services.discoverResourcesFromRoot.mockReturnValue([]);
    services.discoverStacks.mockReturnValue([]);
    setStdinTty(false);
  });
  afterEach(() => {
    vi.resetAllMocks();
    if (stdinTty) Object.defineProperty(process.stdin, "isTTY", stdinTty);
    else delete (process.stdin as { isTTY?: boolean }).isTTY;
    rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("--json rejects an invalid --cache-until with a machine error and exit 1", async () => {
    const run = await runDown(["--json", "--prune-cache", "--cache-until", "soon"]);
    const envelope = parseEnvelope(run.stdout);

    expect(run.status).toBe(1);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0]?.message).toBe('Invalid --cache-until format: "soon"');
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  describe("a project of command services", () => {
    it("--json --dry-run reports the native runtime and the cache prune it would run", async () => {
      native.readNativeRunState.mockReturnValue({ pid: 4242, services: { api: {} } });

      const run = await runDown(["--json", "--dry-run", "--prune-cache", "48h"]);

      expect(run.status).toBeUndefined();
      expect(json.emitted).toEqual([
        { ok: true, dryRun: true, runtime: "native", wouldPruneCache: { until: "48h" } },
      ]);
      expect(native.stopNativeRun).not.toHaveBeenCalled();
      expect(tilt.runTilt).not.toHaveBeenCalled();
    });

    it("--dry-run prints the local-process plan and the cache prune it would run", async () => {
      nativeService.isNativeProject.mockReturnValue(true);

      const run = await runDown(["--dry-run", "--prune-cache", "--cache-until", "2h"]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toContain("Dry run - not stopping local processes");
      expect(run.stdout).toContain("Would run: stop the local processes of this project");
      expect(run.stdout).toContain(
        "Dry run - not pruning Docker build cache (would run: docker builder prune -f --filter until=2h)",
      );
      expect(native.stopNativeRun).not.toHaveBeenCalled();
    });

    it("stops the local processes and names them", async () => {
      nativeService.isNativeProject.mockReturnValue(true);
      native.stopNativeRun.mockResolvedValue({ wasRunning: true, services: ["api", "web"] });

      const run = await runDown([]);

      expect(run.status).toBeUndefined();
      expect(native.stopNativeRun).toHaveBeenCalledWith(root);
      expect(run.stdout).toContain("Stopped local processes: api, web");
      expect(tilt.runTilt).not.toHaveBeenCalled();
    });

    it("says nothing is running when no local run is on record", async () => {
      nativeService.isNativeProject.mockReturnValue(true);
      native.stopNativeRun.mockResolvedValue({ wasRunning: false, services: [] });

      const run = await runDown([]);

      expect(run.stdout).toContain("Nothing is running for this project.");
    });

    it("--json reports the stopped services in one envelope", async () => {
      nativeService.isNativeProject.mockReturnValue(true);
      native.stopNativeRun.mockResolvedValue({ wasRunning: true, services: ["api"] });

      const run = await runDown(["--json"]);

      expect(run.stdout).toBe("");
      expect(json.emitted).toEqual([{ ok: true, runtime: "native", stopped: ["api"] }]);
    });
  });

  it("uses Tilt when discovery throws, and prints the dry-run cache prune it would run", async () => {
    services.discoverResourcesFromRoot.mockImplementation(() => {
      throw new Error("bad manifest");
    });

    const run = await runDown(["--dry-run", "--prune-cache"]);

    expect(run.status).toBeUndefined();
    expect(run.stdout).toContain("Dry run - not stopping resources");
    expect(run.stdout).toContain("Would run: tilt down");
    expect(run.stdout).toContain("--filter until=24h)");
    expect(native.stopNativeRun).not.toHaveBeenCalled();
    expect(tilt.runTilt).not.toHaveBeenCalled();
  });

  it("focuses tilt down on every stack, stops tilt up first, and prints the verbose command", async () => {
    services.discoverStacks.mockReturnValue([{ name: "shop" }, { name: "ops" }]);
    cleanup.stopProjectTiltUp.mockReturnValue([1234, 5678]);

    const run = await runDown(["--verbose"]);

    expect(run.status).toBeUndefined();
    expect(cleanup.stopProjectTiltUp).toHaveBeenCalledWith(
      join(root, ".flisk/.flisk-out/Tiltfile"),
    );
    expect(cleanup.waitForTiltUpExit).toHaveBeenCalledWith(
      join(root, ".flisk/.flisk-out/Tiltfile"),
    );
    expect(run.stdout).toContain("Stopped tilt up (pid 1234, 5678).");
    expect(run.stdout).toContain("Running: tilt down -f .flisk/.flisk-out/Tiltfile");
    const [subcommand, args, options] = tilt.runTilt.mock.calls[0] as unknown as [
      string,
      string[],
      { verbose: boolean; inheritStdio: boolean },
    ];
    expect(subcommand).toBe("down");
    expect(args.slice(-2)).toEqual(["--", "--focus=shop,ops"]);
    expect(options).toEqual({ verbose: true, inheritStdio: true });
  });

  it("runs tilt down without a focus when stacks cannot be listed", async () => {
    services.discoverResources.mockImplementation(() => {
      throw new Error("bad manifest");
    });

    const run = await runDown(["--json"]);

    expect(run.status).toBeUndefined();
    const args = (tilt.runTilt.mock.calls[0] as unknown as [string, string[]])[1];
    expect(args.join(" ")).not.toContain("--focus");
    expect(json.emitted).toEqual([{ ok: true, stoppedTilt: [] }]);
  });

  it("fails with tilt down's exit code when the Compose fallback itself throws", async () => {
    tilt.runTilt.mockResolvedValue({ exitCode: 3, stdout: "", stderr: "Tiltfile error" });
    cleanup.stopProjectComposeProjects.mockImplementation(() => {
      throw new Error("docker unavailable");
    });

    const run = await runDown([]);

    expect(run.status).toBe(3);
    expect(cleanup.stopProjectComposeProjects).toHaveBeenCalledWith(root);
    expect(run.stderr).toContain("tilt down failed with exit code 3");
  });

  it("--prune-networks skips network pruning when the project root is gone by then", async () => {
    // Every lookup before tilt down finds the root; the network prune after it finds none.
    let isRootGone = false;
    paths.findProjectRoot.mockImplementation(() => (isRootGone ? null : root));
    tilt.runTilt.mockImplementation(async () => {
      isRootGone = true;
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const run = await runDown(["--json", "--prune-networks"]);

    expect(run.status).toBeUndefined();
    expect(cleanup.pruneProjectNetworks).not.toHaveBeenCalled();
    expect(json.emitted).toEqual([{ ok: true, stoppedTilt: [] }]);
  });

  describe("--prune-cache", () => {
    it("without --yes outside a terminal skips the prune and says why", async () => {
      const run = await runDown(["--prune-cache"]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toContain(
        "Skipping Docker build cache prune: confirmation required; run in a terminal or pass --yes.",
      );
      expect(cache.pruneDockerBuildCache).not.toHaveBeenCalled();
      expect(prompt.promptConfirm).not.toHaveBeenCalled();
    });

    it("in a terminal warns that the cache is shared, asks, and prunes when confirmed", async () => {
      setStdinTty(true);
      prompt.promptConfirm.mockResolvedValue(true);
      cache.pruneDockerBuildCache.mockResolvedValue({ reclaimed: "1.2GB" });

      const run = await runDown(["--prune-cache", "7d"]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toContain(
        "Notice: Docker build cache is shared across all projects on this machine.",
      );
      expect(prompt.promptConfirm).toHaveBeenCalledWith({
        message: "Prune Docker build cache older than 7d?",
        initial: false,
      });
      expect(cache.pruneDockerBuildCache).toHaveBeenCalledWith({ until: "7d" });
      expect(run.stdout).toContain(
        "Pruned Docker build cache: 1.2GB reclaimed (filter: until=7d).",
      );
    });

    it("in a terminal skips the prune when the user declines", async () => {
      setStdinTty(true);
      prompt.promptConfirm.mockResolvedValue(false);

      const run = await runDown(["--prune-cache"]);

      expect(run.stdout).toContain("Skipped Docker build cache prune.");
      expect(cache.pruneDockerBuildCache).not.toHaveBeenCalled();
    });

    it("in a terminal treats a cancelled prompt as declined", async () => {
      setStdinTty(true);
      prompt.promptConfirm.mockRejectedValue(new Error("cancelled"));

      const run = await runDown(["--prune-cache"]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toContain("Skipped Docker build cache prune.");
      expect(cache.pruneDockerBuildCache).not.toHaveBeenCalled();
    });

    it("with --yes reports a failed prune as a warning and still succeeds", async () => {
      cache.pruneDockerBuildCache.mockRejectedValue(new Error("builder busy"));

      const run = await runDown(["--prune-cache", "--yes"]);

      expect(run.status).toBeUndefined();
      expect(run.stdout).toContain("Could not prune Docker build cache: builder busy");
    });

    it("with --yes --json records a non-Error prune failure as skipped", async () => {
      cache.pruneDockerBuildCache.mockRejectedValue("daemon gone");

      const run = await runDown(["--prune-cache", "--yes", "--json"]);

      expect(run.stdout).toBe("");
      expect(json.emitted).toEqual([
        {
          ok: true,
          stoppedTilt: [],
          prunedCache: { until: "24h", skipped: true, reason: "daemon gone" },
        },
      ]);
    });
  });
});
