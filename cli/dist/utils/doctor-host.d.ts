import type { CheckResult } from "../types/index.js";
export declare const DISK_SPACE_CHECK = "Disk Space";
export declare const DISK_FAIL_GIB = 2;
export declare const DISK_WARN_GIB = 10;
export declare const DISK_CLEANUP_FIX: string;
type StatFs = (path: string) => {
    bavail: number | bigint;
    bsize: number | bigint;
};
export declare function checkDiskSpace(statfs?: StatFs, path?: string): CheckResult;
export declare const DOCKER_DESKTOP_STUCK_FIX = "Quit Docker Desktop completely (whale icon > Quit Docker Desktop), reopen it, and wait until it shows Running. If it keeps getting stuck, check free disk space. Then retry: tdk doctor";
/**
 * Docker Desktop's app process is up but `docker ps` fails: the engine is stopped or stuck, which needs a different fix
 * than "start Docker". Returns the failing check, or null when that is not the situation.
 */
export declare function dockerDesktopStuck(desktopRunning: boolean, platform?: NodeJS.Platform): CheckResult | null;
export {};
