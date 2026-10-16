import type { CheckResult } from "../types/index.js";
/** Restarts that make a container a crash loop rather than a one-off. */
export declare const CRASH_LOOP_RESTARTS = 5;
/** Runs `docker` with args; resolves with stdout and stderr joined (logs write to both). */
export type DockerRun = (args: string[]) => Promise<string>;
export interface ContainerState {
    name: string;
    restartCount: number;
    status: string;
    startedAt: string;
    exitCode: number;
}
/** Whether this container's compose project belongs to the TDK project, however the engine spelled the separator. */
export declare function belongsToProject(composeProject: string, projectName: string): boolean;
export declare function isCrashLooping(state: ContainerState, now?: number): boolean;
/** A hint for a cause that the last log lines name. Null when they do not say. */
export declare function crashLoopHint(logs: string, state: ContainerState): string | null;
/** Containers of this project that keep restarting, with their last log lines and a cause hint when one is clear. */
export declare function checkCrashLoopingContainers(projectName: string, secrets?: readonly string[], run?: DockerRun, now?: number): Promise<CheckResult>;
