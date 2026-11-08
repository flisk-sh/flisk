// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTempDir, runCommandInProcess } from "../../test-support/index.js";

const mocks = vi.hoisted(() => ({
  findStaleProjects: vi.fn(),
  pruneStaleProjects: vi.fn(),
  promptConfirm: vi.fn(),
}));

vi.mock("../../utils/stale-projects.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/stale-projects.js")>()),
  findStaleProjects: mocks.findStaleProjects,
  pruneStaleProjects: mocks.pruneStaleProjects,
}));

vi.mock("../../utils/prompt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/prompt.js")>()),
  promptConfirm: mocks.promptConfirm,
}));

function stale(name: string, recorded: boolean) {
  return {
    name,
    recordedPath: `/gone/${name}`,
    containers: [],
    volumes: [`${name}_data`],
    networks: [],
    images: [],
    recorded,
    containerCount: 0,
    volumeCount: 1,
    networkCount: 0,
    imageCount: 0,
    estimatedSizeBytes: 0,
    estimatedSize: "0 B",
    cleanupCommand: "",
  };
}

async function runProjects(args: string[], tty: boolean) {
  Object.defineProperty(process.stdin, "isTTY", { value: tty, configurable: true });
  vi.resetModules();
  const command: Command = (await import("../projects.js")).projectsCommand;
  return runCommandInProcess(command, args, createTempDir("flisk-prune-confirm-"));
}

describe("flisk projects --stale --prune confirmation", () => {
  const originalTty = process.stdin.isTTY;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.findStaleProjects.mockReturnValue({ staleProjects: [stale("old-shop", true)] });
    mocks.pruneStaleProjects.mockReturnValue({ projects: [], skipped: [] });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: originalTty, configurable: true });
  });

  it.each([
    ["no terminal", ["--stale", "--prune"], false],
    ["--json", ["--stale", "--prune", "--json"], true],
  ])("refuses to delete without --yes when it cannot ask (%s)", async (_label, args, tty) => {
    const result = await runProjects(args as string[], tty as boolean);

    expect(mocks.pruneStaleProjects).not.toHaveBeenCalled();
    expect(mocks.promptConfirm).not.toHaveBeenCalled();
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("needs confirmation");
  });

  it("deletes without asking with --yes", async () => {
    await runProjects(["--stale", "--prune", "--yes"], false);

    expect(mocks.promptConfirm).not.toHaveBeenCalled();
    expect(mocks.pruneStaleProjects).toHaveBeenCalledTimes(1);
  });

  it("asks in a terminal, defaulting to no, and deletes on yes", async () => {
    mocks.promptConfirm.mockResolvedValue(true);

    const result = await runProjects(["--stale", "--prune"], true);

    expect(mocks.promptConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        initial: false,
        message: expect.stringContaining("database data included"),
      }),
    );
    expect(result.stdout).toContain("old-shop");
    expect(mocks.pruneStaleProjects).toHaveBeenCalledTimes(1);
  });

  it("deletes nothing when the answer is no or the prompt is cancelled", async () => {
    mocks.promptConfirm.mockResolvedValueOnce(false);
    expect((await runProjects(["--stale", "--prune"], true)).stdout).toContain("Nothing deleted.");

    mocks.promptConfirm.mockRejectedValueOnce(new Error("cancelled"));
    expect((await runProjects(["--stale", "--prune"], true)).stdout).toContain("Nothing deleted.");

    expect(mocks.pruneStaleProjects).not.toHaveBeenCalled();
  });

  it("does not ask when nothing it could delete is listed", async () => {
    mocks.findStaleProjects.mockReturnValue({ staleProjects: [stale("not-flisk", false)] });

    await runProjects(["--stale", "--prune"], false);

    expect(mocks.promptConfirm).not.toHaveBeenCalled();
    expect(mocks.pruneStaleProjects).toHaveBeenCalledTimes(1);
  });
});
