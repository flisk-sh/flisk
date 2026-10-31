export declare const SERVICE_MANIFEST_SCHEMA_VERSION = 1;
export declare const SERVICE_MANIFEST_SCHEMA_URL = "https://flisk.sh/schema.service.json";
/**
 * Errors for generated-output fields whose values could change the generated YAML. The value itself is not echoed, because it may
 * contain the newline that makes it dangerous.
 */
export declare function validateGeneratedStringFields(manifest: Record<string, unknown>, displayPath: string): string[];
export declare function isDockerSafeName(value: unknown, max?: number): boolean;
/** Errors for an `appName` or `stack` that Docker cannot name an image after. A `command` service never reaches Docker. */
export declare function dockerNameErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * An absolute path or a Windows drive. Build paths are relative to the service directory (the loader joins them to it), so an
 * absolute one can never resolve. `..` is allowed on purpose: a service.json inside the project may build from a source tree
 * outside it (docs/layout.md, docs/byo.md), and `flisk import` writes exactly that for a Compose service whose Dockerfile stays
 * where it was.
 */
export declare function isAbsoluteBuildPath(value: string): boolean;
/** Errors for a field of the wrong type, an enum value that does not exist, an escaping path, or a conflicting source. */
export declare function fieldTypeErrors(manifest: Record<string, unknown>, displayPath: string): string[];
export interface ServiceManifestValidation {
    errors: string[];
    warnings: string[];
    manifest?: Record<string, unknown>;
}
export declare function getInvalidServiceRoutePathFields(value: unknown): ("apiPath" | "basePath")[];
/** `secrets` must be { required?: string[], optional?: string[] } of environment variable names: the generator fails on anything else. */
export declare function secretsErrors(manifest: Record<string, unknown>, displayPath: string): string[];
export declare function secretConflictWarnings(manifest: Record<string, unknown>, displayPath: string): string[];
export interface HealthCheckObjectConfig {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
    path?: string;
}
export type HealthCheckConfig = boolean | HealthCheckObjectConfig;
export interface ParsedHealthCheckConfig {
    enabled: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
    path?: string;
}
/**
 * Validates the optional `healthCheck` field: boolean (e.g. false to disable) or an object
 * configuring enabled, interval, timeout, retries, and path.
 */
export declare function healthCheckErrors(manifest: Record<string, unknown>, displayPath: string): string[];
/**
 * Returns true when health checks are explicitly disabled (healthCheck === false or
 * healthCheck.enabled === false or health path is omitted for unopinionated services).
 */
export declare function isHealthCheckDisabled(manifest?: Record<string, unknown>): boolean;
/**
 * Parses health check configuration from a service manifest or raw healthCheck config object.
 */
export declare function parseHealthCheckConfig(manifestOrConfig: unknown, options?: {
    isUnopinionated?: boolean;
    defaultPath?: string;
}): ParsedHealthCheckConfig;
export declare function validateServiceManifest(value: unknown, displayPath: string): ServiceManifestValidation;
/**
 * Generated-output errors for one service.json. A file that cannot be read or parsed returns none here, because
 * validateServiceManifestFile reports that case.
 */
export declare function generatedFieldErrorsForFile(filePath: string, displayPath: string): string[];
export declare function validateServiceManifestFile(filePath: string, displayPath: string): ServiceManifestValidation;
