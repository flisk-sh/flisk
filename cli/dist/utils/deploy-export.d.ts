import type { DiscoveredResource } from "../types/index.js";
/** The resource types that serve HTTP, which is what a Render web service and a Worker are. */
export declare const EXPORTABLE_TYPES: readonly string[];
/** Health check path a service gets when service.json sets none (the same default the container healthcheck uses). */
export declare const DEFAULT_HEALTH_CHECK_PATH = "/health";
/** Candidate Worker entry points, relative to the resource directory, tried in order when package.json has no main. */
export declare const WORKER_ENTRY_CANDIDATES: readonly string[];
/** A name Render and Cloudflare both accept: lowercase letters, digits and dashes. */
export declare function deployName(name: string): string;
/** The environment variable names a service declares in service.json `env`. Values are never read out. */
export declare function envVarNames(resource: DiscoveredResource): string[];
/** Refuses a resource that does not serve HTTP, so the export never writes a web service for a library or a job. */
export declare function assertExportable(resource: DiscoveredResource): void;
/** A Render Blueprint for the given resources. Every env var is listed by name with `sync: false`, never a value. */
export declare function buildRenderBlueprint(projectRoot: string, resources: readonly DiscoveredResource[]): string;
/** The Worker entry point, relative to the resource directory. */
export declare function workerEntry(resource: DiscoveredResource): string;
/** Validates a --route value: a bare host name such as api.example.com, no scheme, port or path. */
export declare function assertRouteHost(host: string): void;
/**
 * A wrangler.toml for one resource. `outDir` is where the file will be written, so `main` is relative to it.
 * Secrets are listed by name in a comment, for `wrangler secret put`; no value is ever written.
 */
export declare function buildWranglerToml(resource: DiscoveredResource, outDir: string, options?: {
    route?: string;
    now?: Date;
}): string;
