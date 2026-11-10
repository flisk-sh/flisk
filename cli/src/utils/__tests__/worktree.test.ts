// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir } from "../../test-support/index.js";
import {
  deriveIsolatedProjectName,
  deriveWorktreePortOffset,
  getWorktreeInfo,
} from "../worktree.js";

describe("worktree isolation utilities", () => {
  it("detects standard non-git directory", () => {
    const tempDir = createTempDir("non-git-");
    const info = getWorktreeInfo(tempDir);
    expect(info.isGit).toBe(false);
    expect(info.isLinkedWorktree).toBe(false);
  });

  it("detects main git repository with .git directory", () => {
    const tempDir = createTempDir("main-git-");
    mkdirSync(join(tempDir, ".git"));
    const info = getWorktreeInfo(tempDir);
    expect(info.isGit).toBe(true);
    expect(info.isLinkedWorktree).toBe(false);
  });

  it("detects linked git worktree with .git file pointing to gitdir", () => {
    const tempDir = createTempDir("linked-worktree-");
    writeFileSync(
      join(tempDir, ".git"),
      "gitdir: /repos/main-repo/.git/worktrees/agent-feature-branch\n",
    );
    const info = getWorktreeInfo(tempDir);
    expect(info.isGit).toBe(true);
    expect(info.isLinkedWorktree).toBe(true);
    expect(info.worktreeName).toBe("agent-feature-branch");
  });

  it("derives isolated project name based on worktree name", () => {
    const tempDir = createTempDir("worktree-naming-");
    writeFileSync(
      join(tempDir, ".git"),
      "gitdir: /repos/main-repo/.git/worktrees/agent-worker-1\n",
    );

    // Disabled by default
    expect(deriveIsolatedProjectName("my-app", tempDir, { enabled: false })).toBe("my-app");

    // Enabled explicitly
    expect(deriveIsolatedProjectName("my-app", tempDir, { enabled: true })).toBe(
      "my-app-agent-worker-1",
    );
  });

  it("honors custom suffix or FLISK_WORKTREE_NAME override", () => {
    const tempDir = createTempDir("worktree-suffix-");
    expect(
      deriveIsolatedProjectName("my-app", tempDir, { enabled: true, suffix: "custom-worker" }),
    ).toBe("my-app-custom-worker");
  });

  it("derives deterministic port offset for linked worktrees", () => {
    const tempDir = createTempDir("worktree-ports-");
    writeFileSync(
      join(tempDir, ".git"),
      "gitdir: /repos/main-repo/.git/worktrees/agent-worker-1\n",
    );

    const offset = deriveWorktreePortOffset(tempDir);
    expect(offset).toBeGreaterThanOrEqual(100);
    expect(offset % 100).toBe(0);

    // Explicit override
    expect(deriveWorktreePortOffset(tempDir, 500)).toBe(500);
  });

  it("returns 0 port offset for non-worktree directories", () => {
    const tempDir = createTempDir("no-worktree-");
    mkdirSync(join(tempDir, ".git"));
    expect(deriveWorktreePortOffset(tempDir)).toBe(0);
  });
});
