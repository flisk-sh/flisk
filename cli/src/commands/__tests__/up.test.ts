// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectConfigNotFoundError,
  verifyMasterConfigs,
} from "../../generator/template-engine.js";
import { captureExit } from "../../test-support/index.js";
import { PROJECT_ENV_FILE_VAR } from "../../utils/env-selection.js";
import { requireProjectRoot } from "../../utils/errors.js";
import { findProjectRoot } from "../../utils/paths.js";
import { runTilt } from "../../utils/tilt.js";
import { classifyTiltPorts } from "../../utils/tilt-port-owner.js";
import { findTiltProcessIdsOnPort, stopTiltOnPort } from "../../utils/tilt-process.js";
import {
  parseTiltPort,
  resolveTiltPort,
  secondUpAction,
  stopTiltForUp,
} from "../../utils/tilt-startup.js";
import {
  DRIFT_EXIT_CODE,
  driftReport,
  enforceDriftGate,
  enforceVersionFloor,
  formatUpSuccess,
  nativeWindowsUpRefusal,
  selectRunEnvFile,
  upCommand,
  waitForTiltUnlessStartupFailed,
} from "../up.js";

vi.mock("../../generator/template-engine.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../generator/template-engine.js")>()),
  verifyMasterConfigs: vi.fn(),
}));
vi.mock("../../utils/tilt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt.js")>()),
  runTilt: vi.fn(),
}));
vi.mock("../../utils/errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/errors.js")>()),
  requireProjectRoot: vi.fn(() => "/project"),
  withTiltCheck: vi.fn(async (action: () => Promise<unknown>) => action()),
}));
vi.mock("../../utils/agent-host.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/agent-host.js")>()),
  detectHost: vi.fn(() => ({ kind: "local", canUp: true })),
}));
vi.mock("../../utils/services.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/services.js")>()),
  discoverResourcesStrict: vi.fn(() => []),
}));
vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: vi.fn(() => "/project"),
}));
vi.mock("../../utils/cold-preflight.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/cold-preflight.js")>()),
  assertMachineReadyOrExit: vi.fn(async () => {}),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, default: actual, writeSync: vi.fn(actual.writeSync) };
});
vi.mock("../../utils/host-port-config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/host-port-config.js")>()),
  getHostPortPlan: vi.fn(async () => ({ ports: [] })),
}));
vi.mock("../../utils/tilt-port-owner.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/tilt-port-owner.js")>()),
  classifyTiltPorts: vi.fn(async () => ({ running: [] as number[], foreign: [] as unknown[] })),
}));

/**
 * The exit code the "Exit codes" table in `CONTRIBUTING.md` lists for a diagnostic.
 *
 * The table is the published contract, so a change to the code that returns the exit code has to
 * change the table with it. Reading the number back out of the document keeps the two in step.
 */
function documentedExitCode(diagnostic: string): number {
  const contributing = readFileSync(
    new URL("../../../../CONTRIBUTING.md", import.meta.url),
    "utf-8",
  );
  const section = contributing.split("## Exit codes")[1];
  if (!section) throw new Error("CONTRIBUTING.md has no 'Exit codes' section");
  const row = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .find((line) => line.includes(diagnostic));
  if (!row) throw new Error(`CONTRIBUTING.md lists no exit code for "${diagnostic}"`);
  const code = Number(row.split("|")[1]?.trim().replace(/`/g, ""));
  if (!Number.isInteger(code)) {
    throw new Error(`CONTRIBUTING.md has no exit code for "${diagnostic}"`);
  }
  return code;
}

describe("tdk up success output", () => {
  it("prints the first-win block with exact UI and networks copy", () => {
    expect(formatUpSuccess(10350)).toEqual([
      "TDK is up.",
      "Tilt UI: http://localhost:10350",
      "App URLs:",
      "  run: tdk networks",
      "Stop: tdk down",
    ]);
  });

  it("includes at most five discovered app URLs", () => {
    const lines = formatUpSuccess(10351, ["a", "b", "c", "d", "e", "f"]);
    expect(lines.filter((line) => /^ {2}/.test(line))).toEqual(["  a", "  b", "  c", "  d", "  e"]);
  });
});

describe("tdk up platform contract", () => {
  it("refuses native Windows unless the explicit escape hatch is set", () => {
    expect(nativeWindowsUpRefusal("win32")).toBe(
      "Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only.",
    );
    expect(nativeWindowsUpRefusal("win32", "0")).not.toBeNull();
    expect(nativeWindowsUpRefusal("win32", "1")).toBeNull();
    expect(nativeWindowsUpRefusal("linux")).toBeNull();
  });

  it("exits 1 on native Windows startup refusal and writes the diagnostic to stderr", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const allowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    const tiltPort = process.env.TILT_PORT;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { exit } = captureExit();
    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      delete process.env.TILT_PORT;

      await expect(upCommand.parseAsync([], { from: "user" })).rejects.toThrow("process.exit");

      expect(exit).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(
          "❌ Landscape startup needs Ubuntu on WSL2. Native Windows is inspect-only.",
        ),
      );
      expect(log).not.toHaveBeenCalled();
    } finally {
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      if (allowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = allowNativeWindows;
      if (tiltPort === undefined) delete process.env.TILT_PORT;
      else process.env.TILT_PORT = tiltPort;
      exit.mockRestore();
      error.mockRestore();
      log.mockRestore();
    }
  });

  it("documents the native Windows startup refusal under the exit code it returns", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const allowNativeWindows = process.env.TDK_ALLOW_NATIVE_WINDOWS;
    const tiltPort = process.env.TILT_PORT;
    const { exit } = captureExit();
    let actual: number | undefined;
    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      delete process.env.TILT_PORT;

      await expect(upCommand.parseAsync([], { from: "user" })).rejects.toThrow("process.exit");
      actual = exit.mock.calls[0]?.[0] as number;
    } finally {
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      if (allowNativeWindows === undefined) delete process.env.TDK_ALLOW_NATIVE_WINDOWS;
      else process.env.TDK_ALLOW_NATIVE_WINDOWS = allowNativeWindows;
      if (tiltPort === undefined) delete process.env.TILT_PORT;
      else process.env.TILT_PORT = tiltPort;
      exit.mockRestore();
    }

    const documented = documentedExitCode("native Windows startup refusal");
    expect(documented).toBe(actual);
  });
});

describe("Tilt force cleanup", () => {
  it("finds only Tilt listeners on the requested port", () => {
    const runner = vi.fn((command: string) => {
      if (command === "lsof") return "123\n456\n";
      if (command === "ps") return "tilt\n";
      return "";
    });

    expect(findTiltProcessIdsOnPort(10351, "linux", runner)).toEqual([123, 456]);
    expect(runner).toHaveBeenNthCalledWith(1, "lsof", ["-nP", "-t", "-iTCP:10351", "-sTCP:LISTEN"]);
    expect(runner).toHaveBeenNthCalledWith(2, "ps", ["-p", "123", "-o", "comm="]);
    expect(runner).toHaveBeenNthCalledWith(3, "ps", ["-p", "456", "-o", "comm="]);
  });

  it("does not terminate a non-Tilt process on the selected port", () => {
    const runner = vi.fn((command: string) => {
      if (command === "lsof") return "123\n";
      if (command === "ps") return "postgres\n";
      return "";
    });

    expect(stopTiltOnPort(5432, "linux", runner)).toEqual([]);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("treats a successful empty port lookup as no existing Tilt process", () => {
    const runner = vi.fn(() => "");
    expect(stopTiltOnPort(10350, "linux", runner)).toEqual([]);
  });

  it("fails closed when listener discovery is unavailable", () => {
    const missingLsof = Object.assign(new Error("lsof unavailable"), { code: "ENOENT" });
    const runner = vi.fn(() => {
      throw missingLsof;
    });

    expect(() => stopTiltOnPort(10350, "linux", runner)).toThrow(/Unable to inspect listeners/);
  });

  it("fails closed when lsof reports a discovery error", () => {
    const lookupError = Object.assign(new Error("permission denied"), {
      status: 1,
      stderr: "lsof: WARNING: can't stat()",
    });
    const runner = vi.fn(() => {
      throw lookupError;
    });

    expect(() => stopTiltOnPort(10350, "linux", runner)).toThrow(/Unable to inspect listeners/);
  });

  it("terminates the Tilt process only on the configured port", () => {
    const runner = vi.fn((command: string) => {
      if (command === "lsof") return "123\n";
      if (command === "ps") return "tilt\n";
      return "";
    });

    expect(stopTiltOnPort(10357, "darwin", runner)).toEqual([123]);
    expect(runner).toHaveBeenLastCalledWith("kill", ["-TERM", "123"]);
    expect(runner).not.toHaveBeenCalledWith("killall", expect.anything());
  });

  it("finds the Tilt process on the requested Windows port", () => {
    const runner = vi.fn((_command: string, _args: string[]) => "789\r\n");
    expect(findTiltProcessIdsOnPort(10350, "win32", runner)).toEqual([789]);
    expect(runner.mock.calls[0]?.[0]).toBe("powershell.exe");
    expect(runner.mock.calls[0]?.[1]?.[2]).toContain("LocalPort $port");
  });
});

describe("tdk up drift gate", () => {
  beforeEach(() => {
    vi.stubEnv("TDK_ALLOW_NATIVE_WINDOWS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const verdict = (valid: boolean, errors: string[] = [], handEdited: string[] = []) =>
    vi.mocked(verifyMasterConfigs).mockReturnValue({
      valid,
      errors,
      warnings: [],
      diffs: [],
      handEdited,
    });

  it("tdk up --dry-run exits 2 on a hand-edited generated file and never reaches Tilt", async () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    vi.mocked(runTilt).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();
    await expect(upCommand.parseAsync(["--dry-run"], { from: "user" })).rejects.toThrow(
      "process.exit",
    );
    expect(exit).toHaveBeenCalledWith(DRIFT_EXIT_CODE);
    expect(runTilt).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it("tdk up (not a dry run) exits 2 on a hand-edited generated file and never reaches Tilt", async () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    vi.mocked(runTilt).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();
    await expect(upCommand.parseAsync([], { from: "user" })).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(DRIFT_EXIT_CODE);
    expect(runTilt).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it("--json writes the DRIFT_DETECTED object to stdout before exiting", async () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(writeSync).mockClear();
    let written = "";
    vi.mocked(writeSync).mockImplementation(((fd: number, data: string) => {
      if (fd === 1) written += data;
      return data.length;
    }) as never);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      expect(written).toContain('"DRIFT_DETECTED"');
      throw new Error("process.exit");
    }) as never);
    await expect(upCommand.parseAsync(["--json", "--dry-run"], { from: "user" })).rejects.toThrow(
      "process.exit",
    );
    const payload = JSON.parse(written.trim().split("\n")[0] as string);
    expect(payload.errors[0].code).toBe("DRIFT_DETECTED");
    expect(payload.errors[0].message).toContain("Dockerfile.app.autogenerated");
    exit.mockRestore();
  });

  it("tdk up --dry-run --ignore-drift gets past the gate", async () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { exit } = captureExit();
    try {
      await upCommand.parseAsync(["--dry-run", "--ignore-drift"], { from: "user" });
    } catch {
      // Later dry-run steps may need a real project; only the drift exit matters here.
    }
    expect(exit).not.toHaveBeenCalledWith(DRIFT_EXIT_CODE);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--ignore-drift"));
    exit.mockRestore();
    warn.mockRestore();
  });

  it("names the drifted file and points at tdk config regenerate", () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    const report = driftReport("/project");
    expect(report?.join("\n")).toContain("Dockerfile.app.autogenerated");
    expect(report?.join("\n")).toContain("tdk config regenerate");
  });

  it("reports no drift when the project has no config yet", () => {
    vi.mocked(verifyMasterConfigs).mockImplementationOnce(() => {
      throw new ProjectConfigNotFoundError("Project config not found");
    });
    expect(driftReport("/project")).toBeNull();
  });

  it("does not turn an unreadable project config into 'no drift'", () => {
    vi.mocked(verifyMasterConfigs).mockImplementationOnce(() => {
      throw new Error("Invalid project.json");
    });
    expect(() => driftReport("/project")).toThrow("Invalid project.json");
  });

  it("does not treat a changed service.json or stale master output as drift", () => {
    verdict(false, [
      "services/app/api/service.json: service.json changed since generated outputs were written (run tdk up)",
      "Out of sync: .tdk/.tdk-out/spec.master (run 'tdk config regenerate')",
    ]);
    expect(driftReport("/project")).toBeNull();
  });

  it("reports nothing when generated files match", () => {
    verdict(true);
    expect(driftReport("/project")).toBeNull();
  });

  it("exits 2 before startup when a generated file drifted", () => {
    verdict(
      false,
      [
        "services/shop/api/.autogenerated/Dockerfile.app.autogenerated: generated file differs from its TDK snapshot (run tdk up to regenerate)",
      ],
      ["services/shop/api/.autogenerated/Dockerfile.app.autogenerated"],
    );
    const exit = vi.fn(() => {
      throw new Error("exit");
    }) as unknown as (code: number) => never;
    const onDrift = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => enforceDriftGate("/project", { onDrift }, exit)).toThrow("exit");
    expect(exit).toHaveBeenCalledWith(2);
    expect(onDrift).toHaveBeenCalledWith(expect.stringContaining("Dockerfile.app.autogenerated"));
  });

  it("--ignore-drift warns and does not check or exit", () => {
    vi.mocked(verifyMasterConfigs).mockClear();
    const exit = vi.fn() as unknown as (code: number) => never;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    enforceDriftGate("/project", { ignoreDrift: true }, exit);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--ignore-drift"));
    expect(verifyMasterConfigs).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("returns normally on a clean tree", () => {
    verdict(true);
    const exit = vi.fn() as unknown as (code: number) => never;
    enforceDriftGate("/project", {}, exit);
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("enforceVersionFloor", () => {
  let dir: string;
  const exit = () =>
    vi.fn((code: number) => {
      throw new Error(`exit ${code}`);
    }) as unknown as (code: number) => never;
  const write = (config: object) =>
    writeFileSync(join(dir, ".tdk", "project.json"), JSON.stringify(config));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-up-version-"));
    mkdirSync(join(dir, ".tdk"), { recursive: true });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("exits 1 with doctor's message when the CLI is older", () => {
    write({ minTdkVersion: "1.3.80" });
    const e = exit();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const onFail = vi.fn();
    expect(() => enforceVersionFloor(dir, { onFail }, "1.3.79", e)).toThrow("exit 1");
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining(
        "tdk 1.3.79 is older than the 1.3.80 this project requires (minTdkVersion)",
      ),
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Run: tdk upgrade"));
    expect(onFail).toHaveBeenCalledWith(expect.stringContaining("Run: tdk upgrade"));
  });

  it("exits 1 on a malformed value", () => {
    write({ minTdkVersion: "latest" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => enforceVersionFloor(dir, {}, "1.3.80", exit())).toThrow("exit 1");
  });

  it("passes at or above the floor and when no minTdkVersion is set", () => {
    const e = exit();
    write({ minTdkVersion: "1.3.80" });
    enforceVersionFloor(dir, {}, "1.3.80", e);
    enforceVersionFloor(dir, {}, "2.0.0", e);
    write({});
    enforceVersionFloor(dir, {}, "0.0.1", e);
    expect(e).not.toHaveBeenCalled();
  });

  it("--ignore-version warns and does not exit", () => {
    write({ minTdkVersion: "9.9.9" });
    const e = exit();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    enforceVersionFloor(dir, { ignoreVersion: true }, "1.0.0", e);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--ignore-version"));
    expect(e).not.toHaveBeenCalled();
  });
});

describe("tdk up after a readiness failure", () => {
  it("exits 1 without waiting for Tilt to exit", async () => {
    // Tilt keeps running after a readiness failure, so its exit never comes. The command must still exit.
    const tiltRun = new Promise<never>(() => {});
    const startupFailure = Promise.resolve();
    const exit = vi.fn((code: number) => {
      throw new Error(`exit ${code}`);
    }) as unknown as (code: number) => never;

    await expect(waitForTiltUnlessStartupFailed(tiltRun, startupFailure, exit)).rejects.toThrow(
      "exit 1",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("returns Tilt's result and does not exit when startup succeeds", async () => {
    const exit = vi.fn() as unknown as (code: number) => never;
    const startupFailure = new Promise<void>(() => {});

    await expect(
      waitForTiltUnlessStartupFailed(Promise.resolve({ exitCode: 0 }), startupFailure, exit),
    ).resolves.toEqual({ exitCode: 0 });
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("second tdk up", () => {
  it("reports the environment already running instead of starting another Tilt", () => {
    expect(secondUpAction({ runningPorts: [10350], force: false, only: false })).toEqual({
      action: "already-running",
      ports: [10350],
    });
  });

  it("still blocks --only against a running Tilt", () => {
    expect(secondUpAction({ runningPorts: [10350], force: false, only: true })).toEqual({
      action: "only-blocked",
      ports: [10350],
    });
  });

  it("starts when nothing is running or --force is set", () => {
    expect(secondUpAction({ runningPorts: [], force: false, only: false })).toEqual({
      action: "start",
    });
    expect(secondUpAction({ runningPorts: [10350], force: true, only: false })).toEqual({
      action: "start",
    });
  });
});

describe("Tilt startup port selection", () => {
  it("accepts an unset port and valid boundary ports", () => {
    expect(parseTiltPort(undefined)).toEqual({ ok: true, port: undefined });
    expect(parseTiltPort("1")).toEqual({ ok: true, port: 1 });
    expect(parseTiltPort("65535")).toEqual({ ok: true, port: 65535 });
  });

  it.each(["0", "65536", "abc", "10350.5", "10350abc"])(
    "rejects invalid TILT_PORT value %s",
    (value) => {
      expect(parseTiltPort(value)).toEqual({
        ok: false,
        message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
      });
    },
  );

  it("uses the configured port without probing for an alternative", async () => {
    const findAvailablePort = vi.fn(async () => 10351);

    await expect(
      resolveTiltPort({
        configuredPort: 10444,
        force: false,
        basePort: 10350,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: 10444, autoSwitched: false });
    expect(findAvailablePort).not.toHaveBeenCalled();
  });

  it("uses the next available port when no port is configured", async () => {
    const findAvailablePort = vi.fn(async () => 10351);

    await expect(
      resolveTiltPort({
        configuredPort: undefined,
        force: false,
        basePort: 10350,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: 10351, autoSwitched: true });
    expect(findAvailablePort).toHaveBeenCalledWith(10350, 10);
  });

  it("keeps the default port when force is set", async () => {
    const findAvailablePort = vi.fn(async () => 10351);

    await expect(
      resolveTiltPort({
        configuredPort: undefined,
        force: true,
        basePort: 10350,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: 10350, autoSwitched: false });
    expect(findAvailablePort).not.toHaveBeenCalled();
  });
});

describe("Tilt force startup", () => {
  it("stops Tilt without printing in quiet mode", async () => {
    const stop = vi.fn();
    const log = vi.fn();
    const wait = vi.fn(async (_milliseconds: number) => {});

    await stopTiltForUp({ force: true, quiet: true, port: 10350 }, { stop, log, wait });

    expect(stop).toHaveBeenCalledWith(10350);
    expect(log).not.toHaveBeenCalled();
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("prints and stops Tilt when force is set without quiet", async () => {
    const stop = vi.fn();
    const log = vi.fn();
    const wait = vi.fn(async (_milliseconds: number) => {});

    await stopTiltForUp({ force: true, quiet: false, port: 10351 }, { stop, log, wait });

    expect(stop).toHaveBeenCalledWith(10351);
    expect(log).toHaveBeenCalledWith("Force flag set - stopping Tilt on port 10351 if running...");
    expect(wait).toHaveBeenCalledWith(2000);
  });

  it("does not stop Tilt when force is unset", async () => {
    const stop = vi.fn();
    const log = vi.fn();
    const wait = vi.fn(async (_milliseconds: number) => {});

    await stopTiltForUp({ force: false, quiet: false, port: 10350 }, { stop, log, wait });

    expect(stop).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
});

/** The project config the command reads before it starts anything. */
const PROJECT_JSON = {
  version: "1.0.0",
  project: { name: "env-file-test", version: "1.0.0" },
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
  discovery: { paths: ["services/**"] },
};

describe("tdk up --env-file", () => {
  const COMPLETE_ENV = [
    "TILT_ENV=dev",
    "DB_PASSWORD=local-db-password",
    "JWT_SECRET=local-jwt-secret",
    "",
  ].join("\n");

  let dir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tdk-up-env-file-"));
    // macOS resolves the temporary directory (/var -> /private/var), and the CLI resolves a
    // relative path against the current directory, so the project path is the resolved one.
    projectDir = realpathSync(dir);
    originalCwd = process.cwd();
    // A relative --env-file is resolved against the current directory, like Node.js and
    // `docker compose --env-file` resolve it.
    process.chdir(dir);
    vi.stubEnv("TDK_ALLOW_NATIVE_WINDOWS", "1");
    vi.mocked(findProjectRoot).mockReturnValue(projectDir);
    vi.mocked(requireProjectRoot).mockReturnValue(projectDir);
    // The command reads the project config before it starts anything.
    mkdirSync(join(projectDir, ".tdk"), { recursive: true });
    writeFileSync(join(projectDir, ".tdk", "project.json"), `${JSON.stringify(PROJECT_JSON)}\n`);
    vi.mocked(verifyMasterConfigs).mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
      diffs: [],
      handEdited: [],
    });
    vi.mocked(classifyTiltPorts).mockResolvedValue({
      running: [],
      foreign: [],
    } as unknown as Awaited<ReturnType<typeof classifyTiltPorts>>);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
    delete process.env[PROJECT_ENV_FILE_VAR];
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("selects the file for the run and points the engine at it", () => {
    writeFileSync(join(dir, ".env.integration"), COMPLETE_ENV);

    const selection = selectRunEnvFile(projectDir, ".env.integration");

    expect(selection?.path).toBe(join(projectDir, ".env.integration"));
    expect(selection?.relativePath).toBe(".env.integration");
  });

  it("leaves the env file of the run alone when no file is requested", () => {
    expect(selectRunEnvFile(dir, undefined)).toBeUndefined();
  });

  it("refuses a file that does not exist, before anything starts", () => {
    vi.mocked(runTilt).mockClear();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      expect(() => selectRunEnvFile(projectDir, ".env.integration")).toThrow(/Env file not found/);
      expect(runTilt).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("refuses a file outside the project", () => {
    const outside = mkdtempSync(join(tmpdir(), "tdk-up-env-outside-"));
    try {
      writeFileSync(join(outside, ".env"), COMPLETE_ENV);
      expect(() => selectRunEnvFile(projectDir, join(outside, ".env"))).toThrow(
        /Env file is outside the project/,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses a file that misses a key the platform needs, without naming a value", () => {
    writeFileSync(join(dir, ".env.integration"), "TILT_ENV=dev\nDB_PASSWORD=topsecretvalue\n");

    try {
      selectRunEnvFile(projectDir, ".env.integration");
      expect.unreachable("the missing key should stop the run");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("JWT_SECRET");
      expect(message).not.toContain("topsecretvalue");
    }
  });

  it("exits 2 on a missing file and never reaches Tilt", async () => {
    vi.mocked(runTilt).mockClear();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      await expect(
        upCommand.parseAsync(["--env-file", ".env.integration"], { from: "user" }),
      ).rejects.toThrow("process.exit");

      expect(exit).toHaveBeenCalledWith(2);
      expect(runTilt).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Env file not found: .env.integration"),
      );
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("writes the ENV_FILE_INVALID code to stdout in --json mode", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(writeSync).mockClear();
    let written = "";
    vi.mocked(writeSync).mockImplementation(((fd: number, data: string) => {
      if (fd === 1) written += data;
      return data.length;
    }) as never);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit");
    }) as never);

    await expect(
      upCommand.parseAsync(["--json", "--env-file", ".env.integration"], { from: "user" }),
    ).rejects.toThrow("process.exit");

    const payload = JSON.parse(written.trim().split("\n")[0] as string);
    expect(payload.errors[0].code).toBe("ENV_FILE_INVALID");
    expect(payload.errors[0].message).toContain(".env.integration");
    exit.mockRestore();
  });

  it("exports the selected file for the engine and names it in the output", async () => {
    writeFileSync(join(dir, ".env.integration"), COMPLETE_ENV);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await upCommand.parseAsync(["--dry-run", "--env-file", ".env.integration"], {
        from: "user",
      });
    } catch {
      // Later dry-run steps need a real project; the env file of the run is what matters here.
    }

    expect(process.env[PROJECT_ENV_FILE_VAR]).toBe(join(projectDir, ".env.integration"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(".env.integration"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("local-jwt-secret"));
    log.mockRestore();
  });

  it("refuses the option when a stack is already running, because it keeps its env file", async () => {
    writeFileSync(join(projectDir, ".env.integration"), COMPLETE_ENV);
    vi.mocked(classifyTiltPorts).mockResolvedValue({
      running: [10350],
      foreign: [],
    } as unknown as Awaited<ReturnType<typeof classifyTiltPorts>>);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    try {
      await expect(
        upCommand.parseAsync(["--quiet", "--env-file", ".env.integration"], { from: "user" }),
      ).rejects.toThrow("process.exit");

      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("--env-file applies to a new run only"),
      );
    } finally {
      exit.mockRestore();
      error.mockRestore();
    }
  });

  it("keeps the project .env as the env file of the run when no file is requested", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await upCommand.parseAsync(["--dry-run"], { from: "user" });
    } catch {
      // Later dry-run steps need a real project.
    }

    expect(process.env[PROJECT_ENV_FILE_VAR]).toBeUndefined();
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("Using env file"));
    log.mockRestore();
  });

  it("documents the exit code it returns for a rejected --env-file", () => {
    expect(documentedExitCode("rejected `--env-file`")).toBe(2);
  });
});
