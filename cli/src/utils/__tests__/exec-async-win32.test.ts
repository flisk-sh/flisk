// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execAsync } from "../exec-async.js";
import { findOnPath } from "../which.js";

const { execFileAsync } = vi.hoisted(() => ({ execFileAsync: vi.fn() }));

// `promisify(execFile)` in exec-async.ts resolves through the promisify.custom
// symbol, so the mock returns `{ stdout }` the way the real promisified execFile does.
vi.mock("node:child_process", () => ({
  exec: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: vi.fn() }),
  execFile: Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: (...args: unknown[]) => execFileAsync(...args),
  }),
}));

vi.mock("../which.js", () => ({ findOnPath: vi.fn() }));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

describe("execAsync on win32", () => {
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32" });
    execFileAsync.mockReset();
    execFileAsync.mockResolvedValue({ stdout: "ok\n" });
    vi.mocked(findOnPath).mockReset();
    vi.mocked(findOnPath).mockReturnValue(null);
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, "platform", originalPlatform);
  });

  it("runs the resolved executable with shell disabled and returns stdout", async () => {
    vi.mocked(findOnPath).mockReturnValue("C:\\tools\\docker.exe");
    execFileAsync.mockResolvedValue({ stdout: "Docker version 27\n" });

    expect(await execAsync("docker version", 4000)).toBe("Docker version 27\n");

    expect(findOnPath).toHaveBeenCalledWith("docker");
    expect(execFileAsync).toHaveBeenCalledWith("C:\\tools\\docker.exe", ["version"], {
      encoding: "utf-8",
      timeout: 4000,
      windowsHide: true,
      shell: false,
    });
  });

  it("splits arguments on whitespace and strips surrounding quotes", async () => {
    vi.mocked(findOnPath).mockReturnValue("C:\\bin\\tool.exe");

    await execAsync(`tool "two words" 'single quoted' plain`, 1000);

    expect(execFileAsync).toHaveBeenCalledWith(
      "C:\\bin\\tool.exe",
      ["two words", "single quoted", "plain"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("falls back to the bare command name when findOnPath finds nothing", async () => {
    vi.mocked(findOnPath).mockReturnValue(null);

    await execAsync("missing-binary --flag", 1000);

    expect(findOnPath).toHaveBeenCalledWith("missing-binary");
    expect(execFileAsync).toHaveBeenCalledWith(
      "missing-binary",
      ["--flag"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("passes no arguments when the command is a single token", async () => {
    vi.mocked(findOnPath).mockReturnValue("C:\\bin\\git.exe");

    await execAsync("git", 1000);

    expect(execFileAsync).toHaveBeenCalledWith("C:\\bin\\git.exe", [], expect.any(Object));
  });

  it("rejects an empty command without spawning anything", async () => {
    await expect(execAsync("", 1000)).rejects.toThrow("Command is empty");
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only command without spawning anything", async () => {
    await expect(execAsync("   \t ", 1000)).rejects.toThrow("Command is empty");
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it("rejects when the executable name is an empty quoted token", async () => {
    await expect(execAsync(`""`, 1000)).rejects.toThrow("Command is empty");
    expect(execFileAsync).not.toHaveBeenCalled();
  });

  it("propagates execFile failures to the caller", async () => {
    vi.mocked(findOnPath).mockReturnValue("C:\\bin\\fail.exe");
    const failure = Object.assign(new Error("exit 2"), { code: 2 });
    execFileAsync.mockRejectedValue(failure);

    await expect(execAsync("fail.exe", 1000)).rejects.toBe(failure);
  });
});
