// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isProcessAlive, nativeRunStatePath, stopNativeRun } from "../native-runtime.js";

it("leaves an unrelated live process alive when run.json contains its recycled pid (#3960)", async () => {
  const root = mkdtempSync(join(tmpdir(), "flisk-stale-pid-"));
  const victim = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: process.platform !== "win32",
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    victim.once("spawn", resolve);
    victim.once("error", reject);
  });
  const exited = new Promise<void>((resolve) => victim.once("exit", () => resolve()));
  try {
    mkdirSync(join(root, ".flisk", "native"), { recursive: true });
    writeFileSync(
      nativeRunStatePath(root),
      JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        services: { api: { pid: victim.pid, startTime: "a-different-process-start-time" } },
      }),
    );
    const result = await stopNativeRun(root, { timeoutMs: 100 });
    expect(isProcessAlive(victim.pid as number)).toBe(true);
    expect(result).toMatchObject({ stale: true, services: [] });
  } finally {
    victim.kill();
    await exited;
    rmSync(root, { recursive: true, force: true });
  }
});
