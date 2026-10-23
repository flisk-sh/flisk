// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { TdkError } from "./errors.js";

export const SCHEMA_VERSION = 1 as const;

export interface MachineError {
  code: string;
  message: string;
  suggestions?: string[];
}

export interface MachineEnvelope<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  data: T | null;
  errors: MachineError[];
}

/** JSON envelope shape emitted by CLI `--json` commands (`schemaVersion`, `data`, `errors`). */
export type MachineOutputEnvelope = MachineEnvelope<unknown>;

export function createMachineEnvelope<T>(
  data: T | null,
  errors: MachineError[] = [],
): MachineEnvelope<T> {
  return { schemaVersion: SCHEMA_VERSION, data, errors };
}

function isMachineError(value: unknown): value is MachineError {
  if (typeof value !== "object" || value === null) return false;
  const error = value as Record<string, unknown>;
  if (typeof error.code !== "string" || typeof error.message !== "string") return false;
  if (error.suggestions !== undefined) {
    if (!Array.isArray(error.suggestions)) return false;
    if (!error.suggestions.every((item) => typeof item === "string")) return false;
  }
  return true;
}

/** Narrows unknown JSON to the machine-output envelope used by CLI `--json` commands. */
export function isMachineOutputEnvelope(value: unknown): value is MachineOutputEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.schemaVersion !== SCHEMA_VERSION) return false;
  if (!("data" in envelope)) return false;
  if (!Array.isArray(envelope.errors)) return false;
  return envelope.errors.every(isMachineError);
}

export function toMachineError(error: unknown): { error: MachineError; exitCode: number } {
  if (error instanceof TdkError) {
    return {
      error: {
        code: "COMMAND_FAILED",
        message: error.message,
        ...(error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}),
      },
      exitCode: error.exitCode,
    };
  }
  return {
    error: {
      code: "INTERNAL",
      message: error instanceof Error ? error.message : String(error),
    },
    exitCode: 2,
  };
}

/** Keep machine stdout parseable when a command fails before it has data to return. */
export function writeMachineError(error: unknown): never {
  const result = toMachineError(error);
  console.log(JSON.stringify(createMachineEnvelope(null, [result.error])));
  console.error(result.error.message);
  process.exit(result.exitCode);
}
