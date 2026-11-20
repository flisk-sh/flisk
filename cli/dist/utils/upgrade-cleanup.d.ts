import { readdirSync, rmSync } from "node:fs";
export interface StaleUpgradeCleanupOptions {
    currentPid?: number;
    binaryName?: string;
    platformName?: NodeJS.Platform;
    isPidAlive?: (pid: number) => boolean;
    readdirSync?: typeof readdirSync;
    rmSync?: typeof rmSync;
}
/** True when an error code indicates a Windows in-use / locked executable or directory. */
export declare function isWindowsBusyError(err: unknown): boolean;
/** Sibling backup path used on Windows so the locked running binary sits outside the temp folder. */
export declare function staleBackupPathFor(fliskPath: string): string;
/** True when `execPath` is a standalone compiled `flisk` or `flisk.exe` binary. */
export declare function isStandaloneBinaryExecPath(execPath: string, platformName?: NodeJS.Platform): boolean;
/**
 * Best-effort removal of leftover upgrade artifacts in `installDir`:
 * - renamed previous binaries (`flisk.exe.old`, `flisk.old`) left behind when Windows could not
 *   unlink the running executable during self-upgrade;
 * - stale `.flisk-upgrade-<pid>-<timestamp>` temp directories whose owning PID is no longer alive.
 * Never throws: files still mapped by a running process are left for the next invocation.
 */
export declare function cleanupStaleUpgradeArtifacts(installDir: string, options?: StaleUpgradeCleanupOptions): string[];
/**
 * Cleans up stale upgrade artifacts beside the running executable when invoked as a standalone
 * `flisk` / `flisk.exe` binary. No-op when running under `node` or `bun`.
 */
export declare function cleanupRunningBinaryArtifacts(execPath?: string, options?: StaleUpgradeCleanupOptions): string[];
