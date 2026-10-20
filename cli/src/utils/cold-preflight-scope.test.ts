// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  checkDockerRuntime: vi.fn(),
  checkDockerCompose: vi.fn(),
  checkDockerVersions: vi.fn(),
  checkTilt: vi.fn(),
  findOnPath: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("../commands/doctor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../commands/doctor.js")>()),
  checkDockerRuntime: probes.checkDockerRuntime,
  checkDockerCompose: probes.checkDockerCompose,
  checkDockerVersions: probes.checkDockerVersions,
  checkTilt: probes.checkTilt,
}));
vi.mock("./which.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./which.js")>()),
  findOnPath: probes.findOnPath,
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: probes.execFileSync,
}));
vi.mock("./paths.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./paths.js")>()),
  findProjectRoot: vi.fn(() => null),
}));

import {
  assertMachineReadyOrExit,
  detectRuntimePrerequisites,
  formatRuntimeNextSteps,
  runColdPreflight,
} from "./cold-preflight.js";

const dockerDown = {
  name: "Docker Runtime",
  didPass: false,
  message: "Docker daemon is not running",
  fix: "Start Docker Desktop, OrbStack, or Colima, then retry: tdk doctor",
};
const tiltMissing = {
  name: "Tilt",
  didPass: false,
  message: "Tilt CLI not found",
  fix: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
};

let exitSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function errorOutput(): string {
  const calls = errorSpy.mock.calls;
  const first = calls[0];
  return first ? String(first[0]) : "";
}

beforeEach(() => {
  probes.checkDockerRuntime.mockResolvedValue(dockerDown);
  probes.checkDockerCompose.mockResolvedValue({
    name: "Docker Compose",
    didPass: false,
    message: "Docker Compose plugin not found",
  });
  probes.checkDockerVersions.mockResolvedValue({
    name: "Docker Versions",
    didPass: true,
    isSkipped: true,
    message: "Could not read Docker Engine/Compose versions - skipped version check",
  });
  probes.checkTilt.mockResolvedValue(tiltMissing);
  // Bun is installed while Docker and Tilt are not, the way a bare devcontainer looks.
  probes.findOnPath.mockImplementation((command: string) =>
    command === "bun" ? "/usr/local/bin/bun" : null,
  );
  probes.execFileSync.mockReturnValue("1.4.3");
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

describe("cold preflight scope", () => {
  it("does not probe the local runtime in the scaffold scope", async () => {
    const result = await runColdPreflight({ scope: "scaffold" });

    expect(probes.checkDockerRuntime).not.toHaveBeenCalled();
    expect(probes.checkDockerCompose).not.toHaveBeenCalled();
    expect(probes.checkTilt).not.toHaveBeenCalled();
    const ids = result.items.map((item) => item.id);
    expect(ids).not.toContain("docker");
    expect(ids).not.toContain("tilt");
  });

  it("still probes the local runtime in the runtime scope", async () => {
    const result = await runColdPreflight({ scope: "runtime" });

    expect(probes.checkDockerRuntime).toHaveBeenCalled();
    expect(probes.checkTilt).toHaveBeenCalled();
    const ids = result.items.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["docker", "compose", "tilt"]));
  });

  it("blocks the runtime scope when Docker is stopped and Tilt is missing", async () => {
    await expect(assertMachineReadyOrExit({ scope: "runtime" })).rejects.toThrow("process.exit(1)");

    const output = errorOutput();
    expect(output).toContain("Cold start blocked");
    expect(output).toContain("FAIL docker  Docker daemon is not running");
    expect(output).toContain("Start Docker Desktop, OrbStack, or Colima, then retry: tdk doctor");
    expect(output).toContain("FAIL tilt    Tilt CLI not found");
  });

  it("does not block the scaffold scope when Docker is stopped and Tilt is missing", async () => {
    await expect(assertMachineReadyOrExit({ scope: "scaffold" })).resolves.toBeUndefined();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still blocks the scaffold scope when Bun is missing", async () => {
    probes.findOnPath.mockImplementation(() => null);

    await expect(assertMachineReadyOrExit({ scope: "scaffold" })).rejects.toThrow(
      "process.exit(1)",
    );

    const output = errorOutput();
    expect(output).toContain("Project setup blocked. Bun 1.2+ must be installed on PATH.");
    expect(output).toContain("FAIL bun");
    // The runtime stays out of the scaffold gate, so it is not reported here.
    expect(output).not.toContain("FAIL docker");
    expect(output).not.toContain("FAIL compose");
    expect(output).not.toContain("FAIL tilt");
  });
});

describe("runtime prerequisites", () => {
  it("reports the installed runtime executables", () => {
    expect(detectRuntimePrerequisites(() => null)).toEqual({
      hasDockerCli: false,
      hasTiltCli: false,
    });
    expect(detectRuntimePrerequisites(() => "/usr/local/bin/tool")).toEqual({
      hasDockerCli: true,
      hasTiltCli: true,
    });
  });

  it("gives an actionable hint for every missing runtime executable", () => {
    const lines = formatRuntimeNextSteps({ hasDockerCli: false, hasTiltCli: false }).join("\n");

    expect(lines).toContain("Docker is not installed");
    expect(lines).toContain("Tilt is not installed");
    expect(lines).toContain("tdk doctor");
    expect(lines).toContain("tdk up");
  });

  it("still points at the runtime when both executables are installed", () => {
    const lines = formatRuntimeNextSteps({ hasDockerCli: true, hasTiltCli: true }).join("\n");

    expect(lines).not.toContain("is not installed");
    expect(lines).toContain("tdk up");
  });
});
