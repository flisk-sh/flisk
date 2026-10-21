import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import { type SelectedEnvFile } from "../utils/env-selection.js";
export declare function formatUpSuccess(port: number, appUrls?: string[]): string[];
export declare function nativeWindowsUpRefusal(platform: string, allowNativeWindows?: string): string | null;
/** Why `tdk up` cannot work on this host, or null when it may proceed. Docker reachability is only probed in container hosts. */
export declare function hostUpRefusal(host?: import("../utils/agent-host.js").HostInfo, dockerReachable?: () => Promise<boolean>): Promise<string | null>;
/** Exit status for `tdk up` when generated files no longer match service.json / project.json. */
export declare const DRIFT_EXIT_CODE = 2;
/**
 * Generated service files edited by hand. Only these block `tdk up`: when service.json itself changed, `tdk up` regenerates
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
 * Runs before anything starts (also under --dry-run, like the drift gate): a project's `minTdkVersion` in
 * .tdk/project.json that this CLI does not meet, or cannot read, exits with 1 and the same text as `tdk doctor`.
 * `ignoreVersion` skips the check and says so. No minTdkVersion means no check.
 */
export declare function enforceVersionFloor(projectRoot: string, options: {
    ignoreVersion?: boolean;
    onFail?: (message: string) => void;
}, currentVersion?: string, exit?: (code: number) => never): void;
/**
 * Waits for Tilt to exit, unless startup has already failed. A readiness failure reports and exits 1 at once: Tilt keeps
 * running (`tdk down` stops it), so waiting for its exit would hang the command.
 */
export declare function waitForTiltUnlessStartupFailed<T>(tiltRun: Promise<T>, startupFailure: Promise<void>, exit?: (code: number) => never): Promise<T>;
/**
 * The env file of the run. `tdk up --env-file <path>` replaces the project `.env` for the run, so the
 * file is resolved, read and checked before anything is written or started. Without the option the
 * project `.env` stays the env file of the run, exactly as before.
 *
 * @throws TdkError when the file cannot be used; the run stops before it starts
 */
export declare function selectRunEnvFile(projectRoot: string | null, requested: string | undefined): SelectedEnvFile | undefined;
export declare const upCommand: Command;
