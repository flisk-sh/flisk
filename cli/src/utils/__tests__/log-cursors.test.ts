// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { applyLogCursor, type CursorLine, isValidCursor } from "../log-cursors.js";

const line = (text: string, extra: Partial<CursorLine> = {}): CursorLine => ({
  time: null,
  resource: "api",
  level: null,
  source: null,
  text,
  ...extra,
});

describe("applyLogCursor", () => {
  it("keeps written sequence numbers and reports them in order", () => {
    const page = applyLogCursor([line("a", { seq: 7 }), line("b", { seq: 8 })]);
    expect(page.lines.map((l) => l.seq)).toEqual([7, 8]);
    expect(page.nextCursor).toBe(8);
    expect(page.truncated).toBe(false);
  });

  it("derives increasing, distinct numbers for lines in an unnumbered log", () => {
    const page = applyLogCursor([line("a"), line("b"), line("c")]);
    expect(page.lines.map((l) => l.seq).every((seq) => Number.isSafeInteger(seq) && seq > 0)).toBe(
      true,
    );
    expect(page.lines[0]?.seq).toBeLessThan(page.lines[1]?.seq as number);
    expect(page.lines[1]?.seq).toBeLessThan(page.lines[2]?.seq as number);
    expect(page.nextCursor).toBe(page.lines.at(-1)?.seq);
  });

  it("gives the same number to a line that stays in the log while older lines leave", () => {
    const t = (ms: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, ms)).toISOString();
    const before = applyLogCursor([
      line("gone", { time: t(0) }),
      line("kept", { time: t(1) }),
      line("last", { time: t(2) }),
    ]);
    const keptSeq = before.lines[1]?.seq;
    const lastSeq = before.lines[2]?.seq;
    const after = applyLogCursor([line("kept", { time: t(1) }), line("last", { time: t(2) })]);
    expect(after.lines.map((l) => l.seq)).toEqual([keptSeq, lastSeq]);
  });

  it("returns only newer lines when given a cursor", () => {
    const page = applyLogCursor([line("a", { seq: 5 }), line("b", { seq: 6 })], 5);
    expect(page.lines.map((l) => l.text)).toEqual(["b"]);
    expect(page.nextCursor).toBe(6);
  });

  it("returns nothing and keeps the cursor when no line arrived", () => {
    const page = applyLogCursor([line("a", { seq: 5 }), line("b", { seq: 6 })], 6);
    expect(page.lines).toEqual([]);
    expect(page.nextCursor).toBe(6);
    expect(page.truncated).toBe(false);
  });

  it("reports truncation when the cursor is older than the retained log", () => {
    const page = applyLogCursor([line("a", { seq: 20 }), line("b", { seq: 21 })], 4);
    expect(page.lines.map((l) => l.text)).toEqual(["a", "b"]);
    expect(page.truncated).toBe(true);
    expect(page.nextCursor).toBe(21);
  });

  it("does not report truncation when the cursor is the oldest retained line", () => {
    const page = applyLogCursor([line("a", { seq: 20 })], 20);
    expect(page.truncated).toBe(false);
  });

  it("keeps every derived number and cursor a safe integer for real ISO timestamps", () => {
    const page = applyLogCursor([
      line("a", { time: "2026-11-19T22:00:00.123Z" }),
      line("b", { time: "2026-11-19T22:00:00.123Z" }),
    ]);

    expect(page.lines.map((l) => l.seq).every((seq) => Number.isSafeInteger(seq))).toBe(true);
    expect(Number.isSafeInteger(page.nextCursor)).toBe(true);
    expect(isValidCursor(String(page.nextCursor))).toBe(true);
  });

  it("keeps the caller's cursor when it is ahead of every line", () => {
    const page = applyLogCursor([line("a", { seq: 2 })], 99);
    expect(page.lines).toEqual([]);
    expect(page.nextCursor).toBe(99);
  });

  it("never writes to the log or any generated file", () => {
    const lines = [line("a"), line("b")];
    expect(applyLogCursor(lines).nextCursor).toBeGreaterThan(0);
    expect(lines[0]).not.toHaveProperty("seq");
  });
});

describe("isValidCursor", () => {
  it("accepts non-negative integers only", () => {
    expect(isValidCursor("0")).toBe(true);
    expect(isValidCursor("1763500000000000")).toBe(true);
    for (const bad of ["-1", "1.5", "", "abc", " 1", "1e3", "9007199254740992"]) {
      expect(isValidCursor(bad)).toBe(false);
    }
  });
});
