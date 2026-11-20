import type { ProjectConfig } from "../types/index.js";
import { FliskError } from "../utils/errors.js";
/**
 * Type guard to validate if an unknown value is a valid ProjectConfig.
 *
 * NOTE: The `as` assertions below are INTENTIONAL and SAFE:
 * - We've already verified `typeof value === 'object'` and `value !== null`
 * - TypeScript doesn't automatically narrow `{}` to `Record<string, unknown>`
 * - Each assertion is immediately followed by property type checks
 * - This pattern is standard for deep object validation in type guards
 */
/** One project.json field that has the wrong type, as `normalizeProjectConfig` found it. */
type ProjectConfigProblem = {
    field: string;
    expected: string;
    got: unknown;
};
type NormalizedProjectConfig = {
    ok: true;
    config: ProjectConfig;
} | {
    ok: false;
    problem: ProjectConfigProblem;
};
export declare function normalizeProjectConfig(value: unknown): NormalizedProjectConfig;
/** The project has no .flisk/project.json yet, as opposed to one that exists but is unreadable or invalid. */
export declare class ProjectConfigNotFoundError extends FliskError {
}
/**
 * Reads, parses, and normalizes `.flisk/project.json` from the given project root.
 *
 * The file is read directly instead of being existence-checked first: `fs.existsSync` swallows
 * filesystem errors and reports an inaccessible config as missing, which hides the real reason.
 * Only a missing file (`ENOENT`) means "not found"; every other read failure keeps its reason.
 *
 * @param projectRoot - Root directory of the Flisk project.
 * @returns The validated and normalized {@link ProjectConfig}.
 */
export declare function readProjectConfig(projectRoot: string): ProjectConfig;
/**
 * True when .flisk/project.json makes the project's own Tiltfile its orchestration source (`flisk import tiltfile`), so
 * `flisk up` runs Tilt with the wrapper. False when there is no readable project.json.
 */
export declare function isTiltfileOrchestration(projectRoot: string): boolean;
export {};
