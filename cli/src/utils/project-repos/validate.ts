// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import type { RepoConfig } from "../../types/index.js";

function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Resolves a path to its canonical location, following symlinks in the deepest existing ancestor.
 * A destination that does not exist yet is resolved through the ancestor that does.
 */
function canonicalPath(path: string): string {
  const missing: string[] = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...missing);
}

const RESERVED_SEGMENTS = [".git", ".flisk", "node_modules"];

/** Validates that a git repository URL is safe and supported. */
export function validateRepoUrl(url: string): { valid: boolean; reason?: string } {
  if (!url || typeof url !== "string") {
    return { valid: false, reason: "Repository URL cannot be empty" };
  }
  const trimmed = url.trim();
  if (trimmed.startsWith("-")) {
    return { valid: false, reason: `Repository URL cannot start with a dash: "${trimmed}"` };
  }
  if (hasControlCharacters(trimmed)) {
    return { valid: false, reason: "Repository URL contains illegal control characters" };
  }
  if (/[\s;`$|&><]/.test(trimmed)) {
    return {
      valid: false,
      reason: `Repository URL contains dangerous characters or shell metacharacters: "${trimmed}"`,
    };
  }
  // Safe URL schemes or SCP-like git syntax
  const isSshScp = /^[\w.-]+@[\w.-]+:[^/\\]+.*$/.test(trimmed);
  const hasValidScheme = /^(https?|git|ssh|file):\/\//.test(trimmed);
  const isLocalPath = /^[a-zA-Z0-9_./~-]+$/.test(trimmed) && !trimmed.startsWith("-");

  if (!isSshScp && !hasValidScheme && !isLocalPath) {
    return { valid: false, reason: `Unsupported or unsafe repository URL format: "${trimmed}"` };
  }
  return { valid: true };
}

/** Validates an optional branch name to prevent option injection and dangerous characters. */
export function validateRepoBranch(branch?: string): { valid: boolean; reason?: string } {
  if (!branch) return { valid: true };
  const trimmed = branch.trim();
  if (trimmed.startsWith("-")) {
    return { valid: false, reason: `Branch name cannot start with a dash: "${trimmed}"` };
  }
  if (hasControlCharacters(trimmed) || /[\s;`$|&><]/.test(trimmed)) {
    return { valid: false, reason: `Branch name contains dangerous characters: "${trimmed}"` };
  }
  if (!/^[a-zA-Z0-9_./-]+$/.test(trimmed)) {
    return { valid: false, reason: `Invalid branch name format: "${trimmed}"` };
  }
  return { valid: true };
}

/** Validates that a destination directory is safe and contained within the project root. */
export function validateRepoDir(
  dir: string,
  projectRoot: string,
): { valid: boolean; reason?: string; targetPath?: string } {
  if (!dir || typeof dir !== "string") {
    return { valid: false, reason: "Destination directory cannot be empty" };
  }
  const trimmed = dir.trim();
  if (isAbsolute(trimmed) || trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) {
    return { valid: false, reason: `Absolute destination path rejected: "${trimmed}"` };
  }
  if (trimmed.split(/[\\/]/).includes("..")) {
    return { valid: false, reason: `Directory traversal ("..") rejected: "${trimmed}"` };
  }

  const targetPath = resolve(projectRoot, trimmed);
  const rel = relative(projectRoot, targetPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return { valid: false, reason: `Destination resolves outside project root: "${trimmed}"` };
  }

  const normalizedRel = normalize(rel).replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalizedRel.split("/");
  if (
    normalizedRel === "" ||
    normalizedRel === "." ||
    parts.includes(".git") ||
    parts.includes(".flisk") ||
    parts.includes("node_modules")
  ) {
    return {
      valid: false,
      reason: `Destination directory "${trimmed}" points to a reserved project path`,
    };
  }

  // Symlink escape check: check existing path components
  try {
    let current = projectRoot;
    const realRoot = realpathSync(projectRoot);
    const segments = normalizedRel.split("/");
    for (const segment of segments) {
      current = resolve(current, segment);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
        const real = realpathSync(current);
        const relReal = relative(realRoot, real);
        if (relReal.startsWith("..") || isAbsolute(relReal)) {
          return {
            valid: false,
            reason: `Destination "${trimmed}" traverses a symlink escaping project root`,
          };
        }
      }
    }
  } catch {
    // If filesystem checks hit unhandled error, reject
    return { valid: false, reason: `Could not verify destination safety for "${trimmed}"` };
  }

  // An in-root symlink can point a destination at a reserved path, so check the canonical target too.
  const canonicalRel = relative(realpathSync(projectRoot), canonicalPath(targetPath));
  const canonicalParts = canonicalRel.split(/[\\/]/);
  if (canonicalRel === "" || canonicalParts.some((part) => RESERVED_SEGMENTS.includes(part))) {
    return {
      valid: false,
      reason: `Destination directory "${trimmed}" points to a reserved project path`,
    };
  }

  return { valid: true, targetPath };
}

/** Validates the entire list of configured repositories for duplicates and nested conflicts. */
export function validateRepoList(
  repos: RepoConfig[],
  projectRoot: string,
): { valid: boolean; reason?: string } {
  const seenDirs = new Set<string>();
  const normalizedDirs: string[] = [];

  for (const repo of repos) {
    const urlValidation = validateRepoUrl(repo.url);
    if (!urlValidation.valid) {
      return { valid: false, reason: urlValidation.reason };
    }
    const branchValidation = validateRepoBranch(repo.branch);
    if (!branchValidation.valid) {
      return { valid: false, reason: branchValidation.reason };
    }
    const dirValidation = validateRepoDir(repo.dir, projectRoot);
    if (!dirValidation.valid) {
      return { valid: false, reason: dirValidation.reason };
    }

    const norm = canonicalPath(dirValidation.targetPath ?? "").replace(/\\/g, "/");
    if (seenDirs.has(norm)) {
      return { valid: false, reason: `Duplicate destination directory configured: "${repo.dir}"` };
    }
    seenDirs.add(norm);
    normalizedDirs.push(norm);
  }

  // Check for nested path conflicts
  for (let i = 0; i < normalizedDirs.length; i++) {
    for (let j = 0; j < normalizedDirs.length; j++) {
      if (i === j) continue;
      const dirA = normalizedDirs[i] as string;
      const dirB = normalizedDirs[j] as string;
      if (dirB.startsWith(`${dirA}/`)) {
        return {
          valid: false,
          reason: `Conflicting nested target directories configured: "${dirA}" and "${dirB}"`,
        };
      }
    }
  }

  return { valid: true };
}
