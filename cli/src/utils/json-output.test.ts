// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJsonEmitter } from "./json-output.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, default: actual, writeSync: vi.fn(actual.writeSync) };
});

function readWrites() {
  return vi.mocked(writeSync).mock.calls.map((call) => call[1] as string);
}

describe("createJsonEmitter", () => {
  afterEach(() => {
    vi.mocked(writeSync).mockClear();
    process.removeAllListeners("exit");
  });

  it("writes a single schemaVersion envelope with the given data", () => {
    const emit = createJsonEmitter("UP_FAILED", "tdk up");
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
    const emit = createJsonEmitter("UP_FAILED", "tdk up");
    emit({ ok: false }, [{ code: "E1", message: "boom" }]);

    const writes = readWrites();
    expect(JSON.parse(writes[0]).errors).toEqual([{ code: "E1", message: "boom" }]);
  });

  it("only emits once even if called multiple times", () => {
    const emit = createJsonEmitter("UP_FAILED", "tdk up");
    emit({ first: true });
    emit({ second: true });

    expect(readWrites()).toHaveLength(1);
    expect(JSON.parse(readWrites()[0]).data).toEqual({ first: true });
  });

  it("emits a failure envelope on process exit if nothing was emitted yet", () => {
    createJsonEmitter("UP_FAILED", "tdk up");
    process.emit("exit", 1);

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
    createJsonEmitter("UP_FAILED", "tdk up");
    process.emit("exit", 0);

    const parsed = JSON.parse(readWrites()[0]);
    expect(parsed.errors[0].message).toBe("tdk up exited before reporting a result");
  });

  it("does not emit on process exit after a result was already written", () => {
    const emit = createJsonEmitter("UP_FAILED", "tdk up");
    emit({ ok: true });
    process.emit("exit", 0);

    expect(readWrites()).toHaveLength(1);
  });
});
