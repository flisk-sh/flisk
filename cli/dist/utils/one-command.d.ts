import { spawn } from "node:child_process";
/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export declare function findFrontendUrl(output: string): string | undefined;
export type StackRunResult = {
    code: number | null;
    output: string;
};
/**
 * Runs `flisk up` in the project directory and returns its output. The output is streamed to
 * the terminal as it arrives, so the stack keeps its live progress.
 */
export declare function runStack(binPath: string, cwd: string, env?: NodeJS.ProcessEnv, spawnFn?: typeof spawn): Promise<StackRunResult>;
