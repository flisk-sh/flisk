// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { findTiltProcessIdsOnPort, stopTiltOnPort } from "../tilt-process.js";
import {
  getTiltPollingPort,
  parseTiltPort,
  resolveTiltPort,
  secondUpAction,
  stopTiltForUp,
} from "../tilt-startup.js";

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: execFileSyncMock,
}));

const TILT_PORT = 10350;

describe("findTiltProcessIdsOnPort", () => {
  it.each([0, -1, 65536, 10350.5, Number.NaN])(
    "rejects out-of-range port %s without running a command",
    (port) => {
      const runner = vi.fn(() => "123\n");
      expect(findTiltProcessIdsOnPort(port, "linux", runner)).toEqual([]);
      expect(runner).not.toHaveBeenCalled();
    },
  );

  it("keeps only listeners whose executable basename is tilt", () => {
    const runner = vi.fn((command: string, args: string[]) => {
      if (command === "lsof") return "123\n456\n789\n";
      if (command === "ps" && args[1] === "123") return "/opt/homebrew/bin/tilt\n";
      if (command === "ps" && args[1] === "456") return "C:\\tools\\tilt.exe\n";
      if (command === "ps" && args[1] === "789") return "/usr/sbin/nginx\n";
      return "";
    });

    expect(findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toEqual([123]);
  });

  it("treats lsof exit code 1 with an empty error stream as no listener", () => {
    const noListener = Object.assign(new Error("exit 1"), { status: 1, stderr: "" });
    const runner = vi.fn(() => {
      throw noListener;
    });

    expect(findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toEqual([]);
  });

  it("treats whitespace-only lsof stderr as no listener", () => {
    const noListener = Object.assign(new Error("exit 1"), { status: 1, stderr: "  \n" });
    const runner = vi.fn(() => {
      throw noListener;
    });

    expect(findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toEqual([]);
  });

  it("fails closed when lsof reports a real error", () => {
    const denied = Object.assign(new Error("exit 1"), {
      status: 1,
      stderr: "lsof: permission denied",
    });
    const runner = vi.fn(() => {
      throw denied;
    });

    expect(() => findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toThrow(
      /Unable to inspect listeners on port 10350/,
    );
  });

  it("fails closed when lsof is missing even without stderr", () => {
    const missing = Object.assign(new Error("spawn lsof ENOENT"), { code: "ENOENT" });
    const runner = vi.fn(() => {
      throw missing;
    });

    expect(() => findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toThrow(
      /Install lsof or resolve the lsof error/,
    );
  });

  it("fails closed when the listener cannot be identified", () => {
    const runner = vi.fn((command: string) => {
      if (command === "lsof") return "123\n";
      throw new Error("ps failed");
    });

    expect(() => findTiltProcessIdsOnPort(TILT_PORT, "linux", runner)).toThrow(
      /Unable to identify the process listening on port 10350/,
    );
  });

  it("ignores blank Windows listener rows", () => {
    const runner = vi.fn(() => "789\r\n\r\n");
    expect(findTiltProcessIdsOnPort(TILT_PORT, "win32", runner)).toEqual([789]);
  });

  it("uses the default execFileSync runner when none is injected", () => {
    execFileSyncMock.mockImplementation((command: string) => {
      if (command === "lsof") return "123\n";
      if (command === "ps") return "tilt\n";
      throw new Error(`unexpected command ${command}`);
    });

    expect(findTiltProcessIdsOnPort(TILT_PORT, "linux")).toEqual([123]);
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "lsof",
      ["-nP", "-t", "-iTCP:10350", "-sTCP:LISTEN"],
      expect.objectContaining({ encoding: "utf-8", stdio: "pipe", windowsHide: true }),
    );
    execFileSyncMock.mockReset();
  });

  it("fails closed when PowerShell cannot inspect listeners", () => {
    const runner = vi.fn(() => {
      throw new Error("powershell failed");
    });

    expect(() => findTiltProcessIdsOnPort(TILT_PORT, "win32", runner)).toThrow(
      /Unable to inspect Tilt listeners on port 10350 with PowerShell/,
    );
  });
});

describe("stopTiltOnPort", () => {
  it("terminates every matching Tilt process with SIGTERM", () => {
    const calls: string[][] = [];
    const runner = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (command === "lsof") return "123\n456\n";
      if (command === "ps") return "/usr/local/bin/tilt\n";
      return "";
    });

    expect(stopTiltOnPort(TILT_PORT, "linux", runner)).toEqual([123, 456]);
    expect(calls).toContainEqual(["kill", "-TERM", "123"]);
    expect(calls).toContainEqual(["kill", "-TERM", "456"]);
  });

  it("uses taskkill on Windows", () => {
    const calls: string[][] = [];
    const runner = vi.fn((command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (command === "powershell.exe") return "789\n";
      return "";
    });

    expect(stopTiltOnPort(TILT_PORT, "win32", runner)).toEqual([789]);
    expect(calls).toContainEqual(["taskkill.exe", "/PID", "789", "/F"]);
  });

  it("does nothing for an invalid port", () => {
    const runner = vi.fn(() => "789\n");
    expect(stopTiltOnPort(0, "linux", runner)).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });
});

describe("parseTiltPort", () => {
  it.each([undefined, ""])("treats %j as unset", (value) => {
    expect(parseTiltPort(value)).toEqual({ ok: true, port: undefined });
  });

  it.each(["1", "10350", "65535"])("accepts %s", (value) => {
    expect(parseTiltPort(value)).toEqual({ ok: true, port: Number(value) });
  });

  it.each(["0", "65536", "-1", "1.5", "1e3", " 10350", "10350 ", "0x10", "abc"])(
    "rejects %j",
    (value) => {
      expect(parseTiltPort(value)).toEqual({
        ok: false,
        message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
      });
    },
  );
});

describe("getTiltPollingPort", () => {
  it("returns a configured valid port", () => {
    expect(getTiltPollingPort("10444")).toBe(10444);
  });

  it.each([undefined, "", "0", "70000", "abc"])(
    "falls back to the standard port for %j",
    (value) => {
      expect(getTiltPollingPort(value)).toBe(TILT_PORT);
    },
  );
});

describe("secondUpAction", () => {
  it("starts when nothing is running", () => {
    expect(secondUpAction({ runningPorts: [], force: false, only: false })).toEqual({
      action: "start",
    });
  });

  it("starts even when a Tilt is running if force is set", () => {
    expect(secondUpAction({ runningPorts: [TILT_PORT], force: true, only: false })).toEqual({
      action: "start",
    });
  });

  it("blocks a second plain up", () => {
    expect(secondUpAction({ runningPorts: [TILT_PORT], force: false, only: false })).toEqual({
      action: "already-running",
      ports: [TILT_PORT],
    });
  });

  it("blocks --only against a running Tilt", () => {
    expect(secondUpAction({ runningPorts: [TILT_PORT], force: false, only: true })).toEqual({
      action: "only-blocked",
      ports: [TILT_PORT],
    });
  });
});

describe("resolveTiltPort", () => {
  const probe = (result: number | null | undefined) =>
    vi.fn(async (_basePort: number, _attempts: number) => result);

  it("uses a configured port without probing", async () => {
    const findAvailablePort = probe(10351);
    await expect(
      resolveTiltPort({
        configuredPort: 10444,
        force: false,
        basePort: TILT_PORT,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: 10444, autoSwitched: false });
    expect(findAvailablePort).not.toHaveBeenCalled();
  });

  it("uses the base port under --force without probing", async () => {
    const findAvailablePort = probe(10351);
    await expect(
      resolveTiltPort({
        configuredPort: undefined,
        force: true,
        basePort: TILT_PORT,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: TILT_PORT, autoSwitched: false });
    expect(findAvailablePort).not.toHaveBeenCalled();
  });

  it("switches to the next free port and reports the switch", async () => {
    const findAvailablePort = probe(10355);
    await expect(
      resolveTiltPort({
        configuredPort: undefined,
        force: false,
        basePort: TILT_PORT,
        findAvailablePort,
      }),
    ).resolves.toEqual({ port: 10355, autoSwitched: true });
    expect(findAvailablePort).toHaveBeenCalledWith(TILT_PORT, 10);
  });

  it.each([null, undefined, TILT_PORT])(
    "keeps the base port when the probe returns %j",
    async (available) => {
      await expect(
        resolveTiltPort({
          configuredPort: undefined,
          force: false,
          basePort: TILT_PORT,
          findAvailablePort: probe(available),
        }),
      ).resolves.toEqual({ port: TILT_PORT, autoSwitched: false });
    },
  );
});

describe("stopTiltForUp", () => {
  const dependencies = () => ({
    stop: vi.fn(),
    log: vi.fn(),
    wait: vi.fn(async (_milliseconds: number) => {}),
  });

  it("does nothing without --force", async () => {
    const deps = dependencies();
    await stopTiltForUp({ force: false, quiet: false, port: TILT_PORT }, deps);

    expect(deps.stop).not.toHaveBeenCalled();
    expect(deps.log).not.toHaveBeenCalled();
    expect(deps.wait).not.toHaveBeenCalled();
  });

  it("stops Tilt without logging in quiet mode", async () => {
    const deps = dependencies();
    await stopTiltForUp({ force: true, quiet: true, port: TILT_PORT }, deps);

    expect(deps.stop).toHaveBeenCalledWith(TILT_PORT);
    expect(deps.log).not.toHaveBeenCalled();
    expect(deps.wait).toHaveBeenCalledWith(2000);
  });

  it("announces the stop when not quiet", async () => {
    const deps = dependencies();
    await stopTiltForUp({ force: true, quiet: false, port: 10351 }, deps);

    expect(deps.log).toHaveBeenCalledWith(
      "Force flag set - stopping Tilt on port 10351 if running...",
    );
    expect(deps.stop).toHaveBeenCalledWith(10351);
    expect(deps.wait).toHaveBeenCalledWith(2000);
  });
});
