import type { TiltCommandResult } from "../types/index.js";
export declare function runTilt(command: string, args?: string[], options?: {
    verbose?: boolean;
    quiet?: boolean;
    inheritStdio?: boolean;
    timeoutMs?: number;
    /** Environment for the child (e.g. resolved secrets); values are never logged. */
    env?: NodeJS.ProcessEnv;
}): Promise<TiltCommandResult>;
export declare function isTiltAvailable(): Promise<boolean>;
export declare function getTiltfilePath(): string;
export declare function buildTiltUpArgs(serviceNames: string[], options?: {
    verbose?: boolean;
    quiet?: boolean;
    force?: boolean;
    watch?: boolean;
    focusTargets?: string[];
}): string[];
export declare function buildTiltDownArgs(options?: {
    force?: boolean;
    yes?: boolean;
    focusTargets?: string[];
}): string[];
