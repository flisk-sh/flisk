import type { ProjectCapabilities, ProjectConfig } from "../types/index.js";
/** Every capability is on unless `.flisk/project.json` or a flag turns it off. */
export declare const DEFAULT_CAPABILITIES: Readonly<Record<string, boolean>>;
type CapabilitySource = string | ProjectConfig | Record<string, unknown> | null | undefined;
/**
 * The project's capabilities: the defaults, then `capabilities` in `.flisk/project.json` (or the config passed in), then flags.
 * A flag only turns a capability off. Commander sets `database: true` when `--no-database` is not given, so a `true` from
 * the options must not undo a project that opted out in project.json.
 */
export declare function resolveProjectCapabilities(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): ProjectCapabilities;
/** False when the project or a `--no-database` flag opted out of the bundled shared Postgres. */
export declare function isDatabaseCapabilityEnabled(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): boolean;
/** Names of the capabilities that are on, for `--json` output. */
export declare function getEnabledCapabilities(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): string[];
/**
 * Saves `capabilities.database: false` in `.flisk/project.json`. Returns true when the file changed, so the caller knows the
 * generated files are now stale and must be regenerated.
 */
export declare function disableDatabaseCapability(projectRoot: string): boolean;
export {};
