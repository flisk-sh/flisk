// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FliskError } from "../../utils/errors.js";
import { reposCommand } from "../repos.js";

const { readProjectConfigMock, requireProjectRootMock, cloneMissingReposMock, planRepoClonesMock } =
  vi.hoisted(() => ({
    readProjectConfigMock: vi.fn(),
    requireProjectRootMock: vi.fn(() => "/mock/project/root"),
    cloneMissingReposMock: vi.fn(),
    planRepoClonesMock: vi.fn(),
  }));

vi.mock("../../generator/template-engine.js", () => ({
  readProjectConfig: readProjectConfigMock,
}));

vi.mock("../../utils/errors.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/errors.js")>()),
  requireProjectRoot: requireProjectRootMock,
}));

vi.mock("../../utils/project-repos.js", () => ({
  cloneMissingRepos: cloneMissingReposMock,
  planRepoClones: planRepoClonesMock,
}));

describe("repos command", () => {
  beforeEach(() => {
    const clone = reposCommand.commands.find((command) => command.name() === "clone");
    for (const option of clone?.options ?? []) {
      clone?.setOptionValue(option.attributeName(), undefined);
    }
    cloneMissingReposMock.mockClear();
    planRepoClonesMock.mockReset();
  });

  it("defines repos and clone sub-command", () => {
    expect(reposCommand.name()).toBe("repos");
    expect(reposCommand.description()).toBe(
      "Clone the Git repositories listed in .flisk/project.json",
    );
    const clone = reposCommand.commands.find((c) => c.name() === "clone");
    expect(clone).toBeDefined();
    expect(clone?.options.some((o) => o.long === "--json")).toBe(true);
    expect(clone?.options.some((o) => o.long === "--dry-run")).toBe(true);
  });

  it("handles empty repos configuration without error", async () => {
    readProjectConfigMock.mockReturnValue({ name: "mock-proj", repos: [] });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone"]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("No external repositories configured"),
    );
    logSpy.mockRestore();
  });

  it("outputs valid JSON envelope with --json when empty", async () => {
    readProjectConfigMock.mockReturnValue({ name: "mock-proj", repos: [] });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone", "--json"]);

    expect(logSpy).toHaveBeenCalled();
    const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(output).toEqual({
      schemaVersion: 1,
      data: { dryRun: false, cloned: [], existing: [] },
      errors: [],
    });
    logSpy.mockRestore();
  });

  it("clones missing repos and logs results", async () => {
    readProjectConfigMock.mockReturnValue({
      name: "mock-proj",
      repos: [
        { url: "https://github.com/acme/orders.git", dir: "services/orders" },
        { url: "https://github.com/acme/billing.git", dir: "services/billing" },
      ],
    });
    cloneMissingReposMock.mockResolvedValue([
      {
        url: "https://github.com/acme/orders.git",
        dir: "services/orders",
        cloned: true,
        skipped: false,
      },
      {
        url: "https://github.com/acme/billing.git",
        dir: "services/billing",
        cloned: false,
        skipped: true,
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone"]);

    expect(cloneMissingReposMock).toHaveBeenCalledWith("/mock/project/root", [
      { url: "https://github.com/acme/orders.git", dir: "services/orders" },
      { url: "https://github.com/acme/billing.git", dir: "services/billing" },
    ]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cloned"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Kept existing"));
    logSpy.mockRestore();
  });

  it("outputs structured data in JSON mode", async () => {
    readProjectConfigMock.mockReturnValue({
      name: "mock-proj",
      repos: [{ url: "https://github.com/acme/orders.git", dir: "services/orders" }],
    });
    cloneMissingReposMock.mockResolvedValue([
      {
        url: "https://github.com/acme/orders.git",
        dir: "services/orders",
        cloned: true,
        skipped: false,
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone", "--json"]);

    expect(logSpy).toHaveBeenCalled();
    const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(output.schemaVersion).toBe(1);
    expect(output.data.dryRun).toBe(false);
    expect(output.data.cloned).toEqual([
      { url: "https://github.com/acme/orders.git", dir: "services/orders" },
    ]);
    expect(output.data.existing).toEqual([]);
    expect(output.errors).toEqual([]);
    logSpy.mockRestore();
  });

  it("writes one REPOS_FAILED envelope on stdout when a clone fails with --json", async () => {
    readProjectConfigMock.mockReturnValue({
      name: "mock-proj",
      repos: [{ url: "https://github.com/acme/orders.git", dir: "services/orders" }],
    });
    cloneMissingReposMock.mockRejectedValue(new FliskError("Failed to clone repository"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone", "--json"]);

    const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(output.data).toBeNull();
    expect(output.errors[0].code).toBe("REPOS_FAILED");
    expect(output.errors[0].message).toContain("Failed to clone repository");
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    logSpy.mockRestore();
  });

  it("dry-run --json lists missing and present repos with branches, without cloning", async () => {
    readProjectConfigMock.mockReturnValue({
      name: "mock-proj",
      repos: [
        { url: "https://github.com/acme/orders.git", dir: "services/orders", branch: "develop" },
        { url: "https://github.com/acme/present.git", dir: "services/present" },
      ],
    });
    planRepoClonesMock.mockReturnValue([
      {
        repo: {
          url: "https://github.com/acme/orders.git",
          dir: "services/orders",
          branch: "develop",
        },
        url: "https://github.com/acme/orders.git",
        dir: "services/orders",
        branch: "develop",
        action: "clone",
        targetPath: "/mock/project/root/services/orders",
        createdParents: [],
      },
      {
        repo: { url: "https://github.com/acme/present.git", dir: "services/present" },
        url: "https://github.com/acme/present.git",
        dir: "services/present",
        action: "keep",
        reason: "destination directory already exists",
        targetPath: "/mock/project/root/services/present",
        createdParents: [],
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone", "--dry-run", "--json"]);

    const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(output).toEqual({
      schemaVersion: 1,
      data: {
        dryRun: true,
        cloned: [
          {
            url: "https://github.com/acme/orders.git",
            dir: "services/orders",
            branch: "develop",
          },
        ],
        existing: [{ url: "https://github.com/acme/present.git", dir: "services/present" }],
      },
      errors: [],
    });
    expect(planRepoClonesMock).toHaveBeenCalledWith("/mock/project/root", expect.any(Array));
    expect(cloneMissingReposMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("dry-run prints the clone plan without cloning", async () => {
    readProjectConfigMock.mockReturnValue({ name: "mock-proj", repos: [] });
    planRepoClonesMock.mockReturnValue([
      {
        repo: { url: "https://github.com/acme/orders.git", dir: "services/orders", branch: "main" },
        url: "https://github.com/acme/orders.git",
        dir: "services/orders",
        branch: "main",
        action: "clone",
        targetPath: "/mock/project/root/services/orders",
        createdParents: [],
      },
      {
        repo: { url: "https://github.com/acme/present.git", dir: "services/present" },
        url: "https://github.com/acme/present.git",
        dir: "services/present",
        action: "keep",
        reason: "destination directory already exists",
        targetPath: "/mock/project/root/services/present",
        createdParents: [],
      },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await reposCommand.parseAsync(["node", "flisk", "clone", "--dry-run"]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Dry run -"));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Would clone: https://github.com/acme/orders.git into services/orders (branch: main)",
      ),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Would keep existing folder services/present untouched"),
    );
    expect(cloneMissingReposMock).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
