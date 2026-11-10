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
export declare function getWorktreeInfo(projectRoot?: string): WorktreeInfo;
/**
 * Generates an isolated project name when multiple worktrees or agents run concurrently.
 * When FLISK_WORKTREE_ISOLATION is set or isolation is explicitly enabled, appends the
 * worktree name or short hash to avoid container and volume collisions.
 */
export declare function deriveIsolatedProjectName(baseProjectName: string, projectRoot?: string, options?: {
    enabled?: boolean;
    suffix?: string;
}): string;
/**
 * Calculates a deterministic port offset for a worktree to prevent EADDRINUSE collisions.
 * Can be explicitly provided via FLISK_PORT_OFFSET or derived deterministically from worktree name.
 */
export declare function deriveWorktreePortOffset(projectRoot?: string, explicitOffset?: number): number;
