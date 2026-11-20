import type { CheckResult, DiscoveredResource } from "../types/index.js";
/**
 * Fresh-worktree diagnostics for local-process services (#4048). A worktree has the source files but not the gitignored
 * `node_modules`, `.venv` or `.env`, so `flisk up` dies on module-not-found or missing keys. Doctor names the service and
 * prints the exact install/copy command instead. Nothing here installs or copies anything.
 */
export interface LocalServiceDepFinding {
    service: string;
    /** Service directory relative to the project root. */
    path: string;
    missing: "node_modules" | ".venv";
    installCommand: string;
}
export type PathExists = (path: string) => boolean;
/**
 * The local-process services whose dependencies are missing. Installs may be hoisted at the project root, so a dependency
 * directory in either the service folder or the project root counts as present.
 */
export declare function findMissingLocalServiceDeps(projectRoot: string, resources: readonly DiscoveredResource[], exists?: PathExists): LocalServiceDepFinding[];
export declare function checkLocalServiceDependencies(projectRoot?: string, resources?: readonly DiscoveredResource[], exists?: PathExists): CheckResult;
export interface WorktreeEnvHint {
    /** Absolute path of the `.env` found in another worktree. */
    source: string;
    target: string;
    copyCommand: string;
}
export interface EnvHintOptions {
    /** Used by tests; defaults to `git worktree list --porcelain` in the project root. */
    listWorktrees?: (cwd: string) => string;
    exists?: PathExists;
    platform?: NodeJS.Platform;
}
/** Paths from `git worktree list --porcelain`, skipping the current one and prunable (missing) checkouts. */
export declare function parseWorktreePaths(raw: string, projectRoot: string): string[];
/**
 * Points at another worktree's `.env` when this worktree has none. The file is never copied: the command is for the user to
 * run, because an env file is per-worktree and may hold worktree-specific credentials.
 */
export declare function findWorktreeEnvHint(projectRoot: string, options?: EnvHintOptions): WorktreeEnvHint | null;
export declare function checkWorktreeEnv(projectRoot?: string, options?: EnvHintOptions): CheckResult;
/** The same hint `flisk up` prints before a local-process run reads the project .env. */
export declare function worktreeEnvHintMessage(projectRoot: string): string | null;
