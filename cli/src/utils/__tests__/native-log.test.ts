// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import { appendNativeLogLine, NATIVE_LOG_MAX_BYTES, readLogTail } from "../native-log.js";
import { nativeLogPath, readNativeLogLines } from "../native-runtime.js";

const stamp = (index: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, index)).toISOString();

/** A log of `count` timestamped lines, `line <i>`, the format the supervisor writes. */
function writeLog(path: string, count: number, eol = "\n", trailing = true): void {
  const lines = Array.from({ length: count }, (_, i) => `${stamp(i)} line ${i}`);
  writeFileSync(path, lines.join(eol) + (trailing ? eol : ""));
}

describe("readLogTail (#3720)", () => {
  it("returns the last N lines of a multi-megabyte log, oldest first", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    writeLog(path, 200_000); // about 7 MB, many 64 KB blocks
    expect(statSync(path).size).toBeGreaterThan(5_000_000);

    expect(readLogTail(path, 3)).toEqual([
      `${stamp(199_997)} line 199997`,
      `${stamp(199_998)} line 199998`,
      `${stamp(199_999)} line 199999`,
    ]);
  });

  it("returns every line when the file has fewer than N", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    writeLog(path, 4);
    expect(readLogTail(path, 10)).toHaveLength(4);
  });

  it("reads a last line with no trailing newline, and strips CRLF", () => {
    const dir = createTempDir("flisk-log-");
    const bare = join(dir, "bare.log");
    writeLog(bare, 5, "\n", false);
    expect(readLogTail(bare, 2)).toEqual([`${stamp(3)} line 3`, `${stamp(4)} line 4`]);

    const crlf = join(dir, "crlf.log");
    writeLog(crlf, 5, "\r\n");
    expect(readLogTail(crlf, 2)).toEqual([`${stamp(3)} line 3`, `${stamp(4)} line 4`]);
  });

  it("keeps a multi-byte character that straddles a block boundary intact", () => {
    const path = join(createTempDir("flisk-log-"), "utf8.log");
    const text = "é".repeat(70_000); // 140 KB of two-byte characters on one line
    writeFileSync(path, `${stamp(0)} ${text}\n${stamp(1)} after\n`);
    expect(readLogTail(path, 2)).toEqual([`${stamp(0)} ${text}`, `${stamp(1)} after`]);
  });

  it("stops at the first line older than the cutoff", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    writeLog(path, 100);
    const lines = readLogTail(path, 1000, Date.parse(stamp(95)));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe(`${stamp(95)} line 95`);
  });

  it("returns nothing for an empty file", () => {
    const path = join(createTempDir("flisk-log-"), "empty.log");
    writeFileSync(path, "");
    expect(readLogTail(path, 5)).toEqual([]);
  });
});

describe("readNativeLogLines (#3720)", () => {
  it("returns the last N lines of a large log and never reads the rotated file", () => {
    const root = createTempDir("flisk-native-");
    const logPath = nativeLogPath(root, "api");
    mkdirSync(join(root, ".flisk", "native", "logs"), { recursive: true });
    writeLog(logPath, 100_000);
    writeFileSync(`${logPath}.1`, `${stamp(500_000)} from the rotated file\n`);

    const lines = readNativeLogLines(root, ["api"], { tail: 2 });

    expect(lines.map((line) => line.text)).toEqual(["line 99998", "line 99999"]);
  });
});

describe("appendNativeLogLine (#3720)", () => {
  it("defaults the cap to 10 MB per service", () => {
    expect(NATIVE_LOG_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it("rotates to <service>.log.1 once the log reaches the cap, keeping one old file", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    const sizes = new Map<string, number>();
    for (let i = 0; i < 10; i += 1) appendNativeLogLine(path, `line ${i}\n`, sizes, 30);

    // Each line is 7 bytes, so every 5 lines (35 bytes) pass the 30-byte cap and rotate. The second rotation replaces
    // the first .1, so only the newest old file is kept.
    expect(readFileSync(`${path}.1`, "utf-8")).toBe("line 5\nline 6\nline 7\nline 8\nline 9\n");
    expect(existsSync(`${path}.2`)).toBe(false);
    // The current log starts again with the next line.
    expect(existsSync(path)).toBe(false);
    appendNativeLogLine(path, "next\n", sizes, 30);
    expect(readFileSync(path, "utf-8")).toBe("next\n");
  });

  it("does not rotate below the cap", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    const sizes = new Map<string, number>();
    for (let i = 0; i < 3; i += 1) appendNativeLogLine(path, `line ${i}\n`, sizes, 1000);
    expect(readFileSync(path, "utf-8")).toBe("line 0\nline 1\nline 2\n");
    expect(existsSync(`${path}.1`)).toBe(false);
  });

  it("rotates a log a previous run left above the cap before the first new line", () => {
    const path = join(createTempDir("flisk-log-"), "api.log");
    writeFileSync(path, "x".repeat(100));
    appendNativeLogLine(path, "fresh\n", new Map(), 50);
    expect(readFileSync(path, "utf-8")).toBe("fresh\n");
    expect(readFileSync(`${path}.1`, "utf-8")).toBe("x".repeat(100));
  });
});
