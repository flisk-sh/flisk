import { buildArgsErrors, envFileErrors, loggingErrors } from "./service-manifest-build-env.js";
import { containerErrors } from "./service-manifest-container.js";
import { dependsOnErrors } from "./service-manifest-depends-on.js";
import { fieldTypeErrors, isAbsoluteBuildPath } from "./service-manifest-field-types.js";
import { extraPortsErrors } from "./service-manifest-ports.js";
import { byoEnvErrors, modelsErrors, type ProviderSpec, providersErrors, providersOf, providesErrors } from "./service-manifest-providers.js";
import { volumesErrors } from "./service-manifest-volumes.js";
export { buildArgsErrors, byoEnvErrors, containerErrors, dependsOnErrors, envFileErrors, extraPortsErrors, fieldTypeErrors, isAbsoluteBuildPath, loggingErrors, modelsErrors, type ProviderSpec, providersErrors, providersOf, providesErrors, volumesErrors, };
export declare const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export declare const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";
/**
 * A frontend's `basePath`, as in the schema (runtime/engine/schemas/service-schema.json). `flisk resource --base-path` checks
 * the same pattern, so a resource it creates is never reported invalid by `flisk config verify`.
 */
export declare const BASE_PATH_PATTERN: RegExp;
/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export declare function validateGeneratedStringFields(manifest: Record<string, unknown>, displayPath: string): string[];
export declare function isDockerSafeName(value: unknown, max?: number): boolean;
/** Errors for an `appName` or `stack` that Docker cannot name an image after. A `command` service never reaches Docker. */
export declare function dockerNameErrors(manifest: Record<string, unknown>, displayPath: string): string[];
export interface ServiceManifestValidation {
    errors: string[];
    warnings: string[];
    manifest?: Record<string, unknown>;
}
export declare function getInvalidServiceRoutePathFields(value: unknown): ("apiPath" | "basePath")[];
/** `webUi` (#2997) is read for bring-your-own resources only: the app serves pages from `/`, so it gets a host name, not a path prefix. */
export declare function webUiErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `restart` on a bring-your-own resource: no, on-failure, on-failure:N (N from 1 to 100), unless-stopped or always. Mirrors
 * byo_restart_policy in engine/.../compose/byo_container.star.
 */
export declare function restartErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * `sidecarOf` (#2908): a bring-your-own resource that shares another resource's network namespace. Mirrors
 * engine/.../compose/byo_sidecar.star. Whether the host exists in the same stack is checked across services (checkSidecars).
 */
export declare function sidecarErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/** `secrets` must be { required?: string[], optional?: string[], generate?: object, files?: array }: the generator fails on anything else. */
export declare function secretsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/** `configs` must be an array of { name, source, target, uid?, gid?, mode? } (#3059). */
export declare function configsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
export declare function secretConflictWarnings(manifest: Record<string, unknown>, displayPath: string): string[];
export interface ParsedHealthCheckConfig {
    enabled: boolean;
    required?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
    startPeriod?: number;
    path?: string;
}
/**
 * Validates the optional `healthCheck` field: boolean (e.g. false to disable) or an object
 * configuring enabled, required, interval, timeout, retries, and path/port/command.
 */
export declare function healthCheckErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/** How a service shows it is ready: an HTTP path, an open TCP port, or a command that exits 0 (#2875). */
export type ReadinessProbe = {
    kind: "port";
    port: number;
} | {
    kind: "command";
    command: string[];
};
/** `healthCheck.port` or `healthCheck.command`, when the service set one instead of an HTTP path. */
export declare function readinessProbeOf(manifest?: HealthCheckSource): ReadinessProbe | undefined;
/** A manifest, or the `config` of a discovered resource, as the health check helpers read it. */
type HealthCheckSource = {
    healthCheck?: unknown;
    healthCheckPath?: unknown;
} | Readonly<Record<string, unknown>>;
/**
 * The one rule for turning health checks off: `healthCheck: false` or `healthCheck: { enabled: false }`.
 * Nothing else disables them: a service without a health path still gets its default readiness
 * signal (its port for a native `command` service, `/health` for a container).
 */
export declare function isHealthCheckDisabled(manifest?: HealthCheckSource): boolean;
/**
 * True when the service explicitly marks its health check as non-blocking (`healthCheck: { required: false }`).
 * Defaults to false (health checks are required). Returns false when health checks are disabled entirely.
 */
export declare function isHealthCheckOptional(manifest?: HealthCheckSource): boolean;
/** The HTTP path to probe: `healthCheck.path`, then `healthCheckPath`, then `fallback`. */
export declare function healthCheckPathOf(manifest?: HealthCheckSource, fallback?: string): string | undefined;
/**
 * Reads a manifest's health check settings. `enabled` follows {@link isHealthCheckDisabled}; `path` follows
 * {@link healthCheckPathOf} and is absent when neither the manifest nor `options.defaultPath` gives one.
 */
export declare function parseHealthCheckConfig(manifest?: HealthCheckSource, options?: {
    defaultPath?: string;
}): ParsedHealthCheckConfig;
export declare function appTypeAndPortErrors(manifest: Record<string, unknown>, displayPath: string): string[];
export declare function validateServiceManifest(value: unknown, displayPath: string): ServiceManifestValidation;
/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export declare function generatedFieldErrorsForFile(filePath: string, displayPath: string): string[];
export declare function validateServiceManifestFile(filePath: string, displayPath: string): ServiceManifestValidation;
