function hasControlCharacters(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { readProjectConfig } from "../generator/template-engine.js";
import type { CheckResult, RepoConfig } from "../types/index.js";
import { FliskError } from "./errors.js";

const execFilePromise = promisify(execFile);
const GIT_TIMEOUT_MS = 120_000;

export type GitRunner = (args: string[], options?: { cwd?: string }) => Promise<string>;

export const defaultGitRunner: GitRunner = async (args, options) => {
  const { stdout } = await execFilePromise("git", args, {
    cwd: options?.cwd,
    encoding: "utf-8",
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
  return stdout;
};

export interface CloneRepoResult {
  url: string;
  dir: string;
  cloned: boolean;
  skipped: boolean;
  reason?: string;
}

function firstLine(error: unknown): string {
  const stderr = String((error as { stderr?: Buffer | string }).stderr ?? error).trim();
  return stderr.split(/\r?\n/)[0] ?? "";
}

/** Replaces user-info (tokens, passwords) in any URL inside a string, so it can be printed safely. */
export function redactRepoUrl(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, "$1***@");
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

/**
 * Clones a single repository if its destination directory does not already exist.
 * Leaves existing directories untouched.
 */
export async function cloneRepo(
  repo: RepoConfig,
  projectRoot: string,
  runner: GitRunner = defaultGitRunner,
): Promise<CloneRepoResult> {
  const dirValidation = validateRepoDir(repo.dir, projectRoot);
  if (!dirValidation.valid || !dirValidation.targetPath) {
    throw new FliskError(`Invalid repository destination "${repo.dir}": ${dirValidation.reason}`, [
      "Specify a path relative to the project root, such as services/shop/orders-api",
    ]);
  }
  const urlValidation = validateRepoUrl(repo.url);
  if (!urlValidation.valid) {
    throw new FliskError(`Invalid repository URL "${repo.url}": ${urlValidation.reason}`, [
      "Specify a valid git clone URL, such as git@github.com:org/repo.git or https://github.com/org/repo.git",
    ]);
  }

  const targetPath = dirValidation.targetPath;
  if (existsSync(targetPath)) {
    if (!statSync(targetPath).isDirectory()) {
      throw new FliskError(
        `Cannot clone "${redactRepoUrl(repo.url)}": "${repo.dir}" exists and is not a directory`,
        ["Move or remove the file, then run flisk repos clone again"],
      );
    }
    return {
      url: repo.url,
      dir: repo.dir,
      cloned: false,
      skipped: true,
      reason: "destination directory already exists",
    };
  }

  try {
    mkdirSync(dirname(targetPath), { recursive: true });
  } catch (error) {
    throw new FliskError(
      `Failed to create the parent directory for "${redactRepoUrl(repo.url)}" at "${repo.dir}": ${(error as Error).message}`,
      ["Check that the parent path is writable and is not a file"],
    );
  }

  // Clone into a sibling temp directory and rename it into place, so a concurrent clone of the same
  // destination is never removed by this process, and a failed clone leaves nothing at targetPath.
  const tempPath = `${targetPath}.flisk-clone-${process.pid}-${Date.now()}`;
  const gitArgs = [
    "clone",
    "--quiet",
    ...(repo.branch ? ["--branch", repo.branch] : []),
    "--",
    repo.url,
    tempPath,
  ];

  try {
    await runner(gitArgs, { cwd: projectRoot });
  } catch (error) {
    rmSync(tempPath, { recursive: true, force: true });
    const hint = redactRepoUrl(firstLine(error));
    throw new FliskError(
      `Failed to clone repository "${redactRepoUrl(repo.url)}" into "${repo.dir}": ${hint || "git clone failed"}`,
      [
        "Verify your Git network access and authentication (SSH keys or personal access tokens)",
        `Try cloning manually to inspect details: git clone ${redactRepoUrl(repo.url)} ${repo.dir}`,
      ],
    );
  }

  if (existsSync(targetPath)) {
    // Another process created the destination while this clone ran; keep its copy.
    rmSync(tempPath, { recursive: true, force: true });
    return {
      url: repo.url,
      dir: repo.dir,
      cloned: false,
      skipped: true,
      reason: "destination directory already exists",
    };
  }
  renameSync(tempPath, targetPath);
  return {
    url: repo.url,
    dir: repo.dir,
    cloned: true,
    skipped: false,
  };
}

/**
 * Clones all missing repositories configured in the project.
 */
export async function cloneMissingRepos(
  projectRoot: string,
  repos?: RepoConfig[],
  runner: GitRunner = defaultGitRunner,
): Promise<CloneRepoResult[]> {
  const repoList = repos ?? readProjectConfig(projectRoot).repos ?? [];
  if (repoList.length === 0) return [];

  const listValidation = validateRepoList(repoList, projectRoot);
  if (!listValidation.valid) {
    throw new FliskError(`Invalid repos configuration in project: ${listValidation.reason}`, [
      "Review the repos entry in .flisk/project.json",
    ]);
  }

  const results: CloneRepoResult[] = [];
  for (const repo of repoList) {
    const result = await cloneRepo(repo, projectRoot, runner);
    results.push(result);
  }
  return results;
}

/**
 * Doctor check for configured service repositories. Read-only: never modifies repository state.
 */
export async function checkProjectRepos(
  projectRoot: string,
  repos?: RepoConfig[],
  runner: GitRunner = defaultGitRunner,
  options: { strict?: boolean } = {},
): Promise<CheckResult> {
  let repoList = repos;
  if (!repoList) {
    try {
      repoList = readProjectConfig(projectRoot).repos;
    } catch {
      // Handled by other doctor config checks
      return {
        name: "Service Repositories",
        didPass: true,
        isSkipped: true,
        message: "Could not read project configuration",
      };
    }
  }

  if (!repoList || repoList.length === 0) {
    return {
      name: "Service Repositories",
      didPass: true,
      isSkipped: true,
      message: "No external repositories configured",
    };
  }

  const listValidation = validateRepoList(repoList, projectRoot);
  if (!listValidation.valid) {
    return {
      name: "Service Repositories",
      didPass: false,
      message: `Invalid repository configuration: ${listValidation.reason}`,
      fix: "Edit .flisk/project.json and correct the repos list.",
    };
  }

  const missing: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  for (const repo of repoList) {
    const targetPath = resolve(projectRoot, repo.dir);
    if (!existsSync(targetPath)) {
      missing.push(`${repo.url} at ${repo.dir}`);
      continue;
    }

    // Target exists: verify it is the top level of its own git repo. Git searches parent directories,
    // so a plain folder inside another repository would otherwise be checked against that repository.
    let isGit = false;
    try {
      const topLevel = (await runner(["rev-parse", "--show-toplevel"], { cwd: targetPath })).trim();
      isGit = realpathSync(topLevel) === realpathSync(targetPath);
    } catch {
      isGit = false;
    }

    if (!isGit) {
      missing.push(`${repo.dir} (folder exists but is not a Git repository)`);
      continue;
    }

    // Check branch if configured
    if (repo.branch) {
      try {
        const branchOutput = await runner(["rev-parse", "--abbrev-ref", "HEAD"], {
          cwd: targetPath,
        });
        const currentBranch = branchOutput.trim();
        if (currentBranch !== repo.branch) {
          warnings.push(`${repo.dir} is on branch "${currentBranch}", expected "${repo.branch}"`);
        }
      } catch {
        warnings.push(`${repo.dir} could not determine current branch`);
      }
    }

    // Check uncommitted changes
    try {
      const statusOutput = await runner(["status", "--porcelain"], { cwd: targetPath });
      if (statusOutput.trim().length > 0) {
        warnings.push(`${repo.dir} has local uncommitted changes`);
      }
    } catch {
      warnings.push(`${repo.dir} could not be checked for uncommitted changes`);
    }

    present.push(repo.dir);
  }

  if (missing.length > 0) {
    return {
      name: "Service Repositories",
      didPass: false,
      message: `${missing.length} service repository missing: ${missing.join("; ")}`,
      fix: "Run flisk repos clone; or run flisk up to clone missing repositories.",
    };
  }

  if (warnings.length > 0) {
    return {
      name: "Service Repositories",
      didPass: false,
      isWarning: !options.strict,
      message: `${present.length} repository cloned, with notes: ${warnings.join("; ")}`,
      fix: "Check your local Git branches and uncommitted changes.",
    };
  }

  return {
    name: "Service Repositories",
    didPass: true,
    message: `All ${present.length} service repositories cloned and clean`,
  };
}
