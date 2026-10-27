// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type InProcessRun, runCommandInProcess } from "../../test-support/run-in-process.js";

const listMocks = vi.hoisted(() => ({
  listBackendFrameworks: vi.fn(),
  listFrontendFrameworks: vi.fn(),
}));

vi.mock("../../backend-frameworks/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../backend-frameworks/registry.js")>()),
  listBackendFrameworks: listMocks.listBackendFrameworks,
}));

vi.mock("../../frontend-frameworks/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../frontend-frameworks/registry.js")>()),
  listFrontendFrameworks: listMocks.listFrontendFrameworks,
}));

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

async function runFrameworkListing(args: string[]): Promise<InProcessRun> {
  vi.resetModules();
  const { resourceCommand } = await import("../resource.js");
  return runCommandInProcess(resourceCommand, args, repoRoot);
}

describe("printFrameworkInventory", () => {
  beforeEach(() => {
    listMocks.listBackendFrameworks.mockReset();
    listMocks.listFrontendFrameworks.mockReset();
  });

  it("prints no lines for an empty backend inventory", async () => {
    listMocks.listBackendFrameworks.mockReturnValue([]);

    const result = await runFrameworkListing(["--type", "backend", "--frameworks"]);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(listMocks.listBackendFrameworks).toHaveBeenCalledWith(undefined);
  });

  it("prints two backend inventory entries as tab-separated rows", async () => {
    listMocks.listBackendFrameworks.mockReturnValue([
      {
        id: "hono",
        label: "Bun + Hono",
        languages: ["bun"],
        compatible: true,
        command: "flisk resource <name> --type backend --framework hono",
      },
      {
        id: "express",
        label: "Bun + Express",
        languages: ["bun"],
        compatible: false,
        command: "flisk resource <name> --type backend",
      },
    ]);

    const result = await runFrameworkListing(["--type", "backend", "--frameworks"]);

    const expected = [
      "hono\tBun + Hono\tbun\tcompatible with bun\tflisk resource <name> --type backend --framework hono",
      "express\tBun + Express\tbun\tincompatible with --language bun\tflisk resource <name> --type backend",
    ].join("\n");
    expect(result.stdout).toBe(`${expected}\n`);
    expect(result.stderr).toBe("");
  });
});

describe("printFrontendFrameworks", () => {
  beforeEach(() => {
    listMocks.listBackendFrameworks.mockReset();
    listMocks.listFrontendFrameworks.mockReset();
  });

  it("prints no lines for an empty frontend inventory", async () => {
    listMocks.listFrontendFrameworks.mockReturnValue([]);

    const result = await runFrameworkListing(["--type", "frontend", "--frameworks"]);

    expect(result.status).toBeUndefined();
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(listMocks.listFrontendFrameworks).toHaveBeenCalledWith();
  });

  it("prints two frontend inventory entries as tab-separated rows", async () => {
    listMocks.listFrontendFrameworks.mockReturnValue([
      {
        id: "react",
        label: "React",
        kind: "vite-spa",
        verified: true,
        command: "flisk resource <name> --type frontend --framework react",
      },
      {
        id: "next",
        label: "Next.js",
        kind: "server",
        verified: false,
        command: "flisk resource <name> --type frontend --framework next",
      },
    ]);

    const result = await runFrameworkListing(["--type", "frontend", "--frameworks"]);

    const expected = [
      "react\tReact\tvite-spa\tverified\tflisk resource <name> --type frontend --framework react",
      "next\tNext.js\tserver\tunverified\tflisk resource <name> --type frontend --framework next",
    ].join("\n");
    expect(result.stdout).toBe(`${expected}\n`);
    expect(result.stderr).toBe("");
  });
});
