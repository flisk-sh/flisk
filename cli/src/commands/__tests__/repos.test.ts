// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from "vitest";
import { reposCommand } from "../repos.js";

const { readProjectConfigMock, requireProjectRootMock, cloneMissingReposMock } = vi.hoisted(() => ({
  readProjectConfigMock: vi.fn(),
  requireProjectRootMock: vi.fn(() => "/mock/project/root"),
  cloneMissingReposMock: vi.fn(),
}));

vi.mock("../../generator/template-engine.js", () => ({
  readProjectConfig: readProjectConfigMock,
}));

vi.mock("../../utils/errors.js", () => ({
  requireProjectRoot: requireProjectRootMock,
}));

vi.mock("../../utils/project-repos.js", () => ({
  cloneMissingRepos: cloneMissingReposMock,
}));

describe("repos command", () => {
  it("defines repos and clone sub-command", () => {
    expect(reposCommand.name()).toBe("repos");
    const clone = reposCommand.commands.find((c) => c.name() === "clone");
    expect(clone).toBeDefined();
    expect(clone?.options.some((o) => o.long === "--json")).toBe(true);
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
      data: { cloned: [], existing: [] },
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
    expect(output.data.cloned).toEqual([
      { url: "https://github.com/acme/orders.git", dir: "services/orders" },
    ]);
    expect(output.data.existing).toEqual([]);
    expect(output.errors).toEqual([]);
    logSpy.mockRestore();
  });
});
