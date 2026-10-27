// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendFrameworkInventoryEntry } from "../../backend-frameworks/registry.js";
import type { FrontendFrameworkInventoryEntry } from "../../frontend-frameworks/registry.js";

const mocks = vi.hoisted(() => ({
  listBackendFrameworks: vi.fn<() => BackendFrameworkInventoryEntry[]>(),
  listFrontendFrameworks: vi.fn<() => FrontendFrameworkInventoryEntry[]>(),
}));

vi.mock("../../backend-frameworks/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../backend-frameworks/registry.js")>()),
  listBackendFrameworks: mocks.listBackendFrameworks,
}));

vi.mock("../../frontend-frameworks/registry.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../frontend-frameworks/registry.js")>()),
  listFrontendFrameworks: mocks.listFrontendFrameworks,
}));

import { printFrameworkInventory, printFrontendFrameworks } from "../resource.js";

afterEach(() => {
  vi.restoreAllMocks();
  mocks.listBackendFrameworks.mockReset();
  mocks.listFrontendFrameworks.mockReset();
});

describe("resource framework printers", () => {
  it("prints no lines for an empty framework inventory", () => {
    mocks.listBackendFrameworks.mockReturnValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printFrameworkInventory({ type: "backend" }, true);

    expect(log).not.toHaveBeenCalled();
  });

  it("prints two framework inventory entries in order", () => {
    mocks.listBackendFrameworks.mockReturnValue([
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
        languages: ["bun", "node"],
        compatible: false,
        command: "flisk resource <name> --type backend --language python",
      },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printFrameworkInventory({ type: "backend", language: "python" }, true);

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(
      1,
      "hono\tBun + Hono\tbun\tcompatible with python\tflisk resource <name> --type backend --framework hono",
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      "express\tBun + Express\tbun, node\tincompatible with --language python\tflisk resource <name> --type backend --language python",
    );
  });

  it("prints no lines for an empty frontend framework list", () => {
    mocks.listFrontendFrameworks.mockReturnValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printFrontendFrameworks();

    expect(log).not.toHaveBeenCalled();
  });

  it("prints two frontend framework entries in order", () => {
    mocks.listFrontendFrameworks.mockReturnValue([
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
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printFrontendFrameworks();

    expect(log).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenNthCalledWith(
      1,
      "react\tReact\tvite-spa\tverified\tflisk resource <name> --type frontend --framework react",
    );
    expect(log).toHaveBeenNthCalledWith(
      2,
      "next\tNext.js\tserver\tunverified\tflisk resource <name> --type frontend --framework next",
    );
  });
});
