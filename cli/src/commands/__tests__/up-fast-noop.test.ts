// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The #4193 command-level contract: a second `flisk up` on an unchanged, healthy stack answers from one read-only
// look at Tilt, with no regenerated files, no `tilt up` and no Docker image build/tag pass.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/doubles.js";
import { runCommandInProcess } from "../../test-support/run-in-process.js";
import type { DiscoveredResource } from "../../types/index.js";
import type { FastNoopFlags, FastNoopState, UP_STATE_VERSION } from "../../utils/up-fast-noop.js";

const mocks = vi.hoisted(() => ({
  runTilt: vi.fn(),
  generateMasterConfigs: vi.fn(async () => {}),
  writeTextFileAtomic: vi.fn(),
  areMasterFilesStale: vi.fn(() => false),
  isVendoredEngineStale: vi.fn(() => false),
  isWrappedTiltfileStale: vi.fn(() => false),
  verifyMasterConfigs: vi.fn(() => ({
    valid: true,
    errors: [],
    warnings: [],
    diffs: [],
    handEdited: [],
  })),
  discoverResourcesStrict: vi.fn(() => [] as DiscoveredResource[]),
  discoverResourcesWithProblems: vi.fn(() => ({ resources: [] as unknown[], problems: [] })),
  tiltGetUiResources: vi.fn(async () => null as string | null),
  findTiltPortOwner: vi.fn(() => null as { pid: number; root: string } | null),
  findStaleDisabledResources: vi.fn(() => [] as string[]),
  getDeferredResourceNames: vi.fn(() => new Set<string>()),
  getHostPortPlan: vi.fn(async () => ({
    ingressHttp: 8080,
    ingressHttps: 8443,
    postgres: 5432,
    requested: { ingressHttp: 8080, ingressHttps: 8443, postgres: 5432 },
    explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
    reason: { ingressHttp: "default", ingressHttps: "default", postgres: "default" },
  })),
  findProjectTiltPorts: vi.fn(async () => ({
    running: [] as number[],
    foreign: [] as unknown[],
    savedRunning: [] as number[],
    unknownSaved: [] as number[],
  })),
  readSavedTiltPort: vi.fn(() => null as number | null),
  writeSavedHostPortPlan: vi.fn(),
  enforceDiskGuard: vi.fn(() => ({ level: "ok", failBelowGib: 5, warnBelowGib: 15, message: "" })),
  readDockerVmFreeGib: vi.fn(() => null),
  pruneSupersededTiltImages: vi.fn(async () => ({ removed: [], removedBytes: 0 })),
  enforceBuildCacheCeiling: vi.fn(async () => ({ pruned: false })),
  hostUpRefusal: vi.fn(async () => null),
  assertMachineReadyOrExit: vi.fn(async () => {}),
  withTiltCheck: vi.fn(async (action: () => Promise<unknown>) => action()),
  requireProjectRoot: vi.fn(() => ""),
  findProjectRoot: vi.fn(() => ""),
  upAndWait: vi.fn(),
  checkPrintedUrls: vi.fn(async (targets: readonly { service: string; url: string }[]) =>
    targets.map((target) => ({ service: target.service, url: target.url, didAnswer: true })),
  ),
}));

vi.mock("../../generator/template-engine.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generator/template-engine.js")>()),
  areMasterFilesStale: mocks.areMasterFilesStale,
  generateMasterConfigs: mocks.generateMasterConfigs,
  isVendoredEngineStale: mocks.isVendoredEngineStale,
  isWrappedTiltfileStale: mocks.isWrappedTiltfileStale,
  verifyMasterConfigs: mocks.verifyMasterConfigs,
  isTiltfileOrchestration: () => false,
}));
vi.mock("../../utils/atomic-write.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/atomic-write.js")>()),
  writeTextFileAtomic: mocks.writeTextFileAtomic,
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  runTilt: mocks.runTilt,
}));
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  discoverResourcesStrict: mocks.discoverResourcesStrict,
  discoverResourcesWithProblems: mocks.discoverResourcesWithProblems,
  discoverServiceManifestPaths: () => [],
}));
vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: mocks.findProjectRoot,
}));
vi.mock("../../utils/errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/errors.js")>()),
  requireProjectRoot: mocks.requireProjectRoot,
  withTiltCheck: mocks.withTiltCheck,
}));
vi.mock("../../utils/up-readiness.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/up-readiness.js")>()),
  tiltGetUiResources: mocks.tiltGetUiResources,
}));
vi.mock("../../utils/tilt-port-owner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt-port-owner.js")>()),
  findTiltPortOwner: mocks.findTiltPortOwner,
  findProjectTiltPorts: mocks.findProjectTiltPorts,
}));
vi.mock("../../utils/doctor-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/doctor-runtime.js")>()),
  findStaleDisabledResources: mocks.findStaleDisabledResources,
  getDeferredResourceNames: mocks.getDeferredResourceNames,
}));
vi.mock("../../utils/disk-guard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/disk-guard.js")>()),
  enforceDiskGuard: mocks.enforceDiskGuard,
  readDockerVmFreeGib: mocks.readDockerVmFreeGib,
}));
vi.mock("../../utils/tilt-images.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt-images.js")>()),
  pruneSupersededTiltImages: mocks.pruneSupersededTiltImages,
}));
vi.mock("../../utils/docker-build-cache.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/docker-build-cache.js")>()),
  enforceBuildCacheCeiling: mocks.enforceBuildCacheCeiling,
}));
vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  getHostPortPlan: mocks.getHostPortPlan,
  readSavedTiltPort: mocks.readSavedTiltPort,
  writeSavedHostPortPlan: mocks.writeSavedHostPortPlan,
}));
vi.mock("../../utils/cold-preflight.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cold-preflight.js")>()),
  assertMachineReadyOrExit: mocks.assertMachineReadyOrExit,
}));
vi.mock("../../utils/agent-host.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/agent-host.js")>()),
  detectHost: () => ({ kind: "local", canUp: true }),
}));
vi.mock("../../utils/project-owner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/project-owner.js")>()),
  findForeignContainerOwners: () => [],
}));
vi.mock("../../utils/project-registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/project-registry.js")>()),
  projectNameAt: () => null,
  recordProjectRoot: vi.fn(),
}));
vi.mock("../../utils/url-check.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/url-check.js")>()),
  checkPrintedUrls: mocks.checkPrintedUrls,
}));
vi.mock("../../utils/up-wait.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/up-wait.js")>();
  return { ...actual, upAndWait: mocks.upAndWait };
});
// `createJsonEmitter` writes with writeSync(1), not console.log, so the JSON envelope is captured here.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, default: actual, writeSync: vi.fn(actual.writeSync) };
});

import {
  isPlainUp,
  stackFingerprint,
  statePathFor,
  tryFastNoop,
  UP_STATE_VERSION as VERSION,
} from "../../utils/up-fast-noop.js";
import { fastNoopFlags, upCommand } from "../up.js";

let projectDir: string;
let home: string;
const resources = [
  makeResource("api", "backend"),
  makeResource("web", "frontend"),
  makeResource("job", "worker"),
];

/** A full project config, so a fallback run can take the normal path far enough to reach `tilt up`. */
const PROJECT_JSON = {
  version: "1.0.0",
  project: { name: "shop", version: "1.0.0" },
  phases: Object.fromEntries(
    ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
      name,
      { name, description: "", enabledStacks: [] },
    ]),
  ),
  optional_infra: {
    monitoring: false,
    elk: false,
    debezium: false,
    golden_image: false,
    verdaccio: false,
  },
  capabilities: { gateway: true, database: true },
  discovery: { paths: ["services/**"] },
};

const flags = (overrides: Partial<FastNoopFlags> = {}): FastNoopFlags => ({
  configuredTiltPort: undefined,
  env: process.env,
  ...overrides,
});

/**
 * The command calls `tryFastNoop` with these very mocks before anything else; a null answer is the fallback. Asserting
 * on the helper keeps these cases about the decision itself, while the hit cases above prove the command's wiring.
 */
const fastVerdict = (f: FastNoopFlags = flags()) => tryFastNoop(projectDir, f);

const readyJson = (names = ["api", "web", "job", "(Tiltfile)"]) =>
  JSON.stringify({
    items: names.map((name) => ({
      metadata: { name },
      status: { updateStatus: "ok", runtimeStatus: "ok" },
    })),
  });

/** Writes the state a healthy run leaves behind, with the fingerprint of the fixture project. */
function recordHealthyState(overrides: Partial<FastNoopState> = {}): void {
  const fingerprint = stackFingerprint(projectDir, flags());
  if (!fingerprint) throw new Error("fixture needs a generated Tiltfile");
  const record: FastNoopState = {
    version: VERSION as typeof UP_STATE_VERSION,
    fingerprint,
    tiltPort: 10350,
    tiltPid: 42,
    stack: null,
    services: ["api", "web", "job"],
    ingressPort: 8080,
    urls: ["http://app.project.localhost:8080/web", "http://api.project.localhost:8080/api/api"],
    ...overrides,
  };
  mkdirSync(join(statePathFor(projectDir), ".."), { recursive: true });
  writeFileSync(statePathFor(projectDir), `${JSON.stringify(record)}\n`);
}

/** `upCommand` keeps option values between in-process runs. */
function resetOptions(): void {
  for (const name of [
    "verbose",
    "quiet",
    "dryRun",
    "force",
    "ignoreDrift",
    "ignoreVersion",
    "database",
    "gateway",
    "json",
    "wait",
    "only",
    "profile",
    "envFile",
    "waitTimeout",
  ]) {
    upCommand.setOptionValue(name, name === "database" || name === "gateway" ? true : undefined);
  }
  upCommand.setOptionValue("verbose", false);
  upCommand.setOptionValue("quiet", false);
  upCommand.setOptionValue("dryRun", false);
  upCommand.setOptionValue("force", false);
  upCommand.setOptionValue("ignoreDrift", false);
  upCommand.setOptionValue("ignoreVersion", false);
  upCommand.setOptionValue("json", false);
  upCommand.setOptionValue("wait", false);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "flisk-up-noop-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "flisk-up-noop-project-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("FLISK_ALLOW_NATIVE_WINDOWS", "1");
  delete process.env.TILT_PORT;
  mkdirSync(join(projectDir, ".flisk", ".flisk-out"), { recursive: true });
  writeFileSync(join(projectDir, ".flisk", "project.json"), `${JSON.stringify(PROJECT_JSON)}\n`);
  writeFileSync(join(projectDir, ".flisk", ".flisk-out", "Tiltfile"), "# generated\n");
  mocks.findProjectRoot.mockReturnValue(projectDir);
  mocks.requireProjectRoot.mockReturnValue(projectDir);
  mocks.discoverResourcesStrict.mockReturnValue(resources);
  mocks.discoverResourcesWithProblems.mockReturnValue({ resources, problems: [] });
  mocks.tiltGetUiResources.mockResolvedValue(readyJson());
  mocks.findTiltPortOwner.mockReturnValue({ pid: 42, root: projectDir });
  mocks.findStaleDisabledResources.mockReturnValue([]);
  mocks.getDeferredResourceNames.mockReturnValue(new Set());
  mocks.areMasterFilesStale.mockReturnValue(false);
  mocks.isVendoredEngineStale.mockReturnValue(false);
  mocks.isWrappedTiltfileStale.mockReturnValue(false);
  mocks.verifyMasterConfigs.mockReturnValue({
    valid: true,
    errors: [],
    warnings: [],
    diffs: [],
    handEdited: [],
  });
  mocks.runTilt.mockClear();
  mocks.generateMasterConfigs.mockClear();
  mocks.writeTextFileAtomic.mockClear();
  mocks.pruneSupersededTiltImages.mockClear();
  mocks.enforceBuildCacheCeiling.mockClear();
  mocks.upAndWait.mockReset();
  resetOptions();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(home, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("flisk up fast no-op on an unchanged, healthy stack (#4193)", () => {
  it("prints the URLs and Stack is healthy without triggering a Tilt build/re-tag pass", async () => {
    recordHealthyState();
    // Without the fast path the normal run would reach `tilt up`; stop it there so a regression fails at once
    // with a clear reason instead of waiting out its readiness poll.
    mocks.runTilt.mockImplementationOnce(() => {
      throw new Error("STOP_BEFORE_WAIT");
    });
    const result = await runCommandInProcess(upCommand, [], projectDir);
    const output = stripVTControlCharacters(result.stdout);
    expect(output).toContain("Stack is healthy.");
    expect(output).toContain("http://app.project.localhost:8080/web");
    expect(output).toContain("http://api.project.localhost:8080/api/api");
    expect(output).toContain("Tilt: http://localhost:10350");
    // No `tilt up`, no generated-file rewrite and no Docker image/cache work: none can tag an image.
    expect(mocks.runTilt).not.toHaveBeenCalled();
    expect(mocks.generateMasterConfigs).not.toHaveBeenCalled();
    expect(mocks.writeTextFileAtomic).not.toHaveBeenCalled();
    expect(mocks.pruneSupersededTiltImages).not.toHaveBeenCalled();
    expect(mocks.enforceBuildCacheCeiling).not.toHaveBeenCalled();
    expect(result.status).toBeUndefined();
  });

  it("emits one JSON envelope with the URLs and no errors under --json", async () => {
    recordHealthyState();
    let written = "";
    vi.mocked(writeSync).mockClear();
    vi.mocked(writeSync).mockImplementation(((fd: number, data: string) => {
      if (fd === 1) written += data;
      return data.length;
    }) as never);
    await upCommand.parseAsync(["--json"], { from: "user" });
    const envelope = JSON.parse(written.trim().split("\n")[0] as string);
    expect(envelope.data.ok).toBe(true);
    expect(envelope.data.alreadyRunning).toBe(true);
    expect(envelope.data.tiltUrl).toBe("http://localhost:10350");
    expect(envelope.data.services).toEqual(["api", "web", "job"]);
    expect(envelope.data.advertisedUrls).toHaveLength(2);
    expect(envelope.errors).toEqual([]);
    expect(mocks.runTilt).not.toHaveBeenCalled();
  });

  it("prints nothing extra under --quiet", async () => {
    recordHealthyState();
    const result = await runCommandInProcess(upCommand, ["--quiet"], projectDir);
    expect(stripVTControlCharacters(result.stdout)).toBe("");
    expect(mocks.runTilt).not.toHaveBeenCalled();
  });

  it("falls back to the normal up path when Tilt is unreachable", async () => {
    recordHealthyState();
    mocks.tiltGetUiResources.mockResolvedValue(null);
    expect(await fastVerdict()).toBeNull();
    // The normal path is reached: it claims a port, stops any old Tilt and starts `tilt up`. A throw from the
    // mock stops it before its readiness wait, which would otherwise poll a Tilt that is not running.
    mocks.runTilt.mockImplementationOnce(() => {
      throw new Error("STOP_BEFORE_WAIT");
    });
    await expect(upCommand.parseAsync(["--quiet"], { from: "user" })).rejects.toThrow(
      "STOP_BEFORE_WAIT",
    );
    expect(mocks.runTilt).toHaveBeenCalledWith("up", expect.any(Array), expect.any(Object));
  });

  it("falls back when a resource is unhealthy", async () => {
    recordHealthyState();
    mocks.tiltGetUiResources.mockResolvedValue(
      JSON.stringify({
        items: ["api", "web", "job", "(Tiltfile)"].map((name) => ({
          metadata: { name },
          status:
            name === "api"
              ? { updateStatus: "error", runtimeStatus: "error" }
              : { updateStatus: "ok", runtimeStatus: "ok" },
        })),
      }),
    );
    expect(await fastVerdict()).toBeNull();
  });

  it("falls back when a resource is missing from Tilt", async () => {
    recordHealthyState();
    mocks.tiltGetUiResources.mockResolvedValue(readyJson(["api", "web", "(Tiltfile)"]));
    expect(await fastVerdict()).toBeNull();
  });

  it("falls back when config, .env or a service definition changed", async () => {
    recordHealthyState();
    writeFileSync(join(projectDir, ".env"), "API_KEY=changed\n");
    expect(await fastVerdict()).toBeNull();
  });

  it("falls back when a generated file changed", async () => {
    recordHealthyState();
    writeFileSync(join(projectDir, ".flisk", ".flisk-out", "spec.master"), "RESOURCES = {}\n");
    expect(await fastVerdict()).toBeNull();
  });

  it.each([
    ["--force", { force: true }],
    ["--dry-run", { dryRun: true }],
    ["--only", { only: ["api"] }],
    ["--env-file", { envFile: ".env" }],
    ["--profile", { profile: ["admin"] }],
    ["--no-database", { database: false }],
    ["--no-gateway", { gateway: false }],
    ["a stack name", { stackName: "shop" }],
  ])("falls back for %s", async (_label, override) => {
    recordHealthyState();
    expect(isPlainUp(flags(override))).toBe(false);
    expect(await fastVerdict(flags(override))).toBeNull();
  });

  it("falls back when TILT_PORT points at a different port", async () => {
    recordHealthyState();
    // A configured port is not a flag: isPlainUp stays true, and the port comparison refuses the no-op.
    expect(isPlainUp(flags({ configuredTiltPort: 10351 }))).toBe(true);
    expect(await fastVerdict(flags({ configuredTiltPort: 10351 }))).toBeNull();
  });

  it("falls back when the port is held by another project's Tilt", async () => {
    recordHealthyState();
    mocks.findTiltPortOwner.mockReturnValue({ pid: 7, root: "/work/other" });
    expect(await fastVerdict()).toBeNull();
  });

  it("falls back when port ownership cannot be confirmed", async () => {
    recordHealthyState();
    mocks.findTiltPortOwner.mockReturnValue(null);
    expect(await fastVerdict()).toBeNull();
  });

  it("falls back when there is no recorded healthy run", async () => {
    expect(await fastVerdict()).toBeNull();
  });

  it("snapshots process.env before startup assigns TILT_PORT so fresh invocations match", () => {
    const prev = process.env.TILT_PORT;
    delete process.env.TILT_PORT;
    try {
      const captured = fastNoopFlags({}, undefined, undefined);
      const before = stackFingerprint(projectDir, captured);
      process.env.TILT_PORT = "10350";
      const afterRecording = stackFingerprint(projectDir, captured);
      expect(before).not.toBeNull();
      expect(afterRecording).toBe(before);
      delete process.env.TILT_PORT;
      expect(stackFingerprint(projectDir, fastNoopFlags({}, undefined, undefined))).toBe(
        afterRecording,
      );
    } finally {
      if (prev === undefined) delete process.env.TILT_PORT;
      else process.env.TILT_PORT = prev;
    }
  });

  it("passes the recorded URLs through `flisk up --wait`'s human output", async () => {
    const urls = ["http://app.project.localhost:8080/web"];
    mocks.upAndWait.mockResolvedValue({
      kind: "ready",
      json: JSON.stringify({
        schemaVersion: 1,
        data: { ok: true, tiltUrl: "http://localhost:10350", advertisedUrls: urls },
        errors: [],
      }),
    });
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    try {
      await expect(upCommand.parseAsync(["--wait"], { from: "user" })).rejects.toThrow(
        "process.exit",
      );
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }
    const output = stripVTControlCharacters(lines.join("\n"));
    expect(output).toContain("Stack is healthy.");
    expect(output).toContain(urls[0]);
    expect(output).toContain("Tilt: http://localhost:10350");
  });

  it("forwards the child's JSON envelope unchanged under `up --wait --json`", async () => {
    const envelope = {
      schemaVersion: 1,
      data: {
        ok: true,
        alreadyRunning: true,
        tiltUrl: "http://localhost:10350",
        advertisedUrls: ["http://app.project.localhost:8080/web"],
      },
      errors: [],
    };
    mocks.upAndWait.mockResolvedValue({ kind: "ready", json: JSON.stringify(envelope) });
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);
    try {
      await expect(upCommand.parseAsync(["--wait", "--json"], { from: "user" })).rejects.toThrow(
        "process.exit",
      );
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      exit.mockRestore();
      log.mockRestore();
    }
    expect(JSON.parse(lines[0] as string)).toEqual(envelope);
  });
});
