// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { delimiter, extname } from "node:path";
export function isWindows() {
    return process.platform === "win32";
}
export function tdkOsFor(platformName) {
    if (platformName === "linux")
        return "linux";
    if (platformName === "darwin")
        return "darwin";
    if (platformName === "win32")
        return "windows";
    return null;
}
export function tdkOs() {
    return tdkOsFor(process.platform);
}
export function tdkArchFor(architecture) {
    if (architecture === "x64")
        return "amd64";
    if (architecture === "arm64")
        return "arm64";
    return null;
}
export function tdkArch() {
    return tdkArchFor(process.arch);
}
export function binaryAssetNameFor(platformName, architecture) {
    const osName = tdkOsFor(platformName);
    const archName = tdkArchFor(architecture);
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
/** Installs published before the Flisk rename shipped the binary as `tdk`. */
export function legacyExecutableName() {
    return isWindows() ? "tdk.exe" : "tdk";
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
