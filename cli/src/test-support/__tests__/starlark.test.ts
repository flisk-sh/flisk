// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateStarlark,
  killProcessGroup,
  MISSING_TILT_MESSAGE,
  resolveTiltAvailability,
} from "../starlark.js";

// The Tilt lookup is stubbed, so these run the same with or without Tilt installed.
describe("resolveTiltAvailability when Tilt is missing", () => {
  it("skips the Starlark suites with one warning when FLISK_REQUIRE_TILT is unset", () => {
    const warn = vi.fn();
    expect(resolveTiltAvailability(() => false, {}, warn)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(MISSING_TILT_MESSAGE);
  });

  it("fails with the same message when FLISK_REQUIRE_TILT=1, and does not warn", () => {
    const warn = vi.fn();
    expect(() => resolveTiltAvailability(() => false, { FLISK_REQUIRE_TILT: "1" }, warn)).toThrow(
      MISSING_TILT_MESSAGE,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("runs the suites, silently, when Tilt is found, even with FLISK_REQUIRE_TILT=1", () => {
    const warn = vi.fn();
    expect(resolveTiltAvailability(() => true, { FLISK_REQUIRE_TILT: "1" }, warn)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("killProcessGroup", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const stubPlatform = (value: NodeJS.Platform) =>
    Object.defineProperty(process, "platform", { configurable: true, value });
  afterEach(() => {
    if (platform) Object.defineProperty(process, "platform", platform);
  });

  it("sends SIGKILL to the whole process group on POSIX", () => {
    stubPlatform("linux");
    const kill = vi.fn();
    killProcessGroup(1234, kill);
    expect(kill).toHaveBeenCalledWith(-1234, "SIGKILL");
  });

  it("does nothing on Windows, which has no process groups", () => {
    stubPlatform("win32");
    const kill = vi.fn();
    killProcessGroup(1234, kill);
    expect(kill).not.toHaveBeenCalled();
  });

  it("never signals its own group when the spawn failed and the pid is 0", () => {
    stubPlatform("linux");
    const kill = vi.fn();
    killProcessGroup(0, kill);
    expect(kill).not.toHaveBeenCalled();
  });

  it("ignores a group that has already exited, and rethrows any other error", () => {
    stubPlatform("linux");
    const fail = (code: string) => () => {
      throw Object.assign(new Error(code), { code });
    };
    expect(() => killProcessGroup(1234, fail("ESRCH"))).not.toThrow();
    expect(() => killProcessGroup(1234, fail("EPERM"))).toThrow("EPERM");
  });
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// The stub `tilt` traps SIGTERM, as tilt does, and forks a child that would outlive it. POSIX only: on Windows,
// spawnSync finds only .exe and .com files on PATH, and the timeout's TerminateProcess cannot be trapped.
describe.skipIf(process.platform === "win32")("evaluateStarlark when tilt is stuck", () => {
  it("fails within the timeout and leaves no process behind", async () => {
    const bin = mkdtempSync(join(tmpdir(), "flisk-stuck-tilt-"));
    try {
      const pidFile = join(bin, "child.pid");
      writeFileSync(
        join(bin, "tilt"),
        `#!/bin/sh\ntrap '' TERM\nsleep 300 &\necho $! > '${pidFile}'\nwhile :; do sleep 1; done\n`,
        { mode: 0o755 },
      );
      const started = Date.now();
      expect(() =>
        evaluateStarlark(fileURLToPath(import.meta.url), {
          args: "",
          timeoutMs: 1000,
          env: { PATH: `${bin}${delimiter}${process.env.PATH}` },
        }),
      ).toThrow(/ETIMEDOUT/);
      expect(Date.now() - started).toBeLessThan(10_000);

      const child = Number(readFileSync(pidFile, "utf-8"));
      await vi.waitFor(() => expect(isAlive(child)).toBe(false), { timeout: 5000 });
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
