// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The message native Windows gets when a command needs a stack.
 *
 * Native Windows runs services that declare a `command` as local processes, and `flisk demo` falls back
 * to its local-process demo. For a container stack it is inspection-only: `flisk --version`, `flisk doctor`
 * and `flisk up --dry-run` work, and starting the stack needs Ubuntu on WSL2. `flisk up` and the
 * one-command flow of a Docker starter refuse with this message before they touch the machine.
 */
export const NATIVE_WINDOWS_REFUSAL = "Landscape startup needs Ubuntu on WSL2. Native Windows runs only services that declare a command, as local processes.";
export const WINDOWS_GUIDE_URL = "https://github.com/flisk-sh/flisk/blob/main/docs/setup/windows.md";
/**
 * The one next step for someone on native Windows: open Ubuntu (WSL2) and run Flisk there, with the exact commands.
 */
export const NATIVE_WINDOWS_NEXT_STEP = [
    "You are on Windows. Open Ubuntu (WSL2) and run Flisk there:",
    "  1. In PowerShell (as administrator): wsl --install -d Ubuntu",
    "  2. Open the Ubuntu app, then run:",
    "       curl -fsSL https://flisk.sh/install.sh | sh",
    "       flisk up",
    `Windows guide: ${WINDOWS_GUIDE_URL}`,
].join("\n");
/** The refusal plus the next step, as `flisk up` prints it. */
export const NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP = `${NATIVE_WINDOWS_REFUSAL}\n${NATIVE_WINDOWS_NEXT_STEP}`;
/**
 * Why a command that starts a stack cannot run on this host, or null when it may proceed.
 *
 * `FLISK_ALLOW_NATIVE_WINDOWS=1` is the unsupported escape hatch that lets it try anyway.
 */
export function nativeWindowsStackRefusal(platform, allowNativeWindows) {
    if (platform !== "win32" || allowNativeWindows === "1")
        return null;
    return NATIVE_WINDOWS_REFUSAL_WITH_NEXT_STEP;
}
/**
 * What `flisk import` tells someone on native Windows before it imports, or null elsewhere.
 *
 * Import itself works in PowerShell, so it is not refused. But Windows users who forked a Docker app read this nowhere until
 * `flisk up` refused, after they had imported and set up the project on the Windows side (#3246). This says it up front.
 * `FLISK_ALLOW_NATIVE_WINDOWS=1` (the unsupported escape hatch) silences it, like the refusal.
 */
export function nativeWindowsImportNotice(platform, allowNativeWindows) {
    if (platform !== "win32" || allowNativeWindows === "1")
        return null;
    return [
        "Note for Windows: import works here, but `flisk up` for container services (an image or a Dockerfile) needs Ubuntu on WSL2.",
        "  Services that declare a command run on Windows as local processes.",
        "  To start the imported app, clone it inside Ubuntu (~/, not /mnt/c or D:\\) with Docker Desktop's WSL integration on,",
        "  and install Node and Tilt in Ubuntu too.",
        `  Windows guide: ${WINDOWS_GUIDE_URL}`,
    ].join("\n");
}
