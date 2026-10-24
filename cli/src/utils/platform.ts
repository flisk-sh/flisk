// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { delimiter, extname } from "node:path";

export type FliskOs = "linux" | "darwin" | "windows";
export type FliskArch = "amd64" | "arm64";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function fliskOsFor(platformName: string): FliskOs | null {
  if (platformName === "linux") return "linux";
  if (platformName === "darwin") return "darwin";
  if (platformName === "win32") return "windows";
  return null;
}

export function fliskOs(): FliskOs | null {
  return fliskOsFor(process.platform);
}

export function fliskArchFor(architecture: string): FliskArch | null {
  if (architecture === "x64") return "amd64";
  if (architecture === "arm64") return "arm64";
  return null;
}

export function fliskArch(): FliskArch | null {
  return fliskArchFor(process.arch);
}

export function binaryAssetNameFor(platformName: string, architecture: string): string | null {
  const osName = fliskOsFor(platformName);
  const archName = fliskArchFor(architecture);
  if (!osName || !archName) return null;
  if (osName === "windows" && archName !== "amd64") return null;
  const base = `tdk-${osName}-${archName}`;
  return osName === "windows" ? `${base}.exe` : base;
}

export function binaryAssetName(): string | null {
  return binaryAssetNameFor(process.platform, process.arch);
}

export function executableName(): string {
  return isWindows() ? "flisk.exe" : "flisk";
}

export function pathLookups(binName: string, windows = isWindows()): string[] {
  if (!windows) return [binName];
  if (extname(binName)) return [binName];
  return [binName, `${binName}.exe`, `${binName}.cmd`, `${binName}.bat`];
}

export function pathDelimiter(windows = isWindows()): string {
  return windows ? ";" : delimiter;
}
