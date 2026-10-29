// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getContainerRuntimeStatus } from "../docker.js";

const { execSyncMock, execFileSyncMock } = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execSync: (command: string, options?: unknown) => execSyncMock(command, options),
    execFileSync: (command: string, args: string[], options?: unknown) =>
      execFileSyncMock(command, args, options),
  };
});

vi.mock("../which.js", () => ({ findOnPath: () => "C:\\Docker\\docker.exe" }));

function errorWithCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

// `docker ps` exits non-zero when the CLI is installed but the daemon is down.
function daemonDown(): Error {
  return Object.assign(new Error("Cannot connect to the Docker daemon"), { status: 1 });
}

const realPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

beforeEach(() => {
  execSyncMock.mockReset();
  execFileSyncMock.mockReset();
});

afterEach(() => {
  setPlatform(realPlatform);
});

describe("getContainerRuntimeStatus on Linux and macOS", () => {
  beforeEach(() => setPlatform("linux"));

  it("returns running when docker ps succeeds and stops checking", () => {
    execSyncMock.mockReturnValue(Buffer.from(""));
    expect(getContainerRuntimeStatus()).toBe("running");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledWith(
      "docker ps",
      expect.objectContaining({ stdio: "ignore", timeout: 10_000 }),
    );
  });

  it("falls back to colima and podman before giving up", () => {
    execSyncMock.mockImplementation((command: string) => {
      if (command === "podman ps") return Buffer.from("");
      throw errorWithCode("ENOENT");
    });
    expect(getContainerRuntimeStatus()).toBe("running");
    expect(execSyncMock.mock.calls.map(([command]) => command)).toEqual([
      "docker ps",
      "colima status",
      "podman ps",
    ]);
  });

  it("returns missing when no runtime binary is installed", () => {
    execSyncMock.mockImplementation(() => {
      throw errorWithCode("ENOENT");
    });
    expect(getContainerRuntimeStatus()).toBe("missing");
    expect(execSyncMock).toHaveBeenCalledTimes(3);
  });

  it("returns missing when docker is installed but the daemon is not running", () => {
    execSyncMock.mockImplementation(() => {
      throw daemonDown();
    });
    expect(getContainerRuntimeStatus()).toBe("missing");
  });

  it("returns unresponsive when a check times out and none succeeds", () => {
    execSyncMock.mockImplementation((command: string) => {
      throw command === "docker ps" ? errorWithCode("ETIMEDOUT") : errorWithCode("ENOENT");
    });
    expect(getContainerRuntimeStatus()).toBe("unresponsive");
  });
});

describe("getContainerRuntimeStatus on Windows", () => {
  beforeEach(() => setPlatform("win32"));

  it("returns running when docker ps succeeds", () => {
    execFileSyncMock.mockReturnValue(Buffer.from(""));
    expect(getContainerRuntimeStatus()).toBe("running");
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "C:\\Docker\\docker.exe",
      ["ps"],
      expect.objectContaining({ timeout: 10_000, windowsHide: true }),
    );
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("returns missing when docker ps fails", () => {
    execFileSyncMock.mockImplementation(() => {
      throw daemonDown();
    });
    expect(getContainerRuntimeStatus()).toBe("missing");
  });

  it("returns unresponsive when docker ps times out", () => {
    execFileSyncMock.mockImplementation(() => {
      throw errorWithCode("ETIMEDOUT");
    });
    expect(getContainerRuntimeStatus()).toBe("unresponsive");
  });
});
