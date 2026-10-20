// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkDockerRuntime: vi.fn(),
  checkDockerCompose: vi.fn(),
  checkDockerVersions: vi.fn(),
  checkTilt: vi.fn(),
  findOnPath: vi.fn(),
  execFileSync: vi.fn(),
}));

// The local runtime is missing: Docker is stopped and Tilt is not installed.
vi.mock("../doctor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../doctor.js")>()),
  checkDockerRuntime: mocks.checkDockerRuntime,
  checkDockerCompose: mocks.checkDockerCompose,
  checkDockerVersions: mocks.checkDockerVersions,
  checkTilt: mocks.checkTilt,
}));
vi.mock("../../utils/which.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/which.js")>()),
  findOnPath: mocks.findOnPath,
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: mocks.execFileSync,
}));
vi.mock("../../utils/paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths.js")>()),
  findProjectRoot: vi.fn(() => null),
}));
vi.mock("../../utils/agent-host.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/agent-host.js")>()),
  detectHost: vi.fn(() => ({ kind: "local", canUp: true })),
}));

import { upCommand } from "../up.js";

let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function errorOutput(): string {
  const calls = errorSpy.mock.calls;
  const first = calls[0];
  return first ? String(first[0]) : "";
}

beforeEach(() => {
  mocks.checkDockerRuntime.mockResolvedValue({
    name: "Docker Runtime",
    didPass: false,
    message: "Docker daemon is not running",
    fix: "Start Docker Desktop, OrbStack, or Colima, then retry: tdk doctor",
  });
  mocks.checkDockerCompose.mockResolvedValue({
    name: "Docker Compose",
    didPass: false,
    message: "Docker Compose plugin not found",
  });
  mocks.checkDockerVersions.mockResolvedValue({
    name: "Docker Versions",
    didPass: true,
    isSkipped: true,
    message: "Could not read Docker Engine/Compose versions - skipped version check",
  });
  mocks.checkTilt.mockResolvedValue({
    name: "Tilt",
    didPass: false,
    message: "Tilt CLI not found",
    fix: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
  });
  mocks.findOnPath.mockImplementation((command: string) =>
    command === "bun" ? "/usr/local/bin/bun" : null,
  );
  mocks.execFileSync.mockReturnValue("1.4.3");
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  exitSpy.mockRestore();
  errorSpy.mockRestore();
  vi.clearAllMocks();
});

describe("tdk up readiness gate", () => {
  it("blocks the startup when Docker is stopped and Tilt is missing", async () => {
    await expect(upCommand.parseAsync(["node", "tdk", "up"], { from: "node" })).rejects.toThrow(
      "process.exit(1)",
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    // The readiness gate has to be what blocks the startup. Without it `tdk up`
    // still exits 1, but later, with "Could not find project root" - a
    // different failure that this assertion would not accept.
    const output = errorOutput();
    expect(output).toContain("Cold start blocked");
    expect(output).toContain("FAIL docker");
  });

  it("reports the actionable fixes for the missing runtime", async () => {
    await expect(upCommand.parseAsync(["node", "tdk", "up"], { from: "node" })).rejects.toThrow(
      "process.exit(1)",
    );

    const output = errorOutput();
    expect(output).toContain("Cold start blocked");
    expect(output).toContain("FAIL docker  Docker daemon is not running");
    expect(output).toContain("Start Docker Desktop, OrbStack, or Colima, then retry: tdk doctor");
    expect(output).toContain("FAIL tilt    Tilt CLI not found");
    expect(output).toContain(
      "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh",
    );
  });
});
