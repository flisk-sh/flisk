// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSpinner } from "../spinner.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

describe("startSpinner", () => {
  let stderrChunks: string[];
  let writeSpy: ReturnType<typeof vi.spyOn>;
  const originalDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

  const setStderrIsTTY = (value: boolean) => {
    Object.defineProperty(process.stderr, "isTTY", {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  };

  const restoreStderrIsTTY = () => {
    if (originalDescriptor) {
      Object.defineProperty(process.stderr, "isTTY", originalDescriptor);
    } else {
      delete (process.stderr as { isTTY?: boolean }).isTTY;
    }
  };

  beforeEach(() => {
    stderrChunks = [];
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrChunks.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    writeSpy.mockRestore();
    vi.restoreAllMocks();
    restoreStderrIsTTY();
  });

  describe("non-TTY environment (isTTY === false)", () => {
    beforeEach(() => {
      setStderrIsTTY(false);
    });

    it("prints plain line on start and does not write animation frames or clear sequences", () => {
      vi.useFakeTimers();
      const spinner = startSpinner("Installing dependencies");

      expect(stderrChunks).toEqual(["- Installing dependencies\n"]);

      // Advancing time should not write animation frames or schedule intervals
      vi.advanceTimersByTime(500);
      expect(stderrChunks).toEqual(["- Installing dependencies\n"]);

      // Verify no animation frames or ANSI cursor clears
      for (const frame of FRAMES) {
        expect(stderrChunks.some((chunk) => chunk.includes(frame))).toBe(false);
      }
      expect(stderrChunks.some((chunk) => chunk.includes("\r\x1b[2K"))).toBe(false);

      spinner.succeed();
    });

    it("succeed writes the green checkmark prefix and message to process.stderr", () => {
      const spinner = startSpinner("Downloading packages");
      spinner.succeed("Packages downloaded");

      const expectedPrefix = chalk.green("✔");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Packages downloaded\n`);
      expect(lastOutput.startsWith(expectedPrefix)).toBe(true);
      expect(lastOutput).toContain("✔");
      expect(lastOutput).toContain("Packages downloaded");
    });

    it("succeed falls back to current text when no message is provided", () => {
      const spinner = startSpinner("Building assets");
      spinner.succeed();

      const expectedPrefix = chalk.green("✔");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Building assets\n`);
    });

    it("fail writes the red cross prefix and message to process.stderr", () => {
      const spinner = startSpinner("Validating schema");
      spinner.fail("Schema validation failed");

      const expectedPrefix = chalk.red("✖");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Schema validation failed\n`);
      expect(lastOutput.startsWith(expectedPrefix)).toBe(true);
      expect(lastOutput).toContain("✖");
      expect(lastOutput).toContain("Schema validation failed");
    });

    it("fail falls back to current text when no message is provided", () => {
      const spinner = startSpinner("Running migrations");
      spinner.fail();

      const expectedPrefix = chalk.red("✖");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Running migrations\n`);
    });

    it("warn writes the yellow warning prefix and message to process.stderr", () => {
      const spinner = startSpinner("Checking disk space");
      spinner.warn("Low disk space");

      const expectedPrefix = chalk.yellow("⚠");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Low disk space\n`);
      expect(lastOutput.startsWith(expectedPrefix)).toBe(true);
      expect(lastOutput).toContain("⚠");
      expect(lastOutput).toContain("Low disk space");
    });

    it("warn falls back to current text when no message is provided", () => {
      const spinner = startSpinner("Inspecting certificates");
      spinner.warn();

      const expectedPrefix = chalk.yellow("⚠");
      const lastOutput = stderrChunks[stderrChunks.length - 1];

      expect(lastOutput).toBe(`${expectedPrefix} Inspecting certificates\n`);
    });

    it("updates text and writes plain line when text setter is invoked", () => {
      const spinner = startSpinner("Step 1: Init");
      expect(spinner.text).toBe("Step 1: Init");

      spinner.text = "Step 2: Compile";
      expect(spinner.text).toBe("Step 2: Compile");
      expect(stderrChunks).toEqual(["- Step 1: Init\n", "- Step 2: Compile\n"]);

      spinner.succeed();
      expect(stderrChunks[stderrChunks.length - 1]).toBe(`${chalk.green("✔")} Step 2: Compile\n`);
    });
  });

  describe("TTY environment (isTTY === true)", () => {
    beforeEach(() => {
      setStderrIsTTY(true);
      vi.useFakeTimers();
    });

    it("renders initial animation frame with ANSI clear code on start", () => {
      const spinner = startSpinner("Loading project");

      expect(stderrChunks[0]).toBe(`\r\x1b[2K${chalk.cyan(FRAMES[0])} Loading project`);

      spinner.succeed();
    });

    it("advances animation frames over time intervals", () => {
      const spinner = startSpinner("Connecting to daemon");

      expect(stderrChunks[0]).toBe(`\r\x1b[2K${chalk.cyan(FRAMES[0])} Connecting to daemon`);

      // Advance one interval (80ms)
      vi.advanceTimersByTime(80);
      expect(stderrChunks[1]).toBe(`\r\x1b[2K${chalk.cyan(FRAMES[1])} Connecting to daemon`);

      // Advance second interval (80ms)
      vi.advanceTimersByTime(80);
      expect(stderrChunks[2]).toBe(`\r\x1b[2K${chalk.cyan(FRAMES[2])} Connecting to daemon`);

      spinner.succeed();
    });

    it("succeed clears the animation interval and writes final success line", () => {
      const spinner = startSpinner("Syncing state");
      vi.advanceTimersByTime(160);

      spinner.succeed("State synced");

      const expectedFinal = `\r\x1b[2K${chalk.green("✔")} State synced\n`;
      expect(stderrChunks[stderrChunks.length - 1]).toBe(expectedFinal);

      // Verify interval timer was stopped: advancing time should produce no further writes
      const countBefore = stderrChunks.length;
      vi.advanceTimersByTime(400);
      expect(stderrChunks.length).toBe(countBefore);
    });

    it("fail clears the animation interval and writes final failure line", () => {
      const spinner = startSpinner("Deploying stack");
      vi.advanceTimersByTime(80);

      spinner.fail("Deployment aborted");

      const expectedFinal = `\r\x1b[2K${chalk.red("✖")} Deployment aborted\n`;
      expect(stderrChunks[stderrChunks.length - 1]).toBe(expectedFinal);

      const countBefore = stderrChunks.length;
      vi.advanceTimersByTime(400);
      expect(stderrChunks.length).toBe(countBefore);
    });

    it("warn clears the animation interval and writes final warning line", () => {
      const spinner = startSpinner("Scanning dependencies");
      vi.advanceTimersByTime(80);

      spinner.warn("Outdated dependencies found");

      const expectedFinal = `\r\x1b[2K${chalk.yellow("⚠")} Outdated dependencies found\n`;
      expect(stderrChunks[stderrChunks.length - 1]).toBe(expectedFinal);

      const countBefore = stderrChunks.length;
      vi.advanceTimersByTime(400);
      expect(stderrChunks.length).toBe(countBefore);
    });

    it("preserves updated text during subsequent animation frames and final output", () => {
      const spinner = startSpinner("Starting task");
      vi.advanceTimersByTime(80);

      spinner.text = "Continuing task";
      expect(spinner.text).toBe("Continuing task");

      // Next tick renders with the updated text
      vi.advanceTimersByTime(80);
      expect(stderrChunks[stderrChunks.length - 1]).toBe(
        `\r\x1b[2K${chalk.cyan(FRAMES[2])} Continuing task`,
      );

      spinner.succeed();
      expect(stderrChunks[stderrChunks.length - 1]).toBe(
        `\r\x1b[2K${chalk.green("✔")} Continuing task\n`,
      );
    });
  });

  describe("isolation and cleanup", () => {
    it("preserves write calls independently per test without leaking", () => {
      expect(stderrChunks).toHaveLength(0);
      const spinner = startSpinner("Clean run");
      spinner.succeed();
      expect(stderrChunks.length).toBeGreaterThan(0);
    });

    it("does not leak previous test chunks into subsequent test runs", () => {
      expect(stderrChunks).toHaveLength(0);
    });

    it("restores original isTTY descriptor after modification", () => {
      setStderrIsTTY(false);
      expect(process.stderr.isTTY).toBe(false);
      restoreStderrIsTTY();
      expect(process.stderr.isTTY).toBe(originalDescriptor?.value ?? undefined);
    });
  });
});
