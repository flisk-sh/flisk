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
  await uiCommand.parseAsync(["node", "flisk"], { from: "node" });

  expect(renderMock).toHaveBeenCalledOnce();
  expect(renderMock).toHaveBeenCalledWith(expect.anything(), { alternateScreen: true });
});
