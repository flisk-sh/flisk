import type { CheckResult } from "../types/index.js";
import { DISK_CLEANUP_FIX, DISK_FAIL_GIB, DISK_SAFE_CLEANUP, DISK_WARN_GIB, type StatFs } from "./disk-guard.js";
export declare const DISK_SPACE_CHECK = "Disk Space";
export { DISK_CLEANUP_FIX, DISK_FAIL_GIB, DISK_SAFE_CLEANUP, DISK_WARN_GIB };
export declare function checkDiskSpace(statfs?: StatFs, path?: string, vmFreeGib?: number | null): CheckResult;
export declare const DOCKER_DESKTOP_STUCK_FIX = "Quit Docker Desktop completely (whale icon > Quit Docker Desktop), reopen it, and wait until it shows Running. If it keeps getting stuck, check free disk space. Then retry: flisk doctor";
/**
 * Docker Desktop's app process is up but `docker ps` fails: the engine is stopped or stuck, which needs a different fix
 * than "start Docker". Returns the failing check, or null when that is not the situation.
 */
export declare function dockerDesktopStuck(desktopRunning: boolean, platform?: NodeJS.Platform): CheckResult | null;
