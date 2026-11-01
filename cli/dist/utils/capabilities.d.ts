import type { DiscoveredResource, ProjectCapabilities, ProjectConfig } from "../types/index.js";
/**
 * Where a capability is read from: a project root (its `.flisk/project.json`), a project config, or an object that carries
 * `capabilities` or flag-style booleans such as `{ gateway: false }`. Nothing given reads the project the CLI runs in.
 */
export type CapabilitySource = string | ProjectConfig | {
    capabilities?: ProjectCapabilities;
    [key: string]: unknown;
} | ProjectCapabilities | null | undefined;
/**
 * The project's capabilities: the defaults, then `capabilities` in `.flisk/project.json` (or the config passed in), then
 * flags. A flag only turns a capability off. Commander sets `database: true` when `--no-database` is not given, so a
 * `true` from the options must not undo a project that opted out in project.json. An object source may also carry
 * flag-style booleans (`{ gateway: false }`), which turn a capability off the same way.
 */
export declare function resolveProjectCapabilities(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): ProjectCapabilities;
/** False when the project, the source or a flag turned the named capability off. */
export declare function isCapabilityEnabled(projectRootOrConfig: CapabilitySource, capabilityName: string, options?: Record<string, unknown>): boolean;
/** False when the project or a `--no-database` flag opted out of the bundled shared Postgres. */
export declare function isDatabaseCapabilityEnabled(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): boolean;
/** False when the project or a `--no-gateway` flag opted out of the Traefik gateway. */
export declare function isGatewayEnabled(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): boolean;
/** Names of the capabilities that are on, for `--json` output. */
export declare function getEnabledCapabilities(projectRootOrConfig?: CapabilitySource, options?: Record<string, unknown>): string[];
/**
 * `flisk up --no-gateway` must not be a silent no-op: the generated Tiltfile and compose files follow `.flisk/project.json`,
 * so the flag is only honoured when the project already opts out there.
 * @throws FliskError when the project still has the gateway on
 */
export declare function assertGatewayOptOutIsConfigured(projectRoot: string | null | undefined): void;
/**
 * Saves `capabilities.database: false` in `.flisk/project.json`. Returns true when the file changed, so the caller knows the
 * generated files are now stale and must be regenerated.
 */
export declare function disableDatabaseCapability(projectRoot: string): boolean;
/** One Flisk platform service and why it runs or does not, for `flisk status`. */
export interface PlatformServiceReport {
    /** The capability that controls it. */
    capability: "gateway" | "database";
    /** What the service is called on screen. */
    name: string;
    isEnabled: boolean;
    /** The resources that use it (sorted); empty when none does. */
    users: string[];
    /** Why it runs, or why it does not. */
    reason: string;
}
/**
 * Why the router and the shared Postgres run (or not) for this project (#2963): a setting in `.flisk/project.json` or a
 * flag first, then the resources that use the service.
 */
export declare function describePlatformServices(projectRoot: string | null | undefined, resources: readonly DiscoveredResource[], options?: Record<string, unknown>): PlatformServiceReport[];
