// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readlineMocks = vi.hoisted(() => ({
  question: vi.fn<() => Promise<string>>(),
  once: vi.fn(),
  close: vi.fn(),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: () => readlineMocks,
}));

import { promptConfirm, promptMultiSelect, promptSelect, promptText } from "../prompt.js";

const choices = [
  { title: "First", value: "first" as const, selected: true },
  { title: "Second", value: "second" as const },
  { title: "Third", value: "third" as const, selected: true },
];

describe("prompt utilities", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    readlineMocks.question.mockReset();
    readlineMocks.once.mockReset();
    readlineMocks.close.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("promptText", () => {
    it("returns trimmed user input", async () => {
      readlineMocks.question.mockResolvedValueOnce("  my-app  ");

      const result = await promptText({ message: "App name:" });

      expect(result).toBe("my-app");
    });

    it("uses initial value when user input is empty", async () => {
      readlineMocks.question.mockResolvedValueOnce("");

      const result = await promptText({
        message: "App name:",
        initial: "default-app",
      });

      expect(result).toBe("default-app");
    });

    it("returns empty string when no answer and no initial value provided", async () => {
      readlineMocks.question.mockResolvedValueOnce("");

      const result = await promptText({ message: "Optional title:" });

      expect(result).toBe("");
    });

    it("re-prompts when validate callback returns an error string", async () => {
      readlineMocks.question.mockResolvedValueOnce("bad").mockResolvedValueOnce("valid-service");

      const result = await promptText({
        message: "Service name:",
        validate: (input) => (input === "valid-service" ? true : "Invalid service name"),
      });

      expect(result).toBe("valid-service");
      expect(logs).toContain("Invalid service name");
    });
  });

  describe("promptConfirm", () => {
    it("returns true by default when initial is omitted and answer is empty", async () => {
      readlineMocks.question.mockResolvedValueOnce("");

      const result = await promptConfirm({ message: "Confirm operation?" });

      expect(result).toBe(true);
    });

    it("returns false when initial is false and answer is empty", async () => {
      readlineMocks.question.mockResolvedValueOnce("");

      const result = await promptConfirm({
        message: "Confirm deletion?",
        initial: false,
      });

      expect(result).toBe(false);
    });

    it("accepts y and yes case-insensitively", async () => {
      readlineMocks.question.mockResolvedValueOnce("y");
      expect(await promptConfirm({ message: "Proceed?" })).toBe(true);

      readlineMocks.question.mockResolvedValueOnce("YES");
      expect(await promptConfirm({ message: "Proceed?" })).toBe(true);
    });

    it("accepts n and no case-insensitively", async () => {
      readlineMocks.question.mockResolvedValueOnce("n");
      expect(await promptConfirm({ message: "Proceed?" })).toBe(false);

      readlineMocks.question.mockResolvedValueOnce("NO");
      expect(await promptConfirm({ message: "Proceed?" })).toBe(false);
    });

    it("re-prompts on unaccepted input until a valid answer is given", async () => {
      readlineMocks.question.mockResolvedValueOnce("maybe").mockResolvedValueOnce("y");

      const result = await promptConfirm({ message: "Proceed?" });

      expect(result).toBe(true);
      expect(logs).toContain("Please answer yes or no.");
    });
  });

  describe("promptSelect", () => {
    it("prints choices and returns selected value for valid choice number", async () => {
      readlineMocks.question.mockResolvedValueOnce("2");

      const result = await promptSelect({
        message: "Pick one framework:",
        choices: [
          { title: "React", value: "react" },
          { title: "Vue", value: "vue" },
        ],
      });

      expect(result).toBe("vue");
      expect(logs).toContain("Pick one framework:");
      expect(logs).toContain("  1. React");
      expect(logs).toContain("  2. Vue");
    });

    it("re-prompts when input is out of bounds or not a number", async () => {
      readlineMocks.question
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce("99")
        .mockResolvedValueOnce("abc")
        .mockResolvedValueOnce("1");

      const result = await promptSelect({
        message: "Choose an option:",
        choices: [
          { title: "Option A", value: "a" },
          { title: "Option B", value: "b" },
        ],
      });

      expect(result).toBe("a");
      expect(logs).toContain("Enter a number from 1 to 2.");
    });
  });

  describe("promptMultiSelect", () => {
    it("re-prompts when an out-of-range choice number is entered", async () => {
      readlineMocks.question.mockResolvedValueOnce("9").mockResolvedValueOnce("1,3");

      const result = await promptMultiSelect({
        message: "Select items:",
        choices,
      });

      expect(result).toEqual(["first", "third"]);
      expect(readlineMocks.question).toHaveBeenCalledTimes(2);
      expect(logs).toContain('"9" is not a valid choice (1-3)');
    });

    it("re-prompts when a non-numeric choice value is entered", async () => {
      readlineMocks.question.mockResolvedValueOnce("abc").mockResolvedValueOnce("2");

      const result = await promptMultiSelect({
        message: "Select items:",
        choices,
      });

      expect(result).toEqual(["second"]);
      expect(readlineMocks.question).toHaveBeenCalledTimes(2);
      expect(logs).toContain('"abc" is not a valid choice (1-3)');
    });

    it("re-prompts when a comma-separated list includes an invalid choice", async () => {
      readlineMocks.question.mockResolvedValueOnce("1, 9").mockResolvedValueOnce("1, 3");

      const result = await promptMultiSelect({
        message: "Select items:",
        choices,
      });

      expect(result).toEqual(["first", "third"]);
      expect(readlineMocks.question).toHaveBeenCalledTimes(2);
      expect(logs).toContain('"9" is not a valid choice (1-3)');
    });

    it("returns default selections when the answer is empty", async () => {
      readlineMocks.question.mockResolvedValueOnce("");

      const result = await promptMultiSelect({
        message: "Select items:",
        choices,
      });

      expect(result).toEqual(["first", "third"]);
      expect(readlineMocks.question).toHaveBeenCalledTimes(1);
    });

    it("re-prompts when custom validate callback rejects the selection", async () => {
      readlineMocks.question.mockResolvedValueOnce("1").mockResolvedValueOnce("1, 2");

      const result = await promptMultiSelect({
        message: "Select at least two:",
        choices,
        validate: (selected) => (selected.length >= 2 ? true : "Must select at least two items"),
      });

      expect(result).toEqual(["first", "second"]);
      expect(logs).toContain("Must select at least two items");
    });
  });

  describe("closed stdin handling", () => {
    it("rejects when readline interface emits close before an answer", async () => {
      readlineMocks.once.mockImplementation((event: string, callback: () => void) => {
        if (event === "close") {
          callback();
        }
      });
      readlineMocks.question.mockImplementation(() => new Promise(() => {}));

      await expect(promptText({ message: "Name:" })).rejects.toThrow(
        "No input available to answer the prompt. Run this in a terminal.",
      );
    });
  });
});
