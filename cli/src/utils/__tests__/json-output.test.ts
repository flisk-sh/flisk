// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const written: string[] = [];
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  writeSync: vi.fn((_fd: number, text: string) => {
    written.push(text);
    return text.length;
  }),
}));

import { createJsonEmitter } from "../json-output.js";
import { forgetShownError, rememberShownError } from "../last-error.js";

describe("createJsonEmitter exit fallback", () => {
  let exitHandler: ((code: number) => void) | undefined;

  beforeEach(() => {
    written.length = 0;
    forgetShownError();
    exitHandler = undefined;
    vi.spyOn(process, "once").mockImplementation(((
      event: string,
      handler: (code: number) => void,
    ) => {
      if (event === "exit") exitHandler = handler;
      return process;
    }) as typeof process.once);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lastEnvelope() {
    return JSON.parse(written[written.length - 1] as string);
  }

  it("carries the error the command printed, with its suggestions", () => {
    createJsonEmitter("UP_FAILED", "flisk up");
    rememberShownError({
      message: "Could not find project root (no .flisk/project.json found)",
      suggestions: ["Run `flisk project --yes` to initialize a new project"],
    });
    exitHandler?.(1);
    expect(lastEnvelope().errors).toEqual([
      {
        code: "UP_FAILED",
        message: "Could not find project root (no .flisk/project.json found)",
        suggestions: ["Run `flisk project --yes` to initialize a new project"],
      },
    ]);
  });

  it("falls back to the exit code when nothing was printed", () => {
    createJsonEmitter("UP_FAILED", "flisk up");
    exitHandler?.(2);
    expect(lastEnvelope().errors).toEqual([
      { code: "UP_FAILED", message: "flisk up exited with code 2" },
    ]);
  });

  it("says so when the process exits cleanly before a result", () => {
    createJsonEmitter("UP_FAILED", "flisk up");
    exitHandler?.(0);
    expect(lastEnvelope().errors[0].message).toBe("flisk up exited before reporting a result");
  });

  it("writes nothing extra when a result was already emitted", () => {
    const emit = createJsonEmitter("UP_FAILED", "flisk up");
    emit({ ok: true });
    exitHandler?.(1);
    expect(written).toHaveLength(1);
    expect(lastEnvelope().data).toEqual({ ok: true });
  });
});
