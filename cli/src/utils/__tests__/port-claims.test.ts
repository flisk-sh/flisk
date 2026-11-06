// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPortClaimer, defaultClaimDir, PORT_CLAIM_TTL_MS } from "../port-claims.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "flisk-claims-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createPortClaimer", () => {
  it("gives a port to the first project and refuses it to the second", () => {
    const a = createPortClaimer("/projects/a", { dir, pid: 100, isProcessAlive: () => true });
    const b = createPortClaimer("/projects/b", { dir, pid: 200, isProcessAlive: () => true });
    expect(a(10350)).toBe(true);
    expect(b(10350)).toBe(false);
    expect(b(10351)).toBe(true);
  });

  it("lets the same project claim its own port again", () => {
    const first = createPortClaimer("/projects/a", { dir, pid: 100, isProcessAlive: () => true });
    const second = createPortClaimer("/projects/a", { dir, pid: 101, isProcessAlive: () => true });
    expect(first(8080)).toBe(true);
    expect(second(8080)).toBe(true);
    expect(JSON.parse(readFileSync(path.join(dir, "8080.json"), "utf8")).pid).toBe(101);
  });

  it("takes over a claim whose process is gone", () => {
    const dead = createPortClaimer("/projects/a", { dir, pid: 100, isProcessAlive: () => true });
    expect(dead(8080)).toBe(true);
    const b = createPortClaimer("/projects/b", {
      dir,
      pid: 200,
      isProcessAlive: (pid) => pid !== 100,
    });
    expect(b(8080)).toBe(true);
    expect(JSON.parse(readFileSync(path.join(dir, "8080.json"), "utf8")).owner).toBe("/projects/b");
  });

  it("takes over a claim older than the time limit even when its process is alive", () => {
    let clock = 1_000_000;
    const a = createPortClaimer("/projects/a", {
      dir,
      pid: 100,
      now: () => clock,
      isProcessAlive: () => true,
    });
    const b = createPortClaimer("/projects/b", {
      dir,
      pid: 200,
      now: () => clock,
      isProcessAlive: () => true,
    });
    expect(a(15432)).toBe(true);
    clock += PORT_CLAIM_TTL_MS - 1;
    expect(b(15432)).toBe(false);
    clock += 2;
    expect(b(15432)).toBe(true);
  });

  it("treats an unreadable claim file as stale", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "8443.json"), "{not json");
    const a = createPortClaimer("/projects/a", { dir, isProcessAlive: () => true });
    expect(a(8443)).toBe(true);
  });

  it("falls back to allowing the port when the claim folder cannot be written", () => {
    const file = path.join(dir, "not-a-folder");
    writeFileSync(file, "x");
    const a = createPortClaimer("/projects/a", { dir: path.join(file, "claims") });
    expect(a(10350)).toBe(true);
  });

  it("keeps different ports independent", () => {
    const a = createPortClaimer("/projects/a", { dir, pid: 100, isProcessAlive: () => true });
    const b = createPortClaimer("/projects/b", { dir, pid: 200, isProcessAlive: () => true });
    expect(a(8080)).toBe(true);
    expect(b(8443)).toBe(true);
    expect(a(8443)).toBe(false);
  });

  it("uses a folder in the OS temp directory by default", () => {
    expect(defaultClaimDir().startsWith(tmpdir())).toBe(true);
  });
});
