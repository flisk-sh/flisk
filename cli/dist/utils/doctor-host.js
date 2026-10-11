// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
export const DISK_SPACE_CHECK = "Disk Space";
const GIB = 1024 ** 3;
// Docker Desktop keeps images and containers in one large disk image. When the host disk fills up, the engine
// stops answering while the Docker Desktop app keeps running, so `tdk up` waits with no visible error.
export const DISK_FAIL_GIB = 2;
export const DISK_WARN_GIB = 10;
export const DISK_CLEANUP_FIX = [
    "Free disk space, then retry: tdk doctor",
    "  docker system prune -af        # unused images and build cache (needs Docker running)",
    "  npm cache clean --force",
    "  bun pm cache rm",
    "  brew cleanup -s",
].join("\n");
export function checkDiskSpace(statfs = statfsSync, path = homedir()) {
    let freeGib;
    try {
        const stats = statfs(path);
        freeGib = (Number(stats.bavail) * Number(stats.bsize)) / GIB;
    }
    catch {
        return {
            name: DISK_SPACE_CHECK,
            didPass: true,
            isSkipped: true,
            message: "Could not read free disk space",
        };
    }
    const shown = `${freeGib.toFixed(1)} GB free`;
    if (freeGib < DISK_FAIL_GIB) {
        return {
            name: DISK_SPACE_CHECK,
            didPass: false,
            message: `${shown}: Docker cannot build or start containers`,
            fix: DISK_CLEANUP_FIX,
        };
    }
    if (freeGib < DISK_WARN_GIB) {
        return {
            name: DISK_SPACE_CHECK,
            didPass: false,
            isWarning: true,
            message: `${shown}: image builds may fail`,
            fix: DISK_CLEANUP_FIX,
        };
    }
    return { name: DISK_SPACE_CHECK, didPass: true, message: shown };
}
export const DOCKER_DESKTOP_STUCK_FIX = "Quit Docker Desktop completely (whale icon > Quit Docker Desktop), reopen it, and wait until it shows Running. If it keeps getting stuck, check free disk space. Then retry: tdk doctor";
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
