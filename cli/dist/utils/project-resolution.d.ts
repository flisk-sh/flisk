import { FliskError } from "./errors.js";
export interface ResolveProjectOptions {
    /** Name of the command requesting resolution (e.g. "logs", "restart", "status"). */
    commandName: string;
    /** Explicit project path passed via `--project <path>`. */
    project?: string;
    /** Whether the command is running in JSON mode (`--json`). */
    json?: boolean;
    /**
     * If true, and exactly one project is running when outside a project, automatically select it.
     * `down` uses this; `logs`, `restart`, and `status` do not.
     */
    autoSelectSingleRunning?: boolean;
    /**
     * Optional custom failure handler if the caller needs to format or throw errors differently.
     */
    onFail?: (error: FliskError) => never;
}
/**
 * Resolves the target project root for a Flisk command:
 * 1. If `options.project` is passed, resolves that directory. Fails if no Flisk project exists there.
 * 2. Otherwise, checks the current working directory (`findProjectRoot()`).
 * 3. If outside a project, inspects running Flisk projects:
 *    - If `autoSelectSingleRunning` is true and exactly 1 project is running, selects it.
 *    - If 1 or more projects are running, fails with a list of running projects and suggestions to run `flisk <command> --project <root>`.
 *    - If 0 projects are running, fails with the standard `notInProject` error and suggestions.
 * 4. Changes `process.cwd()` to the resolved project root if it differs from current root.
 */
export declare function resolveCommandProject(options: ResolveProjectOptions): string;
