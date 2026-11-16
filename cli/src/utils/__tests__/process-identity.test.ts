// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { bootTimeMs, linuxStatStartTime, processStartTime } from "../process-identity.js";

describe("linuxStatStartTime", () => {
  it("reads field 22 even when the process name holds spaces and parentheses", () => {
    const tail = Array.from({ length: 20 }, (_, i) => String(i + 3));
    tail[19] = "987654";
    expect(linuxStatStartTime(`4242 (my (odd) name) ${tail.join(" ")}`)).toBe("987654");
  });

  it("returns undefined for a malformed line", () => {
    expect(linuxStatStartTime("garbage")).toBeUndefined();
    expect(linuxStatStartTime("1 (x) S 2")).toBeUndefined();
  });
});

describe("processStartTime (#3960)", () => {
  it("asks PowerShell for the start time on Windows", async () => {
    const run = vi.fn(async () => "2026-11-17T05:00:00.1234567Z\r\n");
    expect(await processStartTime(4242, { platform: "win32", run })).toBe(
      "2026-11-17T05:00:00.1234567Z",
    );
    const [file, args] = run.mock.calls[0] as unknown as [string, string[]];
    expect(file).toMatch(/\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/);
    expect(args.join(" ")).toContain("Get-Process -Id 4242");
  });

  it("reads /proc on Linux and falls back to ps when /proc is not readable", async () => {
    const tail = Array.from({ length: 20 }, () => "0");
    tail[19] = "555";
    const readFile = vi.fn(async () => `4242 (node) ${tail.join(" ")}`);
    expect(await processStartTime(4242, { platform: "linux", readFile })).toBe("555");

    const run = vi.fn(async () => "Tue Nov 17 05:00:00 2026\n");
    const failingRead = vi.fn(async () => {
      throw new Error("ENOENT");
    });
    expect(await processStartTime(4242, { platform: "linux", readFile: failingRead, run })).toBe(
      "Tue Nov 17 05:00:00 2026",
    );
  });

  it("uses ps -o lstart= on macOS", async () => {
    const run = vi.fn(async () => "Tue Nov 17 05:00:00 2026\n");
    expect(await processStartTime(4242, { platform: "darwin", run })).toBe(
      "Tue Nov 17 05:00:00 2026",
    );
    expect(run).toHaveBeenCalledWith("/bin/ps", ["-o", "lstart=", "-p", "4242"]);
  });

  it("returns undefined when the lookup fails or prints nothing", async () => {
    const failing = vi.fn(async () => {
      throw new Error("no such process");
    });
    expect(await processStartTime(4242, { platform: "darwin", run: failing })).toBeUndefined();
    expect(
      await processStartTime(4242, { platform: "win32", run: async () => "  \n" }),
    ).toBeUndefined();
    expect(await processStartTime(0)).toBeUndefined();
    expect(await processStartTime(-5)).toBeUndefined();
  });

  it("gives this process the same start time twice, and none to a process that exited", async () => {
    const first = await processStartTime(process.pid);
    expect(first).toBeTruthy();
    expect(await processStartTime(process.pid)).toBe(first);

    const exited = spawn(process.execPath, ["-e", ""]);
    await new Promise((resolve) => exited.once("exit", resolve));
    expect(await processStartTime(exited.pid as number)).toBeUndefined();
  }, 30_000);
});

describe("bootTimeMs", () => {
  it("is in the past", () => {
    expect(bootTimeMs()).toBeLessThan(Date.now());
  });
});
