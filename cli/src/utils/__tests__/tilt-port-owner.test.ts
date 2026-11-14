// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: execFileSyncMock,
}));

import {
  classifyTiltPorts,
  findProjectTiltPorts,
  findTiltPortOwner,
  isForeignTilt,
  isOwnTilt,
  stopOwnedTiltOnPort,
} from "../tilt-port-owner.js";
import { resolveTiltPort, secondUpAction, stopTiltForUp } from "../tilt-startup.js";

afterEach(() => {
  execFileSyncMock.mockReset();
});

const TILT = "tilt up -f /work/other/.flisk/.flisk-out/Tiltfile";

function runner(map: Record<string, string>) {
  return (command: string, args: string[]) => {
    const key = `${command} ${args.join(" ")}`;
    for (const [pattern, out] of Object.entries(map)) {
      if (key.includes(pattern)) return out;
    }
    throw Object.assign(new Error("exit 1"), { status: 1 });
  };
}

describe("findTiltPortOwner", () => {
  it("names the project whose tilt up listens on the port", () => {
    const owner = findTiltPortOwner(
      10350,
      "darwin",
      runner({ "-iTCP:10350": "24170\n", "-p 24170": `/opt/homebrew/bin/${TILT}\n` }),
    );
    expect(owner).toEqual({ pid: 24170, root: "/work/other" });
  });

  it("is unknown when the listener is not a tilt up", () => {
    const owner = findTiltPortOwner(
      10350,
      "darwin",
      runner({ "-iTCP:10350": "99\n", "-p 99": "node server.js\n" }),
    );
    expect(owner).toBeNull();
  });

  it("is unknown when lsof fails or on Windows", () => {
    expect(findTiltPortOwner(10350, "darwin", runner({}))).toBeNull();
    expect(findTiltPortOwner(10350, "win32", runner({ "-iTCP": "1" }))).toBeNull();
  });

  it("checks each listener until one is a tilt up, ignoring blank and CRLF lines", () => {
    const owner = findTiltPortOwner(
      10350,
      "linux",
      runner({
        "-iTCP:10350": "111\r\n\n222\r\n",
        "-p 111": "node server.js\n",
        "-p 222": `${TILT}\n`,
      }),
    );
    expect(owner).toEqual({ pid: 222, root: "/work/other" });
  });

  it("is unknown when ps fails for the listener", () => {
    expect(findTiltPortOwner(10350, "linux", runner({ "-iTCP:10350": "333\n" }))).toBeNull();
  });

  it("is unknown when nothing listens on the port", () => {
    expect(findTiltPortOwner(10350, "linux", runner({ "-iTCP:10350": "\n" }))).toBeNull();
  });

  it("uses the default runner with a bounded timeout", () => {
    execFileSyncMock.mockImplementation((command: string) => {
      if (command === "lsof") return "24170\n";
      if (command === "ps") return `${TILT}\n`;
      throw new Error(`unexpected command ${command}`);
    });

    expect(findTiltPortOwner(10350, "linux")).toEqual({ pid: 24170, root: "/work/other" });
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "lsof",
      ["-nP", "-iTCP:10350", "-sTCP:LISTEN", "-t"],
      expect.objectContaining({
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 5000,
        windowsHide: true,
      }),
    );
  });
});

describe("isForeignTilt", () => {
  it("is foreign only when the owner is known and is another project", () => {
    expect(isForeignTilt({ pid: 1, root: "/work/other" }, "/work/mine")).toBe(true);
    expect(isForeignTilt({ pid: 1, root: "/work/mine" }, "/work/mine")).toBe(false);
    expect(isForeignTilt(null, "/work/mine")).toBe(false);
  });

  it("is not foreign when the Tilt path reaches the project through a symlink", () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "tilt-owner-")));
    const real = join(base, "real");
    mkdirSync(real);
    const link = join(base, "link");
    symlinkSync(real, link);
    expect(isForeignTilt({ pid: 1, root: link }, real)).toBe(false);
  });
});

describe("flisk up with a Tilt on the base port", () => {
  const serving = async (port: number) => port === 10350;
  const free = async (base: number) => base + 1;

  async function plan(
    owner: { pid: number; root: string } | null,
    opts: { force?: boolean; configured?: number } = {},
  ) {
    const { running, foreign } = await classifyTiltPorts(
      [10350],
      "/work/mine",
      serving,
      () => owner,
    );
    const force = Boolean(opts.force) && foreign.length === 0;
    const decision = secondUpAction({ runningPorts: running, force, only: false });
    const port = await resolveTiltPort({
      configuredPort: opts.configured,
      force,
      basePort: 10350,
      findAvailablePort: free,
    });
    return { running, foreign, decision, port, force };
  }

  it("another project's Tilt is not 'already running': this project starts on the next free port", async () => {
    const result = await plan({ pid: 24170, root: "/work/other" });
    expect(result.foreign).toEqual([{ port: 10350, root: "/work/other" }]);
    expect(result.running).toEqual([]);
    expect(result.decision).toEqual({ action: "start" });
    expect(result.port).toEqual({ port: 10351, autoSwitched: true });
  });

  it("--force does not apply to another project's Tilt", async () => {
    const result = await plan({ pid: 24170, root: "/work/other" }, { force: true });
    expect(result.force).toBe(false);
    expect(result.port.port).toBe(10351);
  });

  it("this project's own Tilt is still 'already running'", async () => {
    const result = await plan({ pid: 1, root: "/work/mine" });
    expect(result.foreign).toEqual([]);
    expect(result.decision).toEqual({ action: "already-running", ports: [10350] });
  });

  it("an owner that cannot be told is treated as this environment, as before", async () => {
    const result = await plan(null);
    expect(result.decision).toEqual({ action: "already-running", ports: [10350] });
  });

  it("--force still replaces this project's own Tilt", async () => {
    const result = await plan({ pid: 1, root: "/work/mine" }, { force: true });
    expect(result.force).toBe(true);
    expect(result.decision).toEqual({ action: "start" });
    expect(result.port).toEqual({ port: 10350, autoSwitched: false });
  });

  it("ignores ports nothing serves", async () => {
    const { running, foreign } = await classifyTiltPorts([10351], "/work/mine", serving, () => ({
      pid: 1,
      root: "/work/other",
    }));
    expect(running).toEqual([]);
    expect(foreign).toEqual([]);
  });
});

describe("findProjectTiltPorts", () => {
  const mine = { pid: 1, root: "/work/mine" };
  const other = { pid: 2, root: "/work/other" };
  const servingOn =
    (...ports: number[]) =>
    async (port: number) =>
      ports.includes(port);
  const owners =
    (map: Record<number, { pid: number; root: string } | null>) =>
    (port: number): { pid: number; root: string } | null =>
      map[port] ?? null;

  it("finds this project's Tilt on its saved port when another project holds 10350 (#4165)", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10350, 10351),
      ownerOf: owners({ 10350: other, 10351: mine }),
    });
    expect(result).toEqual({
      running: [10351],
      foreign: [{ port: 10350, root: "/work/other" }],
      savedRunning: [10351],
      unknownSaved: [],
    });
  });

  it("finds this project's Tilt on its saved port when a non-Tilt listener holds 10350", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10351),
      ownerOf: owners({ 10351: mine }),
    });
    expect(result).toEqual({
      running: [10351],
      foreign: [],
      savedRunning: [10351],
      unknownSaved: [],
    });
  });

  it("ignores a saved port that no Tilt answers on", async () => {
    const ownerOf = vi.fn(owners({}));
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(),
      ownerOf,
    });
    expect(result).toEqual({ running: [], foreign: [], savedRunning: [], unknownSaved: [] });
    expect(ownerOf).not.toHaveBeenCalled();
  });

  it("does not count or report another project's Tilt that now holds the saved port", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10351),
      ownerOf: owners({ 10351: other }),
    });
    // `foreign` drives the TILT_PORT_IN_USE refusal and the "will use another port" warning, which are about the watched
    // ports only.
    expect(result).toEqual({ running: [], foreign: [], savedRunning: [], unknownSaved: [] });
  });

  it("checks the saved port once when it is a watched port", async () => {
    const isServing = vi.fn(servingOn(10350));
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10350,
      projectRoot: "/work/mine",
      isServing,
      ownerOf: owners({ 10350: mine }),
    });
    expect(result).toEqual({ running: [10350], foreign: [], savedRunning: [], unknownSaved: [] });
    expect(isServing).toHaveBeenCalledTimes(1);
  });

  it("keeps the watched ports first and works without a saved port", async () => {
    const both = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10350, 10351),
      ownerOf: owners({ 10350: mine, 10351: mine }),
    });
    expect(both.running).toEqual([10350, 10351]);
    const none = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: null,
      projectRoot: "/work/mine",
      isServing: servingOn(10350),
      ownerOf: owners({ 10350: mine }),
    });
    expect(none).toEqual({ running: [10350], foreign: [], savedRunning: [], unknownSaved: [] });
  });

  it("does not include a stale saved port with unknown ownership in savedRunning (#4165)", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10351),
      ownerOf: owners({}),
    });
    // Unknown ownership (e.g. Windows / no lsof) is not confirmation: it is not this project's `running` Tilt, and it is
    // reported in `unknownSaved` so --force can refuse instead of stopping it or starting a second Tilt.
    expect(result).toEqual({ running: [], foreign: [], savedRunning: [], unknownSaved: [10351] });
  });

  it("reports an unknown saved listener in unknownSaved even when a confirmed watched Tilt exists (#4165)", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10350, 10351),
      ownerOf: owners({ 10350: mine }),
    });
    expect(result).toEqual({
      running: [10350],
      foreign: [],
      savedRunning: [],
      unknownSaved: [10351],
    });
  });

  it("uses lsof and ps to tell the saved port's owner by default", async () => {
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args.includes("-iTCP:10351")) return "4242\n";
      if (command === "ps" && args.includes("4242"))
        return "tilt up -f /work/mine/.flisk/.flisk-out/Tiltfile\n";
      throw Object.assign(new Error("exit 1"), { status: 1 });
    });
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: servingOn(10351),
    });
    if (process.platform !== "win32") {
      expect(result.running).toEqual([10351]);
      expect(result.savedRunning).toEqual([10351]);
      expect(execFileSyncMock).toHaveBeenCalledWith(
        "ps",
        ["-p", "4242", "-o", "command="],
        expect.anything(),
      );
    } else {
      expect(result.running).toEqual([]);
      expect(result.savedRunning).toEqual([]);
      expect(result.unknownSaved).toEqual([10351]);
    }
  });

  it("detects a project's saved-port Tilt when the project path contains spaces (#4165)", async () => {
    const spacedRoot = "/work/project with spaces";
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args.includes("-iTCP:10351")) return "4343\n";
      if (command === "ps" && args.includes("4343"))
        return `tilt up -f ${spacedRoot}/.flisk/.flisk-out/Tiltfile -- --focus=app\n`;
      throw Object.assign(new Error("exit 1"), { status: 1 });
    });
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: spacedRoot,
      isServing: servingOn(10351),
    });
    expect(result.running).toEqual([10351]);
    expect(result.foreign).toEqual([]);
    if (process.platform !== "win32") {
      expect(result.savedRunning).toEqual([10351]);
    }
  });
});

describe("a second flisk up when another project holds 10350 (#4165)", () => {
  // This project's first `flisk up` started its Tilt on 10351 and saved that port.
  const isServing = async (port: number) => port === 10350 || port === 10351;
  const ownerOf = (port: number) =>
    port === 10350 ? { pid: 2, root: "/work/other" } : { pid: 1, root: "/work/mine" };

  async function secondUp(options: { force?: boolean; only?: boolean } = {}) {
    const { running, foreign, savedRunning } = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing,
      ownerOf,
    });
    const force = Boolean(options.force) && foreign.length === 0;
    const decision = secondUpAction({
      runningPorts: running,
      force: Boolean(options.force),
      only: Boolean(options.only),
    });
    return { running, foreign, savedRunning, force, decision };
  }

  it("reports the running Tilt on 10351 instead of starting a second one", async () => {
    const result = await secondUp();
    expect(result.decision).toEqual({ action: "already-running", ports: [10351] });
  });

  it("blocks --only against the running Tilt instead of starting a second one", async () => {
    const result = await secondUp({ only: true });
    expect(result.decision).toEqual({ action: "only-blocked", ports: [10351] });
  });

  it("--force replaces this project's Tilt on 10351 and never stops the other project's", async () => {
    const result = await secondUp({ force: true });
    expect(result.decision).toEqual({ action: "start" });
    expect(result.force).toBe(false);
    const port = await resolveTiltPort({
      configuredPort: undefined,
      force: result.force,
      basePort: 10350,
      findAvailablePort: async () => 10352,
    });
    const stop = vi.fn();
    await stopTiltForUp(
      { force: result.force, quiet: true, port: port.port, ownPorts: result.savedRunning },
      { stop, log: vi.fn(), wait: async () => {} },
    );
    expect(stop.mock.calls).toEqual([[10351]]);
  });
});

describe("stopOwnedTiltOnPort (#4165)", () => {
  it("confirms ownership before stopping and refuses unknown or changed owners", () => {
    expect(isOwnTilt({ pid: 1, root: "/work/mine" }, "/work/mine")).toBe(true);
    expect(isOwnTilt(null, "/work/mine")).toBe(false);
    expect(isOwnTilt({ pid: 1, root: "/work/other" }, "/work/mine")).toBe(false);

    // Unknown owner (e.g. `tilt up` without `-f`): never signaled.
    const unknownRunner = vi.fn((command: string, args: string[]) => {
      if (command === "lsof") return "123\n";
      if (command === "ps" && args.includes("command=")) return "tilt up\n";
      if (command === "ps" && args.includes("comm=")) return "tilt\n";
      return "";
    });
    expect(stopOwnedTiltOnPort(10351, "/work/mine", undefined, "linux", unknownRunner)).toEqual([]);
    expect(unknownRunner).not.toHaveBeenCalledWith("kill", expect.anything());

    // Foreign owner: never signaled.
    const foreignRunner = vi.fn((command: string, args: string[]) => {
      if (command === "lsof") return "123\n";
      if (command === "ps" && args.includes("command="))
        return "tilt up -f /work/other/.flisk/.flisk-out/Tiltfile\n";
      if (command === "ps" && args.includes("comm=")) return "tilt\n";
      return "";
    });
    expect(stopOwnedTiltOnPort(10351, "/work/mine", undefined, "linux", foreignRunner)).toEqual([]);
    expect(foreignRunner).not.toHaveBeenCalledWith("kill", expect.anything());

    // PID changed between detection and stop: never signaled.
    const changedPidRunner = vi.fn((command: string, args: string[]) => {
      if (command === "lsof") return "999\n";
      if (command === "ps" && args.includes("command="))
        return "tilt up -f /work/mine/.flisk/.flisk-out/Tiltfile\n";
      if (command === "ps" && args.includes("comm=")) return "tilt\n";
      return "";
    });
    expect(
      stopOwnedTiltOnPort(
        10351,
        "/work/mine",
        { pid: 123, root: "/work/mine" },
        "linux",
        changedPidRunner,
      ),
    ).toEqual([]);
    expect(changedPidRunner).not.toHaveBeenCalledWith("kill", expect.anything());

    // Confirmed project owner and matching PID: signals ONLY that PID.
    const ownRunner = vi.fn((command: string, args: string[]) => {
      if (command === "lsof") return "123\n";
      if (command === "ps" && args.includes("command="))
        return "tilt up -f /work/mine/.flisk/.flisk-out/Tiltfile\n";
      if (command === "ps" && args.includes("comm=")) return "tilt\n";
      return "";
    });
    expect(
      stopOwnedTiltOnPort(
        10351,
        "/work/mine",
        { pid: 123, root: "/work/mine" },
        "linux",
        ownRunner,
      ),
    ).toEqual([123]);
    expect(ownRunner).toHaveBeenCalledWith("kill", ["-TERM", "123"]);
  });

  it("never stops a stale saved port with unknown ownership even with --force and foreign base port", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: async (port) => port === 10350 || port === 10351,
      ownerOf: (port) => (port === 10350 ? { pid: 2, root: "/work/other" } : null),
    });
    expect(result.savedRunning).toEqual([]);
    expect(result.unknownSaved).toEqual([10351]);
    const force = true && result.foreign.length === 0;
    const stop = vi.fn();
    await stopTiltForUp(
      { force, quiet: true, port: 10352, ownPorts: result.savedRunning },
      { stop, log: vi.fn(), wait: async () => {} },
    );
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not treat /repo/.flisk/Tiltfile demo/.flisk/.flisk-out/Tiltfile as owned by /repo (#4165)", async () => {
    execFileSyncMock.mockImplementation((command: string, args: string[]) => {
      if (command === "lsof" && args.includes("-iTCP:10351")) return "555\n";
      if (command === "ps" && args.includes("command="))
        return "tilt up -f /repo/.flisk/Tiltfile demo/.flisk/.flisk-out/Tiltfile\n";
      if (command === "ps" && args.includes("comm=")) return "tilt\n";
      throw Object.assign(new Error("exit 1"), { status: 1 });
    });

    if (process.platform !== "win32") {
      const result = await findProjectTiltPorts({
        watchedPorts: [10350],
        savedPort: 10351,
        projectRoot: "/repo",
        isServing: async (port) => port === 10351,
      });
      expect(result).toEqual({ running: [], foreign: [], savedRunning: [], unknownSaved: [] });

      const killer = vi.fn((command: string, args: string[]) => {
        if (command === "lsof") return "555\n";
        if (command === "ps" && args.includes("command="))
          return "tilt up -f /repo/.flisk/Tiltfile demo/.flisk/.flisk-out/Tiltfile\n";
        if (command === "ps" && args.includes("comm=")) return "tilt\n";
        return "";
      });
      expect(stopOwnedTiltOnPort(10351, "/repo", undefined, "linux", killer)).toEqual([]);
      expect(killer).not.toHaveBeenCalledWith("kill", expect.anything());
    }
  });
});

describe("confirmed saved Tilt vs unknown watched listener and fallback port (#4165)", () => {
  it("prefers a confirmed owned saved Tilt over an unknown watched listener on 10350", async () => {
    const result = await findProjectTiltPorts({
      watchedPorts: [10350],
      savedPort: 10351,
      projectRoot: "/work/mine",
      isServing: async (port) => port === 10350 || port === 10351,
      ownerOf: (port) => (port === 10351 ? { pid: 1, root: "/work/mine" } : null),
    });
    expect(result).toEqual({
      running: [10351],
      foreign: [],
      savedRunning: [10351],
      unknownSaved: [],
    });
  });

  it("reuses fallbackPort when --force cannot bind basePort and no other free port is found", async () => {
    const resolved = await resolveTiltPort({
      configuredPort: undefined,
      force: false,
      basePort: 10350,
      findAvailablePort: async () => null,
      fallbackPort: 10351,
    });
    expect(resolved).toEqual({ port: 10351, autoSwitched: true });
  });

  it("stops the owned fallbackPort before restarting when force is false (#4165)", async () => {
    const resolved = await resolveTiltPort({
      configuredPort: undefined,
      force: false,
      basePort: 10350,
      findAvailablePort: async () => null,
      fallbackPort: 10351,
    });
    expect(resolved).toEqual({ port: 10351, autoSwitched: true });
    const stop = vi.fn();
    await stopTiltForUp(
      { force: false, quiet: true, port: resolved.port, ownPorts: [10351] },
      { stop, log: vi.fn(), wait: async () => {} },
    );
    expect(stop.mock.calls).toEqual([[10351]]);
  });
});
