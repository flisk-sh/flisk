// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTiltPorts, findTiltPortOwner, isForeignTilt } from "../tilt-port-owner.js";
import { resolveTiltPort, secondUpAction } from "../tilt-startup.js";

const TILT = "tilt up -f /work/other/.tdk/.tdk-out/Tiltfile";

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

describe("tdk up with a Tilt on the base port", () => {
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
