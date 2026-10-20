// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import {
  isTiltConnectionFailure,
  isValidPort,
  isValidSince,
  isValidTail,
  parseTiltLogLines,
} from "../tilt-logs.js";

const line = (message: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    time: "t",
    resource: "api",
    level: "info",
    source: "runtime",
    message,
    ...extra,
  });

describe("parseTiltLogLines", () => {
  it("normalizes Tilt JSON Lines", () => {
    expect(parseTiltLogLines(line("hello"), 10)).toEqual([
      { time: "t", resource: "api", level: "info", source: "runtime", text: "hello" },
    ]);
  });
  it("keeps only the last `limit` lines", () => {
    const out = ["a", "b", "c"].map((m) => line(m)).join("\n");
    expect(parseTiltLogLines(out, 2).map((l) => l.text)).toEqual(["b", "c"]);
  });
  it("skips blank and non-JSON lines and tolerates missing fields", () => {
    const out = `notice\n\n${JSON.stringify({ message: "x" })}\n`;
    expect(parseTiltLogLines(out, 5)).toEqual([
      { time: null, resource: null, level: null, source: null, text: "x" },
    ]);
  });
  it("handles non-string message and fields appropriately", () => {
    const out = JSON.stringify({
      time: 12345,
      resource: "",
      level: null,
      source: false,
      message: 999,
    });
    expect(parseTiltLogLines(out, 5)).toEqual([
      { time: null, resource: null, level: null, source: null, text: "" },
    ]);
  });
  it("returns empty array for empty or whitespace-only input", () => {
    expect(parseTiltLogLines("", 10)).toEqual([]);
    expect(parseTiltLogLines("   \n\n\t  \n  ", 10)).toEqual([]);
  });
  it("returns all lines when limit exceeds line count and respects smaller limit", () => {
    const out = [line("1"), line("2")].join("\n");
    expect(parseTiltLogLines(out, 10)).toHaveLength(2);
    expect(parseTiltLogLines(out, 1)).toEqual([
      { time: "t", resource: "api", level: "info", source: "runtime", text: "2" },
    ]);
  });
});

describe("option validation", () => {
  it("accepts Go-style durations only", () => {
    for (const ok of [
      "30s",
      "5m",
      "1h",
      "1h30m",
      "250ms",
      "100us",
      "500µs",
      "1000ns",
      "1.5s",
      "0.5m",
      "2.5h",
    ]) {
      expect(isValidSince(ok)).toBe(true);
    }
    for (const bad of ["", "5", "m", "5 minutes", "-1s", "10 s", "1.2.3s", "foo", "1h -30m"]) {
      expect(isValidSince(bad)).toBe(false);
    }
  });
  it("rejects durations beyond Go's int64 range", () => {
    expect(isValidSince("999999999999999999999h")).toBe(false);
    expect(isValidSince("2562047h")).toBe(true);
    expect(isValidSince("2562048h")).toBe(false);
  });
  it("accepts ports 1-65535 only", () => {
    for (const ok of ["1", "10350", "65535"]) expect(isValidPort(ok)).toBe(true);
    for (const bad of ["0", "65536", "99999", "100000", "abc", ""])
      expect(isValidPort(bad)).toBe(false);
  });
  it("accepts positive integer tails only", () => {
    expect(isValidTail("200")).toBe(true);
    for (const bad of ["0", "-1", "1.5", "10x", "", "10001", "9007199254740991"]) {
      expect(isValidTail(bad)).toBe(false);
    }
    expect(isValidTail("10000")).toBe(true);
  });
});

describe("isTiltConnectionFailure", () => {
  it("separates a missing server from rejected arguments", () => {
    expect(
      isTiltConnectionFailure(
        "Error: fetching websocket token: dial tcp [::1]:10398: connect: connection refused",
      ),
    ).toBe(true);
    expect(isTiltConnectionFailure('Error: invalid argument "5x" for "--since" flag')).toBe(false);
  });

  it("identifies various Tilt connection failure signals", () => {
    expect(isTiltConnectionFailure("dial tcp 127.0.0.1:10350: connect: connection refused")).toBe(
      true,
    );
    expect(isTiltConnectionFailure("connecting to Tilt server failed")).toBe(true);
    expect(isTiltConnectionFailure("dial tcp: lookup tilt.internal: no such host")).toBe(true);
    expect(isTiltConnectionFailure("failed reading websocket_token")).toBe(true);
    expect(isTiltConnectionFailure("CONNECTION REFUSED")).toBe(true);
  });

  it("returns false for unrelated Tilt stderr output", () => {
    expect(isTiltConnectionFailure("tilt: unrecognized command 'foo'")).toBe(false);
    expect(isTiltConnectionFailure("permission denied: unable to open /var/log/tilt.log")).toBe(
      false,
    );
    expect(isTiltConnectionFailure("context deadline exceeded")).toBe(false);
  });
});
