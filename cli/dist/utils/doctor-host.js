// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
import { DISK_CLEANUP_FIX, DISK_FAIL_GIB, DISK_SAFE_CLEANUP, DISK_WARN_GIB, evaluateDisk, } from "./disk-guard.js";
export const DISK_SPACE_CHECK = "Disk Space";
// Docker Desktop keeps images and containers in one large disk image. When the host disk fills up, the engine
// stops answering while the Docker Desktop app keeps running, so `flisk up` waits with no visible error.
// The thresholds and the cleanup text live in disk-guard.ts, shared with `flisk up` and `flisk down`.
export { DISK_CLEANUP_FIX, DISK_FAIL_GIB, DISK_SAFE_CLEANUP, DISK_WARN_GIB };
export function checkDiskSpace(statfs = statfsSync, path = homedir(), vmFreeGib) {
    const disk = evaluateDisk({ statfs, path, vmFreeGib });
    if (disk.level === "unknown") {
        return { name: DISK_SPACE_CHECK, didPass: true, isSkipped: true, message: disk.message };
    }
    if (disk.level === "fail") {
        return { name: DISK_SPACE_CHECK, didPass: false, message: disk.message, fix: disk.fix };
    }
    if (disk.level === "warn") {
        return {
            name: DISK_SPACE_CHECK,
            didPass: false,
            isWarning: true,
            message: disk.message,
            fix: disk.fix,
        };
    }
    return { name: DISK_SPACE_CHECK, didPass: true, message: disk.message };
}
export const DOCKER_DESKTOP_STUCK_FIX = "Quit Docker Desktop completely (whale icon > Quit Docker Desktop), reopen it, and wait until it shows Running. If it keeps getting stuck, check free disk space. Then retry: flisk doctor";
/**
 * Docker Desktop's app process is up but `docker ps` fails: the engine is stopped or stuck, which needs a different fix
 * than "start Docker". Returns the failing check, or null when that is not the situation.
 */
export function dockerDesktopStuck(desktopRunning, platform = process.platform) {
    if (platform !== "darwin" || !desktopRunning)
        return null;
    return {
        name: "Container Runtime",
        didPass: false,
        message: "Docker Desktop is open, but its engine is not responding",
        fix: DOCKER_DESKTOP_STUCK_FIX,
    };
}
