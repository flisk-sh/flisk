// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FliskError } from "../errors.js";
import { projectLockPath, withProjectLock } from "../project-lock.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "flisk-project-lock-"));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe("withProjectLock", () => {
  it("serializes concurrent callers and removes the lock file afterward", async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3, 4].map((id) =>
        withProjectLock(
          projectRoot,
          async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            order.push(id);
            await new Promise((resolve) => setTimeout(resolve, 25));
            active--;
          },
          { retryDelayMs: 5, timeoutMs: 5_000 },
        ),
      ),
    );

    expect(maxActive).toBe(1);
    expect(order).toHaveLength(4);
    expect(existsSync(projectLockPath(projectRoot))).toBe(false);
  });

  it("releases the lock when the callback throws", async () => {
    await expect(
      withProjectLock(projectRoot, async () => {
        expect(existsSync(projectLockPath(projectRoot))).toBe(true);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(existsSync(projectLockPath(projectRoot))).toBe(false);
  });

  it("clears a stale lock left by a dead process", async () => {
    const lockPath = projectLockPath(projectRoot);
    mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: 999_999_999, token: "dead", startedAt: Date.now() - 60_000 }),
    );

    const result = await withProjectLock(projectRoot, () => "acquired", {
      isPidAlive: () => false,
      retryDelayMs: 5,
      timeoutMs: 1_000,
    });

    expect(result).toBe("acquired");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("times out with a FliskError naming the holding pid when a live process holds the lock", async () => {
    const lockPath = projectLockPath(projectRoot);
    mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
    writeFileSync(lockPath, JSON.stringify({ pid: 4242, token: "live", startedAt: Date.now() }));

    await expect(
      withProjectLock(projectRoot, () => "never", {
        isPidAlive: (pid) => pid === 4242,
        retryDelayMs: 5,
        timeoutMs: 40,
      }),
    ).rejects.toThrow(FliskError);

    await expect(
      withProjectLock(projectRoot, () => "never", {
        isPidAlive: (pid) => pid === 4242,
        retryDelayMs: 5,
        timeoutMs: 40,
      }),
    ).rejects.toThrow("Another flisk command (pid 4242) is regenerating this project");
  });

  it("reaps an old empty lock file once it outlives the write grace window", async () => {
    const lockPath = projectLockPath(projectRoot);
    mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
    writeFileSync(lockPath, "");
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    utimesSync(lockPath, tenSecondsAgo, tenSecondsAgo);

    const result = await withProjectLock(projectRoot, () => "recovered", {
      retryDelayMs: 5,
      timeoutMs: 1_000,
    });

    expect(result).toBe("recovered");
    expect(existsSync(lockPath)).toBe(false);
  });
});
