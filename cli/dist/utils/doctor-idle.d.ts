import type { CheckResult } from "../types/index.js";
export type CommandRunner = (command: string, args: string[]) => string;
export declare const DEFAULT_IDLE_HOURS = 48;
export interface RunningProject {
    root: string;
    uptimeSeconds: number;
}
/** `ps` etime is `[[DD-]HH:]MM:SS`; anything unrecognised counts as fresh rather than producing a false warning. */
export declare function parseEtime(etime: string): number;
/** Roots of projects whose `tilt up` is still running, with how long that process has been alive. */
export declare function parseRunningProjects(psOutput: string, isProject?: (root: string) => boolean): RunningProject[];
export declare function formatUptime(uptimeSeconds: number): string;
export interface IdleProjectOptions {
    commandRunner?: CommandRunner;
    /** Pre-captured `ps -axo pid=,etime=,command=` output, for tests. */
    psOutput?: string;
    /** Pre-captured `docker ps --format` output, for tests. */
    dockerOutput?: string;
    /** Pre-captured `docker volume ls --format` output, for tests. */
    volumeOutput?: string;
    idleHours?: number;
    isProject?: (root: string) => boolean;
}
/** A non-failing doctor check that names every long-running project and how to stop it. */
export declare function checkIdleProjects(options?: IdleProjectOptions): CheckResult;
