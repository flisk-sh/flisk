// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import type { PathLike } from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalCheckoutPath, getCheckoutId } from "../checkout-id.js";

/**
 * First-time creation of `.flisk/.project-id` must be exclusive, so two processes that start the same
 * checkout while the file is missing agree on one id. The race is deterministic here: the fs mock hides
 * the record once (the file looks missing to the first read), and the exclusive write then hits the record
 * that really is on disk — exactly the state a concurrent process leaves behind.
 */
const race = vi.hoisted(() => ({ hideRecordOnce: false, emptyRecordReads: 0 }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (path: PathLike) => {
      if (race.hideRecordOnce && String(path).replace(/\\/g, "/").endsWith("/.flisk/.project-id")) {
        race.hideRecordOnce = false;
        return false;
      }
      return actual.existsSync(path);
    },
    readFileSync: ((path: PathLike, ...rest: unknown[]) => {
      if (
        race.emptyRecordReads > 0 &&
        String(path).replace(/\\/g, "/").endsWith("/.flisk/.project-id")
      ) {
        race.emptyRecordReads -= 1;
        return "";
      }
      return (actual.readFileSync as unknown as (...args: unknown[]) => string)(path, ...rest);
    }) as typeof actual.readFileSync,
  };
});

const tempDirs: string[] = [];

function makeTempDir(prefix = "flisk-checkout-race-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  race.hideRecordOnce = false;
  race.emptyRecordReads = 0;
});

describe("checkout-id first-time creation", () => {
  it("adopts the id another process stored when the race is lost", () => {
    const root = makeTempDir();
    const winner = { id: "1a2b3c4d", path: canonicalCheckoutPath(root) };
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(join(root, ".flisk", ".project-id"), `${JSON.stringify(winner)}\n`, "utf-8");

    // The initial read misses the record (a concurrent process just created it); the exclusive write finds it.
    race.hideRecordOnce = true;
    expect(getCheckoutId(root)).toBe("1a2b3c4d");
    // The winner's record is what stays on disk.
    expect(JSON.parse(readFileSync(join(root, ".flisk", ".project-id"), "utf-8"))).toEqual(winner);
  });

  it("regenerates over a record for another path that appears while creating", () => {
    const root = makeTempDir();
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(
      join(root, ".flisk", ".project-id"),
      `${JSON.stringify({ id: "feedface", path: "/somewhere/else" })}\n`,
      "utf-8",
    );

    race.hideRecordOnce = true;
    const id = getCheckoutId(root);

    // The foreign-path record does not win: this checkout gets its own id, recorded for its own path.
    expect(id).toMatch(/^[0-9a-f]{8}$/);
    expect(id).not.toBe("feedface");
    expect(JSON.parse(readFileSync(join(root, ".flisk", ".project-id"), "utf-8"))).toEqual({
      id,
      path: canonicalCheckoutPath(root),
    });
  });

  it("adopts the winner's id when its record is still being written", () => {
    const root = makeTempDir();
    const winner = { id: "c0ffee42", path: canonicalCheckoutPath(root) };
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(join(root, ".flisk", ".project-id"), `${JSON.stringify(winner)}\n`, "utf-8");

    // The losing process finds the record missing (the winner just created it), then reads it empty once
    // (the winner's write has not landed). The bounded re-read must wait for the finished record, not
    // overwrite it with a second id.
    race.hideRecordOnce = true;
    race.emptyRecordReads = 1;
    expect(getCheckoutId(root)).toBe("c0ffee42");
    expect(JSON.parse(readFileSync(join(root, ".flisk", ".project-id"), "utf-8"))).toEqual(winner);
  });

  it("never overwrites a record that stays unreadable, and falls back", () => {
    const root = makeTempDir();
    const winner = { id: "deadbeef", path: canonicalCheckoutPath(root) };
    mkdirSync(join(root, ".flisk"), { recursive: true });
    writeFileSync(join(root, ".flisk", ".project-id"), `${JSON.stringify(winner)}\n`, "utf-8");

    // The record exists but never becomes readable within the bounded spin: the winner owns it, so the
    // loser returns the deterministic fallback and leaves the file exactly as the winner left it.
    race.hideRecordOnce = true;
    race.emptyRecordReads = Number.MAX_SAFE_INTEGER;
    const id = getCheckoutId(root);
    expect(id).not.toBe("deadbeef");
    race.emptyRecordReads = 0;
    expect(JSON.parse(readFileSync(join(root, ".flisk", ".project-id"), "utf-8"))).toEqual(winner);
  });
});

describe("checkout record ignore entry", () => {
  it("adds the .flisk/.project-id entry when the checkout is inside a git work tree", () => {
    const root = makeTempDir();
    execFileSync("git", ["init", "."], { cwd: root, stdio: "ignore" });

    const id = getCheckoutId(root);

    expect(existsSync(join(root, ".flisk", ".project-id"))).toBe(true);
    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".flisk/.project-id");
    // Only the entry the record needs: the rest of the Flisk block stays project setup's to add.
    expect(gitignore).not.toContain(".env");

    // A repeated call adds nothing: the entry is already there.
    expect(getCheckoutId(root)).toBe(id);
    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe(gitignore);
  });

  it("writes no .gitignore outside a git working tree", () => {
    const root = makeTempDir();

    getCheckoutId(root);

    expect(existsSync(join(root, ".flisk", ".project-id"))).toBe(true);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });
});
