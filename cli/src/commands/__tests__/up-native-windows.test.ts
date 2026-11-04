// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";

// Local processes need no Docker, Tilt or WSL2: native Windows runs them, and only container runs get the WSL2 refusal.
describe("flisk up with local processes on native Windows", () => {
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  const cwd = process.cwd();
  const allow = process.env.FLISK_ALLOW_NATIVE_WINDOWS;

  afterEach(() => {
    if (platform) Object.defineProperty(process, "platform", platform);
    if (allow === undefined) delete process.env.FLISK_ALLOW_NATIVE_WINDOWS;
    else process.env.FLISK_ALLOW_NATIVE_WINDOWS = allow;
    process.chdir(cwd);
    vi.restoreAllMocks();
  });

  it("plans the run instead of refusing", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "flisk-up-win-native-")));
    mkdirSync(join(root, "api"));
    writeFileSync(
      join(root, "api", "service.json"),
      JSON.stringify({
        schemaVersion: 1,
        appName: "api",
        appType: "backend",
        command: "node server.js",
        port: 4999,
      }),
    );
    process.chdir(root);
    Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
    delete process.env.FLISK_ALLOW_NATIVE_WINDOWS;
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { exit } = captureExit();

    const { upCommand } = await import("../up.js");
    await upCommand.parseAsync(["--dry-run"], { from: "user" });

    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining("WSL2"));
    expect(logs.join("\n")).toContain("as local processes (no Docker, no Tilt)");
    exit.mockRestore();
  });
});
