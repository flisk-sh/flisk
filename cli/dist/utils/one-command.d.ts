import { spawn } from "node:child_process";
/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export declare function findFrontendUrl(output: string): string | undefined;
export type StackRunResult = {
    code: number | null;
    output: string;
};
/**
 * Runs `flisk up` in the project directory and streams its output to the terminal. The stack
 * keeps running in the foreground, so the caller is told about the frontend URL as soon as it
 * shows up instead of waiting for the process to exit.
 */
export declare function runStack(binPath: string, cwd: string, env?: NodeJS.ProcessEnv, spawnFn?: typeof spawn, onFrontendUrl?: (url: string) => void): Promise<StackRunResult>;
