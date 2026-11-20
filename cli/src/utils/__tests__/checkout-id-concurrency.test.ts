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
const race = vi.hoisted(() => ({ hideRecordOnce: false }));

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
