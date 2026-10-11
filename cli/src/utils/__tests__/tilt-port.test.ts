// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getTiltPollingPort } from "../tilt-startup.js";

describe("getTiltPollingPort", () => {
  it.each(["1", "10350", "12345", "65535", "00123"])("accepts port %s", (value) => {
    expect(getTiltPollingPort(value)).toBe(Number(value));
  });

  it.each([
    undefined,
    "",
    " ",
    " 12345 ",
    "12345\n",
    "12345abc",
    "10350.5",
    "12345.0",
    "0",
    "-1",
    "65536",
    "9007199254740993",
    "Infinity",
    "NaN",
    "1e3",
    "0x50",
    "+12345",
  ])("falls back to 10350 for %s", (value) => {
    expect(getTiltPollingPort(value)).toBe(10350);
  });
});
