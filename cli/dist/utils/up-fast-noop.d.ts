import type { DiscoveredResource } from "../types/index.js";
import type { AutoPortReport } from "./auto-ports.js";
import { type TiltPortOwner } from "./tilt-port-owner.js";
import { evaluateTiltReadiness } from "./up-readiness.js";
import { type UrlCheck, type UrlTarget } from "./url-check.js";
/** The state a run leaves behind so the next `flisk up` can recognize an unchanged, healthy stack (#4193). */
export declare const UP_STATE_VERSION = 1;
export declare const UP_STATE_FILE = "up-state.json";
/** Flags whose presence means the caller asked for a fresh run rather than the current stack. */
export interface FastNoopFlags {
    force?: boolean;
    dryRun?: boolean;
    ignoreDrift?: boolean;
    ignoreVersion?: boolean;
    only?: string[];
    envFile?: string;
    profile?: string[];
    database?: boolean;
    gateway?: boolean;
    autoPort?: boolean;
    stackName?: string;
    /** The port the caller configured; a different one from the recorded run needs the normal path. */
    configuredTiltPort: number | undefined;
    /** Names and values of the environment variables that change the generated stack. */
    env: NodeJS.ProcessEnv;
}
export interface FastNoopState {
    version: typeof UP_STATE_VERSION;
    fingerprint: string;
    tiltPort: number;
    /** PID of the Tilt that served the recorded run: a different listener means the normal path. */
    tiltPid: number | null;
    stack: string | null;
    services: string[];
    ingressPort: number | null;
    urls: string[];
    /** Resolved ports of the recorded run, replayed in the fast no-op `--json` report. */
    autoPortReport?: AutoPortReport;
}
/**
 * Where a run records its fingerprint. It lives under `~/.flisk/`, away from the generated files Tilt watches, so
 * recording it cannot start a build. Keyed by the project root (not its name): two folders with one project name
 * must not borrow each other's answer.
 */
export declare function statePathFor(projectRoot: string, home?: string): string;
export declare function readFastNoopState(projectRoot: string): FastNoopState | null;
/** Never throws: a read-only home only costs the next run its fast path. */
export declare function writeFastNoopState(projectRoot: string, state: FastNoopState): void;
export declare function clearFastNoopState(projectRoot: string): void;
/**
 * A hash of every input that decides the generated stack: the project config, every service.json and its generated
 * outputs, the master files, the vendored engine, .env, package.json and the environment overrides that reach the
 * engine. A change to any of them must take the normal `up` path.
 */
export declare function stackFingerprint(projectRoot: string, flags: FastNoopFlags): string | null;
/** The URL lines a fast no-op prints, so `--wait` reports the same URLs as a normal start. */
export declare function fastNoopUrls(resources: readonly DiscoveredResource[], ingressPort: number | undefined, gatewayEnabled: boolean): string[];
/** Whether the flags describe a plain `flisk up` (or `flisk up --wait`) of the whole project. */
export declare function isPlainUp(flags: FastNoopFlags): boolean;
interface FastNoopDeps {
    readState: (root: string) => FastNoopState | null;
    fingerprint: (root: string, flags: FastNoopFlags) => string | null;
    tiltJson: (port: number) => Promise<string | null>;
    /** Who owns the listener on the Tilt port. Null means ownership cannot be confirmed. */
    ownerOf: (port: number) => TiltPortOwner | null;
    masterStale: (root: string) => boolean;
    wrappedStale: (root: string) => boolean;
    vendoredStale: (root: string) => boolean;
    drift: (root: string, resources: DiscoveredResource[]) => string[];
    discovery: (root: string) => {
        resources: DiscoveredResource[];
        problems: unknown[];
    };
    staleDisabled: (json: string, root: string) => string[];
    readiness: typeof evaluateTiltReadiness;
    deferred: (resources: DiscoveredResource[]) => Set<string>;
    checkUrls: (targets: readonly UrlTarget[]) => Promise<UrlCheck[]>;
}
export interface FastNoopResult {
    ok: boolean;
    state: FastNoopState;
    services: string[];
    urls: string[];
    /** The probe results for `urls`, in the per-URL shape of `up --json`'s `data.urls`. Empty when nothing is printed. */
    urlChecks: UrlCheck[];
}
/**
 * Answers whether the project's own Tilt is already running the unchanged, healthy stack this `flisk up` would start.
 * Every question is a cheap, read-only check; any doubt falls back to the normal path. Nothing is written here.
 */
export declare function tryFastNoop(projectRoot: string, flags: FastNoopFlags, deps?: Partial<FastNoopDeps>): Promise<FastNoopResult | null>;
export {};
