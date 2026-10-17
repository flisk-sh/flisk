// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  promptConfirm: vi.fn(async (_options: { message: string; initial: boolean }) => true),
  showCancelled: vi.fn(),
  showErrorAndExit: vi.fn(),
}));

vi.mock("../errors.js", () => ({ showErrorAndExit: mocks.showErrorAndExit }));
vi.mock("../formatting.js", () => ({ showCancelled: mocks.showCancelled }));
vi.mock("../prompt.js", () => ({ promptConfirm: mocks.promptConfirm }));

import { assertValid, confirmOrCancel, handleDryRun } from "../command-helpers.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.promptConfirm.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleDryRun", () => {
  it("returns false and prints nothing when dryRun is unset", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(handleDryRun({}, "start the stack", "tdk up")).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("prints the dry-run description and command when enabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(handleDryRun({ dryRun: true }, "start the stack", "tdk up")).toBe(true);
    expect(log.mock.calls).toEqual([["Dry run - start the stack"], ["Would run: tdk up"]]);
  });

  it.each([
    ["dryRun is false", { dryRun: false }],
    ["options are empty", {}],
  ])("returns false and prints nothing when %s", (_label, options) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(handleDryRun(options, "start the stack", "tdk up")).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });

  it("still prints both lines when the description is empty", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(handleDryRun({ dryRun: true }, "", "tdk up")).toBe(true);
    expect(log.mock.calls).toEqual([["Dry run - "], ["Would run: tdk up"]]);
  });
});

describe("assertValid", () => {
  it("does nothing for a valid result", () => {
    expect(() => assertValid({ valid: true })).not.toThrow();
    expect(mocks.showErrorAndExit).not.toHaveBeenCalled();
  });

  it("uses the validation message and supplied exit code for an invalid result", () => {
    assertValid({ valid: false, error: "A required value is missing" }, 4);

    expect(mocks.showErrorAndExit).toHaveBeenCalledWith("A required value is missing", 4);
  });

  it("uses a fallback message when an invalid result has no error", () => {
    assertValid({ valid: false }, 3);

    expect(mocks.showErrorAndExit).toHaveBeenCalledWith("Validation failed", 3);
  });

  it("exits with code 1 when no exit code is given", () => {
    assertValid({ valid: false, error: "Bad input" });

    expect(mocks.showErrorAndExit).toHaveBeenCalledWith("Bad input", 1);
  });

  it("passes an empty error string through, since only null or undefined falls back", () => {
    assertValid({ valid: false, error: "" }, 2);

    expect(mocks.showErrorAndExit).toHaveBeenCalledWith("", 2);
  });
});

describe("confirmOrCancel", () => {
  it("returns true when the prompt is confirmed", async () => {
    await expect(confirmOrCancel("Continue?")).resolves.toBe(true);

    expect(mocks.promptConfirm).toHaveBeenCalledWith({
      message: "Continue?",
      initial: true,
    });
    expect(mocks.showCancelled).not.toHaveBeenCalled();
  });

  it("returns false and calls onCancel when the prompt is declined", async () => {
    mocks.promptConfirm.mockResolvedValue(false);
    const onCancel = vi.fn();

    await expect(confirmOrCancel("Continue?", onCancel)).resolves.toBe(false);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(mocks.showCancelled).toHaveBeenCalledOnce();
  });

  it("returns false without calling onCancel when none is given", async () => {
    mocks.promptConfirm.mockResolvedValue(false);

    await expect(confirmOrCancel("Continue?")).resolves.toBe(false);
    expect(mocks.showCancelled).toHaveBeenCalledOnce();
  });

  it("rejects instead of confirming when the prompt fails", async () => {
    mocks.promptConfirm.mockRejectedValue(new Error("stdin closed"));
    const onCancel = vi.fn();

    await expect(confirmOrCancel("Continue?", onCancel)).rejects.toThrow("stdin closed");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
