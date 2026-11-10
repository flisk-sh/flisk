// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export interface WorktreeInfo {
  /** True when the directory sits inside a git repository (main clone or linked worktree). */
  isGit: boolean;
  /** True specifically when the directory is a linked git worktree (.git is a file, not a directory). */
  isLinkedWorktree: boolean;
  /** Name of the linked worktree (derived from the gitdir pointer or directory basename). */
  worktreeName?: string;
  /** Git directory path (.git directory or the target worktrees directory). */
  gitDir?: string;
}

/**
 * Detects whether projectRoot is inside a git repository, and specifically whether it is
 * a linked Git worktree created via `git worktree add`.
 */
export function getWorktreeInfo(projectRoot: string = process.cwd()): WorktreeInfo {
  let dir = resolve(projectRoot);
  while (dir !== dirname(dir)) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      try {
        const stat = statSync(gitPath);
        if (stat.isFile()) {
          const content = readFileSync(gitPath, "utf-8").trim();
          const match = content.match(/^gitdir:\s*(.+)$/m);
          if (match) {
            const gitDir = match[1].trim();
            const worktreeName = basename(gitDir);
            return {
              isGit: true,
              isLinkedWorktree: true,
              worktreeName,
              gitDir,
            };
          }
          return {
            isGit: true,
            isLinkedWorktree: true,
            worktreeName: basename(dir),
            gitDir: content,
          };
        }
        if (stat.isDirectory()) {
          return {
            isGit: true,
            isLinkedWorktree: false,
            gitDir: gitPath,
          };
        }
      } catch {
        // Fall through on unreadable .git
      }
    }
    dir = dirname(dir);
  }

  return {
    isGit: false,
    isLinkedWorktree: false,
  };
}

/**
 * Generates an isolated project name when multiple worktrees or agents run concurrently.
 * When FLISK_WORKTREE_ISOLATION is set or isolation is explicitly enabled, appends the
 * worktree name or short hash to avoid container and volume collisions.
 */
export function deriveIsolatedProjectName(
  baseProjectName: string,
  projectRoot: string = process.cwd(),
  options: { enabled?: boolean; suffix?: string } = {},
): string {
  const envEnabled =
    process.env.FLISK_WORKTREE_ISOLATION === "true" || process.env.FLISK_WORKTREE_ISOLATION === "1";
  const shouldIsolate = options.enabled ?? (envEnabled || Boolean(process.env.FLISK_WORKTREE_NAME));

  if (!shouldIsolate) {
    return baseProjectName;
  }

  if (options.suffix) {
    return `${baseProjectName}-${options.suffix}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  if (process.env.FLISK_WORKTREE_NAME) {
    return `${baseProjectName}-${process.env.FLISK_WORKTREE_NAME}`
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
  }

  const info = getWorktreeInfo(projectRoot);
  if (info.isLinkedWorktree && info.worktreeName) {
    return `${baseProjectName}-${info.worktreeName}`.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  // Fallback to a short hash of the absolute directory path to guarantee uniqueness across worktrees
  const hash = createHash("sha256").update(resolve(projectRoot)).digest("hex").slice(0, 6);
  return `${baseProjectName}-${hash}`;
}

/**
 * Calculates a deterministic port offset for a worktree to prevent EADDRINUSE collisions.
 * Can be explicitly provided via FLISK_PORT_OFFSET or derived deterministically from worktree name.
 */
export function deriveWorktreePortOffset(
  projectRoot: string = process.cwd(),
  explicitOffset?: number,
): number {
  if (explicitOffset !== undefined) return explicitOffset;
  if (process.env.FLISK_PORT_OFFSET) {
    const parsed = Number.parseInt(process.env.FLISK_PORT_OFFSET, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const info = getWorktreeInfo(projectRoot);
  if (!info.isLinkedWorktree || !info.worktreeName) {
    return 0;
  }

  // Compute a deterministic offset between 100 and 900 in increments of 100 based on worktree name
  let hashVal = 0;
  for (let i = 0; i < info.worktreeName.length; i++) {
    hashVal = (hashVal << 5) - hashVal + info.worktreeName.charCodeAt(i);
    hashVal |= 0;
  }
  const bucket = (Math.abs(hashVal) % 9) + 1; // 1 to 9
  return bucket * 100;
}
