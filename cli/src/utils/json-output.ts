// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { writeSync } from "node:fs";
import { createMachineEnvelope, type MachineError } from "./machine-output.js";

export type JsonError = MachineError;

export type JsonEmitter = (data: Record<string, unknown>, errors?: JsonError[]) => void;

/**
 * Returns an emitter that writes at most one `{schemaVersion, data, errors}` object to stdout. If the process
 * exits before anything was emitted (a preflight `process.exit`, Tilt ending early), a failure object is written
 * so a JSON consumer never sees an empty stdout. Uses writeSync because `process.exit` does not flush async writes.
 */
export function createJsonEmitter(failureCode: string, command: string): JsonEmitter {
  let emitted = false;
  const emit: JsonEmitter = (data, errors = []) => {
    if (emitted) return;
    emitted = true;
    writeSync(1, `${JSON.stringify(createMachineEnvelope(data, errors))}\n`);
  };
  process.once("exit", (code) => {
    emit({ ok: false }, [
      {
        code: failureCode,
        message:
          code === 0
            ? `${command} exited before reporting a result`
            : `${command} exited with code ${code}`,
      },
    ]);
  });
  return emit;
}
