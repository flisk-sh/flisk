// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  createMachineEnvelope,
  isMachineOutputEnvelope,
  type MachineOutputEnvelope,
  SCHEMA_VERSION,
} from "../machine-output.js";

describe("isMachineOutputEnvelope", () => {
  it("accepts a valid schemaVersion/data/errors envelope", () => {
    const envelope: MachineOutputEnvelope = createMachineEnvelope({ ok: true }, [
      { code: "HINT", message: "optional" },
    ]);
    expect(isMachineOutputEnvelope(envelope)).toBe(true);
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("accepts null data and empty errors", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: null, errors: [] })).toBe(true);
  });

  it("rejects an unsupported numeric schemaVersion", () => {
    expect(isMachineOutputEnvelope({ schemaVersion: 2, data: null, errors: [] })).toBe(false);
  });

  it("rejects envelopes missing required fields or with wrong types", () => {
    expect(isMachineOutputEnvelope(null)).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: 1, data: null })).toBe(false);
    expect(isMachineOutputEnvelope({ schemaVersion: "1", data: null, errors: [] })).toBe(false);
    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: 1, message: "bad" }],
      }),
    ).toBe(false);
    expect(
      isMachineOutputEnvelope({
        schemaVersion: 1,
        data: null,
        errors: [{ code: "X", message: "ok", suggestions: [1] }],
      }),
    ).toBe(false);
  });
});
