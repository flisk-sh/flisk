import type { CheckResult, RepoConfig } from "../types/index.js";
export type GitRunner = (args: string[], options?: {
    cwd?: string;
}) => Promise<string>;
export declare const defaultGitRunner: GitRunner;
export interface CloneRepoResult {
    url: string;
    dir: string;
    branch?: string;
    cloned: boolean;
    skipped: boolean;
    reason?: string;
}
/** One decision from the read-only plan shared by `repos clone --dry-run` and a real clone. */
export interface RepoClonePlanEntry {
    repo: RepoConfig;
    url: string;
    dir: string;
    branch?: string;
    action: "clone" | "keep";
    reason?: string;
    targetPath: string;
    createdParents: string[];
}
/** Replaces user-info (tokens, passwords) in any URL inside a string, so it can be printed safely. */
export declare function redactRepoUrl(text: string): string;
/** Validates that a git repository URL is safe and supported. */
export declare function validateRepoUrl(url: string): {
    valid: boolean;
    reason?: string;
};
/** Validates an optional branch name to prevent option injection and dangerous characters. */
export declare function validateRepoBranch(branch?: string): {
    valid: boolean;
    reason?: string;
};
/** Validates that a destination directory is safe and contained within the project root. */
export declare function validateRepoDir(dir: string, projectRoot: string): {
    valid: boolean;
    reason?: string;
    targetPath?: string;
};
/** Validates the entire list of configured repositories for duplicates and nested conflicts. */
export declare function validateRepoList(repos: RepoConfig[], projectRoot: string): {
    valid: boolean;
    reason?: string;
};
/**
 * Clones a single repository if its destination directory does not already exist.
 * Leaves existing directories untouched.
 */
/**
 * Builds the read-only clone plan shared by `flisk repos clone --dry-run` and the real run.
 * It validates every repository, then decides from the filesystem which destinations are missing.
 * No directory is created and no git process is started.
 */
export declare function planRepoClones(projectRoot: string, repos?: RepoConfig[]): RepoClonePlanEntry[];
/** Applies a clone plan. Only this function starts git; planning and `--dry-run` never do. */
export declare function applyRepoClonePlan(plan: RepoClonePlanEntry[], projectRoot: string, runner?: GitRunner): Promise<CloneRepoResult[]>;
/** Clones a single repository if its destination directory does not already exist. */
export declare function cloneRepo(repo: RepoConfig, projectRoot: string, runner?: GitRunner): Promise<CloneRepoResult>;
/**
 * Clones all missing repositories configured in the project, using the same plan as `--dry-run`.
 */
export declare function cloneMissingRepos(projectRoot: string, repos?: RepoConfig[], runner?: GitRunner): Promise<CloneRepoResult[]>;
/**
 * Doctor check for configured service repositories. Read-only: never modifies repository state.
 */
export declare function checkProjectRepos(projectRoot: string, repos?: RepoConfig[], runner?: GitRunner, options?: {
    strict?: boolean;
}): Promise<CheckResult>;
