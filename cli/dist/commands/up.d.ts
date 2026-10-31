import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import { type SelectedEnvFile } from "../utils/env-selection.js";
import { nativeWindowsStackRefusal } from "../utils/native-windows.js";
export interface ServiceHealth {
    name: string;
    status: "ready" | "failed" | "starting";
    url?: string;
}
export declare function formatUpSuccess(port: number, options?: {
    appUrls?: string[];
    serviceHealth?: ServiceHealth[];
    showLogsHint?: boolean;
}): string[];
/**
 * The native Windows boundary for a command that starts a stack.
 *
 * It lives here because `flisk up` is where the boundary has always been enforced; the
 * one-command demo flow refuses with the same message before it clones or installs anything.
 */
export declare const nativeWindowsUpRefusal: typeof nativeWindowsStackRefusal;
/** Why `flisk up` cannot work on this host, or null when it may proceed. Docker reachability is only probed in container hosts. */
export declare function hostUpRefusal(host?: import("../utils/agent-host.js").HostInfo, dockerReachable?: () => Promise<boolean>): Promise<string | null>;
export declare function defaultDockerReachable(): Promise<boolean>;
/** Exit status for `flisk up` when generated files no longer match service.json / project.json. */
export declare const DRIFT_EXIT_CODE = 2;
/**
 * Generated service files edited by hand. Only these block `flisk up`: when service.json itself changed, `flisk up` regenerates
 * the outputs, so stale outputs are the normal edit-then-up loop and not drift.
 */
export declare function driftReport(projectRoot: string, resources?: DiscoveredResource[]): string[] | null;
/**
 * Runs before Tilt is started: exits with DRIFT_EXIT_CODE on drift unless `ignoreDrift` is set. With `ignoreDrift` the
 * warning is printed every time, whether or not anything drifted, because the check is skipped and cannot tell.
 */
export declare function enforceDriftGate(projectRoot: string, options: {
    ignoreDrift?: boolean;
    onDrift?: (message: string) => void;
    resources?: DiscoveredResource[];
}, exit?: (code: number) => never): void;
/**
 * Runs before anything starts (also under --dry-run, like the drift gate): a project's `minFliskVersion` in
 * .flisk/project.json that this CLI does not meet, or cannot read, exits with 1 and the same text as `flisk doctor`.
 * `ignoreVersion` skips the check and says so. No minFliskVersion means no check.
 */
export declare function enforceVersionFloor(projectRoot: string, options: {
    ignoreVersion?: boolean;
    onFail?: (message: string) => void;
}, currentVersion?: string, exit?: (code: number) => never): void;
/**
 * Waits for Tilt to exit, unless startup has already failed. A readiness failure reports and exits 1 at once: Tilt keeps
 * running (`flisk down` stops it), so waiting for its exit would hang the command.
 */
export declare function waitForTiltUnlessStartupFailed<T>(tiltRun: Promise<T>, startupFailure: Promise<void>, exit?: (code: number) => never): Promise<T>;
export declare function waitForTiltUi(port: number, timeoutMs?: number): Promise<boolean>;
/**
 * The env file of the run. `flisk up --env-file <path>` replaces the project `.env` for the run, so the
 * file is resolved, read and checked before anything is written or started. Without the option the
 * project `.env` stays the env file of the run, exactly as before.
 *
 * @throws FliskError when the file cannot be used; the run stops before it starts
 */
export declare function selectRunEnvFile(projectRoot: string | null, requested: string | undefined): SelectedEnvFile | undefined;
/** A selection `flisk up` runs as local processes. */
export interface NativeUpSelection {
    projectRoot: string;
    /** No .flisk/project.json yet: `flisk up` adopts the directory as a project. */
    isNewProject: boolean;
    all: DiscoveredResource[];
    selected: DiscoveredResource[];
    dependencies: string[];
}
/**
 * Decides whether `flisk up` runs the selection as local processes (#2229). Returns null for today's Docker + Tilt path, which
 * a project without any `command` service always takes. Outside a project, a directory whose services all declare `command`
 * becomes the project. A project whose .flisk/project.json selects its own Tiltfile (`flisk import tiltfile`) also returns null:
 * Tilt runs that Tiltfile through the generated wrapper, whatever its services declare. Refuses (through `fail`) an unknown
 * stack or service, an invalid service.json, and a run that would mix native and container services.
 */
export declare function selectNativeRun(stackName: string | undefined, only: string[] | undefined, fail: (code: string, message: string, suggestions?: string[]) => never, cwd?: string): NativeUpSelection | null;
export declare const upCommand: Command;
