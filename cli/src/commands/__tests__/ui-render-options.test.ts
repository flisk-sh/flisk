// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, it, vi } from "vitest";

const { renderMock, isTiltAvailableMock, requireProjectRootMock } = vi.hoisted(() => ({
  renderMock: vi.fn(),
  isTiltAvailableMock: vi.fn(async () => true),
  requireProjectRootMock: vi.fn(),
}));

vi.mock("ink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ink")>();
  return { ...actual, render: renderMock };
});

vi.mock("../../utils/tilt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/tilt.js")>();
  return { ...actual, isTiltAvailable: isTiltAvailableMock };
});

vi.mock("../../utils/errors.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/errors.js")>();
  return { ...actual, requireProjectRoot: requireProjectRootMock };
});

import { uiCommand } from "../ui.js";

it("renders the UI in Ink's alternate screen", async () => {
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
  try {
    await uiCommand.parseAsync(["node", "flisk"], { from: "node" });
  } finally {
    for (const [stream, desc] of [
      [process.stdin, stdinTTY],
      [process.stdout, stdoutTTY],
    ] as const) {
      if (desc) Object.defineProperty(stream, "isTTY", desc);
      else delete (stream as { isTTY?: boolean }).isTTY;
    }
  }

  expect(renderMock).toHaveBeenCalledOnce();
  expect(renderMock).toHaveBeenCalledWith(expect.anything(), { alternateScreen: true });
});

it("includes an Examples block in flisk ui --help", () => {
  let helpOutput = "";
  uiCommand.configureOutput({
    writeOut: (str) => {
      helpOutput += str;
    },
  });
  uiCommand.outputHelp();

  expect(helpOutput).toContain("Examples:");
  expect(helpOutput).toContain("flisk ui --high-contrast");
  expect(helpOutput).toContain("flisk ui --no-animations");
  expect(helpOutput.trimEnd().endsWith("flisk ui --no-animations")).toBe(true);
});
