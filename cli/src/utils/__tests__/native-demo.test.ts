// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type ContainerProbe,
  canWriteNativeDemo,
  containerDemoProblem,
  findFreePort,
  isNativeDemoFolder,
  nativeDemoManifests,
  nativeDemoReason,
  pickDemoPorts,
  runningNativeDemoUrl,
  startNativeDemo,
  writeNativeDemo,
} from "../native-demo.js";
import { nativeRunStatePath } from "../native-runtime.js";
import { validateNativeServiceFields } from "../native-service.js";

function probe(options: { onPath?: string[]; failing?: string[] } = {}): ContainerProbe {
  const onPath = options.onPath ?? ["docker", "tilt"];
  return {
    onPath: (command) => (onPath.includes(command) ? `/usr/bin/${command}` : null),
    succeeds: async (command, args) => !options.failing?.includes([command, ...args].join(" ")),
  };
}

const tempDir = () => mkdtempSync(join(tmpdir(), "flisk-native-demo-"));

describe("containerDemoProblem", () => {
  it("is null when Docker runs and Compose and Tilt are installed", async () => {
    expect(await containerDemoProblem(probe())).toBeNull();
  });

  it("names the first missing piece", async () => {
    expect(await containerDemoProblem(probe({ onPath: ["tilt"] }))).toBe("Docker is not installed");
    expect(await containerDemoProblem(probe({ failing: ["docker info"] }))).toBe(
      "Docker is not running",
    );
    expect(await containerDemoProblem(probe({ failing: ["docker compose version"] }))).toBe(
      "the Docker Compose plugin is not installed",
    );
    expect(await containerDemoProblem(probe({ onPath: ["docker"] }))).toBe("Tilt is not installed");
  });
});

describe("nativeDemoReason", () => {
  const base = { argv: ["node", "flisk", "demo"], platform: "darwin", env: {} };

  it("keeps the full demo when Docker and Tilt are ready", async () => {
    expect(await nativeDemoReason({ ...base, probe: probe() })).toBeNull();
  });

  it("falls back when Docker is installed but not running", async () => {
    expect(await nativeDemoReason({ ...base, probe: probe({ failing: ["docker info"] }) })).toBe(
      "Docker is not running",
    );
  });

  it("honours --no-docker without probing Docker", async () => {
    const untouched: ContainerProbe = {
      onPath: () => {
        throw new Error("probed");
      },
      succeeds: async () => {
        throw new Error("probed");
      },
    };
    expect(
      await nativeDemoReason({ ...base, argv: [...base.argv, "--no-docker"], probe: untouched }),
    ).toBe("--no-docker was passed");
  });

  it("runs without Docker on native Windows unless the escape hatch is set", async () => {
    expect(await nativeDemoReason({ ...base, platform: "win32", probe: probe() })).toBe(
      "the full demo on Windows runs in WSL2",
    );
    expect(
      await nativeDemoReason({
        ...base,
        platform: "win32",
        env: { FLISK_ALLOW_NATIVE_WINDOWS: "1" },
        probe: probe(),
      }),
    ).toBeNull();
  });
});

describe("free ports", () => {
  it("skips ports that are taken", async () => {
    const taken = new Set([4000, 4001]);
    expect(await findFreePort(4000, async (port) => taken.has(port))).toBe(4002);
  });

  it("gives the two services different ports", async () => {
    const taken = new Set([3000]);
    expect(await pickDemoPorts(async (port) => taken.has(port))).toEqual({ api: 4000, web: 3001 });
  });

  it("fails when every port in the range is taken", async () => {
    await expect(findFreePort(5000, async () => true, [], 3)).rejects.toThrow(
      "No free port between 5000 and 5002",
    );
  });
});

describe("demo files", () => {
  it("writes valid command services wired to each other's ports", () => {
    const manifests = nativeDemoManifests({ api: 4100, web: 3100 });
    for (const manifest of Object.values(manifests)) {
      expect(validateNativeServiceFields(manifest)).toEqual([]);
    }
    expect(manifests["web/service.json"]).toMatchObject({
      port: 3100,
      env: { API_URL: "http://localhost:4100" },
      dependsOn: ["api"],
    });
  });

  it("writes the bundled app and marks the folder as the demo's", () => {
    const dir = join(tempDir(), "demo");
    expect(canWriteNativeDemo(dir)).toBe(true);
    writeNativeDemo(dir, { api: 4000, web: 3000 });
    for (const file of ["api/server.mjs", "web/server.mjs", "web/index.html"]) {
      expect(existsSync(join(dir, file))).toBe(true);
    }
    expect(JSON.parse(readFileSync(join(dir, "api/service.json"), "utf-8")).port).toBe(4000);
    expect(isNativeDemoFolder(dir)).toBe(true);
    expect(canWriteNativeDemo(dir)).toBe(true);
  });

  it("refuses a folder with someone else's files", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "notes.txt"), "mine");
    expect(canWriteNativeDemo(dir)).toBe(false);
  });
});

describe("runningNativeDemoUrl", () => {
  function writeState(dir: string, pid: number, web: Record<string, unknown>) {
    const path = nativeRunStatePath(dir);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid, startedAt: "now", services: { web } }));
  }

  it("returns the website URL of a live run", () => {
    const dir = tempDir();
    writeState(dir, process.pid, { url: "http://localhost:3005", port: 3005 });
    expect(runningNativeDemoUrl(dir)).toBe("http://localhost:3005");
  });

  it("ignores a run whose supervisor is gone", () => {
    const dir = tempDir();
    writeState(dir, 2_147_483_646, { port: 3005 });
    expect(runningNativeDemoUrl(dir)).toBeNull();
  });
});

describe("startNativeDemo", () => {
  function fakeSpawn(onSpawn: (child: EventEmitter) => void) {
    const calls: unknown[][] = [];
    const spawnFn = ((...args: unknown[]) => {
      calls.push(args);
      const child = Object.assign(new EventEmitter(), { unref: () => {} });
      setTimeout(() => onSpawn(child), 5);
      return child;
    }) as unknown as typeof import("node:child_process").spawn;
    return { calls, spawnFn };
  }

  it("resolves with the envelope flisk up writes to the log", async () => {
    const logPath = join(tempDir(), ".flisk", "demo.log");
    const { calls, spawnFn } = fakeSpawn(() =>
      writeFileSync(logPath, '{"schemaVersion":1,"data":{"ok":true,"runtime":"native"}}\n'),
    );
    const outcome = await startNativeDemo("/bin/flisk.js", "/demo", logPath, {
      spawnFn,
      pollMs: 5,
    });
    expect(outcome.ok).toBe(true);
    expect(calls[0]?.[1]).toEqual(["/bin/flisk.js", "up", "--json"]);
    expect(calls[0]?.[2]).toMatchObject({ cwd: "/demo", detached: true });
  });

  it("fails when flisk up exits before it is ready", async () => {
    const logPath = join(tempDir(), "demo.log");
    const { spawnFn } = fakeSpawn((child) => child.emit("exit", 1));
    const outcome = await startNativeDemo("/bin/flisk.js", "/demo", logPath, {
      spawnFn,
      pollMs: 5,
    });
    expect(outcome).toMatchObject({ ok: false });
    expect(outcome.error).toContain("code 1");
  });

  it("fails after the timeout", async () => {
    const logPath = join(tempDir(), "demo.log");
    const { spawnFn } = fakeSpawn(() => {});
    const outcome = await startNativeDemo("/bin/flisk.js", "/demo", logPath, {
      spawnFn,
      pollMs: 5,
      timeoutMs: 20,
    });
    expect(outcome.error).toBe("the demo services did not answer in time");
  });
});
