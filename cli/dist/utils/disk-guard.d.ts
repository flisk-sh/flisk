import type { JsonEmitter } from "./json-output.js";
/** Below this much free space nothing is built or started. Override with FLISK_DISK_MIN_GIB. */
export declare const DISK_FAIL_GIB = 5;
/** Below this much free space the run goes on with a warning. Override with FLISK_DISK_WARN_GIB. */
export declare const DISK_WARN_GIB = 15;
export declare const DISK_MIN_ENV = "FLISK_DISK_MIN_GIB";
export declare const DISK_WARN_ENV = "FLISK_DISK_WARN_GIB";
/** The first cleanup offered: Docker's build cache only, safe while a stack is running. */
export declare const DISK_SAFE_CLEANUP = "docker builder prune -f";
export declare const DISK_CLEANUP_FIX: string;
export type StatFs = (path: string) => {
    bavail: number | bigint;
    bsize: number | bigint;
};
export type DiskLevel = "ok" | "warn" | "fail" | "unknown";
export interface DiskAssessment {
    level: DiskLevel;
    /** The smaller of the host and Docker VM free space, in GiB; absent when nothing could be read. */
    freeGib?: number;
    /** Which disk the number came from. */
    source?: "host" | "docker-vm";
    failBelowGib: number;
    warnBelowGib: number;
    message: string;
    fix?: string;
}
export interface DiskGuardInput {
    statfs?: StatFs;
    path?: string;
    env?: Record<string, string | undefined>;
    /** Free GiB of the Docker VM's own data disk, when the caller could read it. */
    vmFreeGib?: number | null;
}
/** The thresholds in effect: the defaults, or the environment variables when they hold a number. */
export declare function diskThresholds(env?: Record<string, string | undefined>): {
    failBelowGib: number;
    warnBelowGib: number;
};
export declare function readHostFreeGib(statfs?: StatFs, path?: string): number | null;
export declare function evaluateDisk(input?: DiskGuardInput): DiskAssessment;
/** Runs a command and returns its stdout, or null when it fails. Injected so tests never start Docker. */
export type RunCommand = (cmd: string, args: string[]) => string | null;
/**
 * Free GiB on the disk that holds Docker's images, which is a VM disk on a Mac (Colima, Docker Desktop) and only grows.
 * Asks the daemon for its data root: when that path exists on this host (Linux) it is read directly, otherwise through
 * `colima ssh`. Returns null when the VM cannot be asked (Docker Desktop has no shell into its VM), so the host number is used.
 */
export declare function readDockerVmFreeGib(deps?: {
    run?: RunCommand;
    statfs?: StatFs;
}): number | null;
export interface DiskGuardDeps extends DiskGuardInput {
    /** Writes the failure to the `--json` result, when the command has one. */
    emit?: JsonEmitter;
    showError?: (message: string, suggestions: string[]) => void;
    warn?: (line: string) => void;
    exit?: (code: number) => never;
    /** Skip the warning text (quiet or --json); the warning still goes into the result. */
    quiet?: boolean;
}
/** The `--json` field that carries a warning; undefined when there is nothing to warn about. */
export declare function diskWarningField(disk: DiskAssessment | undefined): Record<string, unknown> | undefined;
/**
 * The check at the start of `flisk up`: stops below the hard threshold before any build, warns below the soft one.
 * Returns the assessment so the caller can put a warning into its `--json` result.
 */
export declare function enforceDiskGuard(deps?: DiskGuardDeps): DiskAssessment;
