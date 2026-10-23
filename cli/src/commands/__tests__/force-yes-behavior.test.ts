// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  promptConfirmMock,
  assertMachineReadyMock,
  buildTiltDownArgsMock,
  runTiltMock,
  generateMasterConfigsMock,
} = vi.hoisted(() => ({
  promptConfirmMock: vi.fn(),
  assertMachineReadyMock: vi.fn(),
  buildTiltDownArgsMock: vi.fn(),
  runTiltMock: vi.fn(),
  generateMasterConfigsMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/cold-preflight.js", () => ({
  assertMachineReadyOrExit: assertMachineReadyMock,
  detectRuntimePrerequisites: vi.fn(() => ({ hasDockerCli: true, hasTiltCli: true })),
  formatRuntimeNextSteps: vi.fn(() => []),
}));

vi.mock("../../utils/prompt.js", () => ({
  promptConfirm: promptConfirmMock,
  promptText: vi.fn(),
  promptMultiSelect: vi.fn(),
}));

vi.mock("../../utils/docker.js", () => ({
  getContainerRuntimeStatus: vi.fn(() => "running"),
}));

vi.mock("../../utils/tilt.js", () => ({
  buildTiltDownArgs: buildTiltDownArgsMock,
  getTiltfilePath: vi.fn(),
  isTiltAvailable: vi.fn(async () => true),
  runTilt: runTiltMock,
}));

vi.mock("../../generator/template-engine.js", () => ({
  generateMasterConfigs: generateMasterConfigsMock,
  readProjectConfig: vi.fn(),
}));

import { downCommand } from "../down.js";
import { buildForwardedImportArgs } from "../import.js";
import { projectCommand } from "../project.js";

describe("behavioral flag contract: --force vs --yes", () => {
  let tempDir: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tdk-force-yes-behavior-"));
    mkdirSync(join(tempDir, ".tdk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".tdk", "project.json"),
      JSON.stringify({ project: { name: "test-app", version: "1.0.0" } }),
    );
    process.chdir(tempDir);

    promptConfirmMock.mockReset();
    assertMachineReadyMock.mockReset().mockResolvedValue(undefined);
    buildTiltDownArgsMock.mockReset().mockReturnValue([]);
    runTiltMock.mockReset().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    generateMasterConfigsMock.mockReset().mockResolvedValue(undefined);

    for (const opt of ["force", "yes", "dryRun", "json", "verbose", "pruneNetworks"]) {
      downCommand.setOptionValue(opt, false);
      projectCommand.setOptionValue(opt, false);
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("project: --force alone preserves confirmation prompt; user declining aborts reset", async () => {
    promptConfirmMock.mockResolvedValue(false);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await projectCommand.parseAsync(["node", "flisk", "--force"], { from: "node" });

    expect(promptConfirmMock).toHaveBeenCalledTimes(1);
    expect(promptConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("reset your project configuration"),
      }),
    );
    log.mockRestore();
  });

  it("project: --force with --yes bypasses the confirmation prompt entirely and rewrites project configuration", async () => {
    promptConfirmMock.mockResolvedValue(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await projectCommand.parseAsync(["node", "flisk", "--force", "--yes"], { from: "node" });

    expect(promptConfirmMock).not.toHaveBeenCalled();
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("Using default configuration (non-interactive mode)");

    const rewritten = JSON.parse(readFileSync(join(tempDir, ".tdk", "project.json"), "utf-8"));
    expect(rewritten).toMatchObject({
      project: {
        name: expect.any(String),
      },
    });
    expect(generateMasterConfigsMock).toHaveBeenCalledWith(tempDir, { quiet: false });
    log.mockRestore();
  });

  it("down: --yes executes cleanly without deprecation warning or prompts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await downCommand.parseAsync(["node", "flisk", "--yes"], { from: "node" });

    expect(downCommand.opts().yes).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(runTiltMock).toHaveBeenCalledWith("down", expect.any(Array), expect.any(Object));
    warn.mockRestore();
    log.mockRestore();
  });

  it("down: --force sets options.yes, logs a deprecation warning, and does not forward force to Tilt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await downCommand.parseAsync(["node", "flisk", "--force"], { from: "node" });

    expect(downCommand.opts().yes).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "Note: --force (-f) on flisk down is deprecated; use --yes (-y) instead.",
      ),
    );
    expect(buildTiltDownArgsMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ force: true }),
    );
    warn.mockRestore();
    log.mockRestore();
  });

  it("import: forwards --yes and --force cleanly regardless of flag ordering or aliases", () => {
    expect(buildForwardedImportArgs(["."], { yes: true })).toEqual([".", "--yes"]);
    expect(buildForwardedImportArgs([".", "-y"])).toEqual([".", "--yes"]);
    expect(buildForwardedImportArgs(["--yes", "."])).toEqual([".", "--yes"]);
    expect(buildForwardedImportArgs(["."], { force: true })).toEqual([".", "--force"]);
    expect(buildForwardedImportArgs([".", "-f"])).toEqual([".", "--force"]);
    expect(buildForwardedImportArgs(["--force", "."])).toEqual([".", "--force"]);
    expect(buildForwardedImportArgs(["-y", ".", "-f"])).toEqual([".", "--yes", "--force"]);
    expect(buildForwardedImportArgs(["--yes", ".", "--force"], { yes: true, force: true })).toEqual(
      [".", "--yes", "--force"],
    );
  });
});
