import type { DiscoveredResource } from "../types/index.js";
/**
 * `"port": "auto"` and `flisk up --auto-port` are run-time choices (#4683). The manifest keeps the word `auto`, and the
 * chosen number lives only in this machine-local state file, never in service.json or generated output. A worktree has its
 * own `.flisk`, so two checkouts can hold two different ports for the same service.
 */
export type DeclaredPort = number | "auto";
export declare const AUTO_PORT: "auto";
export declare function isAutoPort(value: unknown): value is "auto";
/** The resolved value of `port` in a discovered manifest, before any run-time overlay. */
export declare function declaredPortOf(resource: DiscoveredResource): DeclaredPort | undefined;
interface SavedPort {
    port: number;
    appType: string | undefined;
}
export declare function autoPortStatePath(projectRoot: string): string;
export declare function readAutoPortState(projectRoot: string): Map<string, SavedPort>;
/** The port range a service uses when its port is `auto`. Unknown types use the backend-compatible range. */
export declare function autoPortRange(resource: DiscoveredResource): {
    base: number;
    min: number;
    max: number;
    range: string;
};
/** The Compose/Tilt environment variable that carries a service's resolved port into generated `${...}` placeholders. */
export declare function autoPortEnvName(resource: DiscoveredResource): string;
export declare function overlayResolvedPorts(resources: readonly DiscoveredResource[], resolved: ReadonlyMap<string, number>, previous?: ReadonlyMap<string, number>): DiscoveredResource[];
/**
 * Overlay the ports remembered from an earlier `flisk up` so status/open/resources report the same addresses. A service
 * that received its port from `--auto-port` keeps that choice on a later plain `flisk up`, even though its manifest
 * declares a number: the saved assignment is this checkout's, while the manifest port is only the fallback when the
 * saved one left the range.
 */
export declare function applySavedAutoPorts(resources: readonly DiscoveredResource[], projectRoot: string | null | undefined): DiscoveredResource[];
export interface ResolveAutoPortsOptions {
    /** `--auto-port`: apply to every service in this run, even manifests that declare a fixed number. */
    force?: boolean;
    /** Every resource in the project, including ones not selected, so a fixed port elsewhere is still reserved. */
    all?: readonly DiscoveredResource[];
    /** A claimer from port-claims.ts. A dry run passes one that always succeeds and does not write state. */
    claim?: (port: number) => boolean;
    /** Port probe override for tests. */
    isFree?: (port: number) => Promise<boolean>;
    dryRun?: boolean;
}
export interface AutoPortReport {
    autoPorts: Array<{
        name: string;
        port: number;
        appType: string | undefined;
        range: string;
        source: "manifest" | "flag";
    }>;
    portsBeforeAuto: Array<{
        name: string;
        port: number;
    }>;
}
export declare function autoPortReportFromResources(resources: readonly DiscoveredResource[]): AutoPortReport;
export interface AutoPortResolution {
    /** Resource name to chosen port, for every service treated as auto in this run. */
    ports: Map<string, number>;
    /** The original declared port for each auto service; used to rewrite dependency URLs. */
    previousPorts: Map<string, number>;
    /** Services with a resolved port, overlaid without touching service.json. */
    resources: DiscoveredResource[];
    /** Machine-readable details for `flisk up --json`. */
    report: AutoPortReport;
    /** Environment variables to pass to Docker/Tilt for `${...}` placeholders in generated files. */
    env: Record<string, string>;
}
/**
 * Choose a free port for every `auto` service (and every service under `--auto-port`), reusing this checkout's saved port
 * while it is still free. Fixed ports and their conflict errors are untouched when `force` is false, except a service
 * that already holds a saved assignment from an earlier `--auto-port`: its manifest number is the fallback, not the
 * port this checkout runs on.
 */
export declare function resolveAutoPorts(resources: readonly DiscoveredResource[], projectRoot: string, options?: ResolveAutoPortsOptions): Promise<AutoPortResolution>;
export {};
