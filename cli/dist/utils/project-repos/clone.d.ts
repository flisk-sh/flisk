import type { RepoConfig } from "../../types/index.js";
export type GitRunner = (args: string[], options?: {
    cwd?: string;
}) => Promise<string>;
export declare const defaultGitRunner: GitRunner;
export interface CloneRepoResult {
    url: string;
    dir: string;
    cloned: boolean;
    skipped: boolean;
    reason?: string;
}
/** Replaces user-info (tokens, passwords) in any URL inside a string, so it can be printed safely. */
export declare function redactRepoUrl(text: string): string;
/**
 * Clones a single repository if its destination directory does not already exist.
 * Leaves existing directories untouched.
 */
export declare function cloneRepo(repo: RepoConfig, projectRoot: string, runner?: GitRunner): Promise<CloneRepoResult>;
/**
 * Clones all missing repositories configured in the project.
 */
export declare function cloneMissingRepos(projectRoot: string, repos?: RepoConfig[], runner?: GitRunner): Promise<CloneRepoResult[]>;
