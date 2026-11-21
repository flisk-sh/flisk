import type { RepoConfig } from "../../types/index.js";
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
