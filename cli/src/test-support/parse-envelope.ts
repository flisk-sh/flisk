// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { expect } from "vitest";

export interface Envelope {
  schemaVersion: number;
  // biome-ignore lint/suspicious/noExplicitAny: each command has its own data shape, tests narrow it themselves
  data: any;
  errors: Array<{ code: string; message: string }>;
}

/**
 * Asserts that `stdout` is exactly one line of JSON carrying `schemaVersion`, `data` and `errors`, and returns it.
 */
export function parseEnvelope(stdout: string): Envelope {
  const lines = stdout.trim().split(/\r?\n/);
  expect(lines, "stdout must be a single JSON line").toHaveLength(1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(lines[0] as string);
  } catch (error) {
    throw new Error(`stdout is not JSON: ${(error as Error).message}\n${stdout}`);
  }
  expect(parsed).toBeTypeOf("object");
  expect(parsed).not.toBeNull();
  expect(Object.keys(parsed as object).sort()).toEqual(["data", "errors", "schemaVersion"]);
  const envelope = parsed as Envelope;
  expect(envelope.schemaVersion).toBeTypeOf("number");
  expect(Array.isArray(envelope.errors)).toBe(true);
  return envelope;
}
