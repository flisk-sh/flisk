// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { release as osRelease } from "node:os";
import { delimiter, extname } from "node:path";
export function isWindows() {
    return process.platform === "win32";
}
export function fliskOsFor(platformName) {
    if (platformName === "linux")
        return "linux";
    if (platformName === "darwin")
        return "darwin";
    if (platformName === "win32")
        return "windows";
    return null;
}
export function fliskOs() {
    return fliskOsFor(process.platform);
}
export function fliskArchFor(architecture) {
    if (architecture === "x64")
        return "amd64";
    if (architecture === "arm64")
        return "arm64";
    return null;
}
export function fliskArch() {
    return fliskArchFor(process.arch);
}
export function binaryAssetNameFor(platformName, architecture) {
    const osName = fliskOsFor(platformName);
    const archName = fliskArchFor(architecture);
    if (!osName || !archName)
        return null;
    if (osName === "windows" && archName !== "amd64")
        return null;
    const base = `flisk-${osName}-${archName}`;
    return osName === "windows" ? `${base}.exe` : base;
}
export function binaryAssetName() {
    return binaryAssetNameFor(process.platform, process.arch);
}
export function executableName() {
    return isWindows() ? "flisk.exe" : "flisk";
}
export function pathLookups(binName, windows = isWindows()) {
    if (!windows)
        return [binName];
    if (extname(binName))
        return [binName];
    return [binName, `${binName}.exe`, `${binName}.cmd`, `${binName}.bat`];
}
export function pathDelimiter(windows = isWindows()) {
    return windows ? ";" : delimiter;
}
/** True inside a WSL distribution (Linux kernel running under Windows). */
export function isWsl(probe = {}) {
    const platform = probe.platform ?? process.platform;
    if (platform !== "linux")
        return false;
    const env = probe.env ?? process.env;
    if (env.WSL_DISTRO_NAME || env.WSL_INTEROP)
        return true;
    return /microsoft|wsl/i.test(probe.release ?? osRelease());
}
export function detectPlatformKind(probe = {}) {
    const platform = probe.platform ?? process.platform;
    if (platform === "win32")
        return "windows";
    if (platform === "darwin")
        return "macos";
    if (platform === "linux")
        return isWsl(probe) ? "wsl2" : "linux";
    return "other";
}
