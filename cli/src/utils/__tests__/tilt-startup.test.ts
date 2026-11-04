// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { STANDARD_PORTS } from "../constants.js";
import { getTiltPollingPort, parseTiltPort } from "../tilt-startup.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseTiltPort", () => {
  it.each([undefined, ""])("treats %j as unset and returns port undefined", (value) => {
    expect(parseTiltPort(value)).toEqual({ ok: true, port: undefined });
  });

  it.each([
    ["1", 1],
    ["80", 80],
    ["10350", 10350],
    ["65535", 65535],
    ["00123", 123],
  ])("accepts valid port string %j and returns parsed number %d", (input, expected) => {
    const result = parseTiltPort(input);
    expect(result).toEqual({ ok: true, port: expected });
    if (result.ok) {
      expect(typeof result.port).toBe("number");
    }
  });

  it.each([
    "abc",
    "port123",
    "123port",
    "10350.5",
    "1e3",
    "0x10",
    " 10350",
    "10350 ",
    " 10350 ",
    "10350\n",
  ])("rejects non-numeric string %j with an error message", (value) => {
    expect(parseTiltPort(value)).toEqual({
      ok: false,
      message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
    });
  });

  it.each(["0", "-1", "-10350", "65536", "70000", "99999", "9007199254740993"])(
    "rejects out-of-range port %j with an error message",
    (value) => {
      expect(parseTiltPort(value)).toEqual({
        ok: false,
        message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
      });
    },
  );
});

describe("getTiltPollingPort", () => {
  it.each([
    ["1", 1],
    ["80", 80],
    ["10350", 10350],
    ["10444", 10444],
    ["65535", 65535],
  ])("returns the parsed port for valid input %j", (input, expected) => {
    expect(getTiltPollingPort(input)).toBe(expected);
  });

  it("verifies the expected default matches STANDARD_PORTS.tiltUi", () => {
    expect(getTiltPollingPort(undefined)).toBe(STANDARD_PORTS.tiltUi);
    expect(STANDARD_PORTS.tiltUi).toBe(10350);
  });

  it.each([undefined, "", " ", "abc", "10350.5", "0", "-1", "65536", "70000", "99999"])(
    "falls back to the expected default for %j",
    (value) => {
      expect(getTiltPollingPort(value)).toBe(STANDARD_PORTS.tiltUi);
    },
  );
});
