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
