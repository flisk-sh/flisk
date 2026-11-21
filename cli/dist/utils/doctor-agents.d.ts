import type { CheckResult } from "../types/index.js";
import type { CommandRunner } from "./port-owner.js";
export interface SessionFileEntry {
    name: string;
    mtimeMs: number;
}
export interface CodingAgentCheckOptions {
    /** Directory to treat as the working directory; defaults to cwd. */
    startDir?: string;
    /** Flisk project root when known; discovered from startDir when omitted. */
    projectRoot?: string | null;
    strict?: boolean;
    platform?: NodeJS.Platform;
    homeDir?: string;
    now?: number;
    /** Session files modified within this window count as active. */
    recentWindowMs?: number;
    /** Runs fixed-argument commands (`ps`, `git`, `lsof`); injectable for tests. */
    run?: CommandRunner;
    pathExists?: (path: string) => boolean;
    realpath?: (path: string) => string;
    /** Lists `.jsonl` session files with mtimes; must never read file contents. */
    listSessionFiles?: (dir: string) => SessionFileEntry[];
    /** Maps pids to their working directories; empty map means "cannot attribute". */
    listProcessCwds?: (pids: number[]) => Map<number, string>;
}
/** Claude Code names `~/.claude/projects/<dir>` by replacing every non-alphanumeric char with "-". */
export declare function claudeProjectSlug(dir: string): string;
export declare function checkCodingAgents(options?: CodingAgentCheckOptions): CheckResult;
