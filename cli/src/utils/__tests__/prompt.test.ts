// Copyright (c) 2026 TDK Landscape contributors
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

import { promptMultiSelect } from "../prompt.js";

const choices = [
  { title: "First", value: "first" as const, selected: true },
  { title: "Second", value: "second" as const },
  { title: "Third", value: "third" as const, selected: true },
];

describe("promptMultiSelect", () => {
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
});
