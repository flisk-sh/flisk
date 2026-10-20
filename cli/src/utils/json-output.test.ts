// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJsonEmitter, type JsonEmitter } from "./json-output.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  // Pure mock: the emitter must not reach the real stdout/stderr while it is under test.
  const writeSyncMock = vi.fn();
  const mockedFs = { ...actual, default: actual, writeSync: writeSyncMock };
  return { ...mockedFs, default: mockedFs };
});

type ExitListener = (code: number) => void;

const emitterExitListeners = new Set<ExitListener>();

function readWrites(): string[] {
  return vi.mocked(writeSync).mock.calls.map((call) => call[1] as string);
}

/**
 * Creates a JSON emitter and captures the `exit` listener it registers.
 *
 * The emitter registers its handler with `process.once("exit", ...)`, so the handler is read back
 * from the process listener registry right after the call. Only that handler is tracked, which lets
 * the cleanup remove exactly what the emitter added instead of every `exit` listener in the process.
 */
function createTrackedEmitter(
  failureCode: string,
  command: string,
): { emit: JsonEmitter; exitListener: ExitListener } {
  const before = new Set(process.listeners("exit"));
  const emit = createJsonEmitter(failureCode, command);
  const added = process.listeners("exit").filter((listener) => !before.has(listener));
  if (added.length !== 1) {
    throw new Error(
      `createJsonEmitter registered ${added.length} "exit" listeners, expected exactly 1`,
    );
  }
  for (const listener of added) {
    emitterExitListeners.add(listener);
  }
  return { emit, exitListener: added[0] };
}

describe("createJsonEmitter", () => {
  afterEach(() => {
    vi.mocked(writeSync).mockClear();
    for (const listener of emitterExitListeners) {
      process.removeListener("exit", listener);
    }
    emitterExitListeners.clear();
  });

  it("writes a single schemaVersion envelope with the given data", () => {
    const { emit } = createTrackedEmitter("UP_FAILED", "tdk up");
    emit({ ok: true });

    const writes = readWrites();
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({
      schemaVersion: 1,
      data: { ok: true },
      errors: [],
    });
  });

  it("includes errors passed to the emitter", () => {
    const { emit } = createTrackedEmitter("UP_FAILED", "tdk up");
    emit({ ok: false }, [{ code: "E1", message: "boom" }]);

    const writes = readWrites();
    expect(JSON.parse(writes[0]).errors).toEqual([{ code: "E1", message: "boom" }]);
  });

  it("only emits once even if called multiple times", () => {
    const { emit } = createTrackedEmitter("UP_FAILED", "tdk up");
    emit({ first: true });
    emit({ second: true });

    expect(readWrites()).toHaveLength(1);
    expect(JSON.parse(readWrites()[0]).data).toEqual({ first: true });
  });

  it("emits a failure envelope on process exit if nothing was emitted yet", () => {
    const { exitListener } = createTrackedEmitter("UP_FAILED", "tdk up");
    exitListener(1);

    const writes = readWrites();
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]);
    expect(parsed.data).toEqual({ ok: false });
    expect(parsed.errors[0]).toEqual({
      code: "UP_FAILED",
      message: "tdk up exited with code 1",
    });
  });

  it("reports an early exit with code 0 distinctly from a normal exit", () => {
    const { exitListener } = createTrackedEmitter("UP_FAILED", "tdk up");
    exitListener(0);

    const parsed = JSON.parse(readWrites()[0]);
    expect(parsed.errors[0].message).toBe("tdk up exited before reporting a result");
  });

  it("does not emit on process exit after a result was already written", () => {
    const { emit, exitListener } = createTrackedEmitter("UP_FAILED", "tdk up");
    emit({ ok: true });
    exitListener(0);

    expect(readWrites()).toHaveLength(1);
  });
});
