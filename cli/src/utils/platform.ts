// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { delimiter, extname } from "node:path";

export type TdkOs = "linux" | "darwin" | "windows";
export type TdkArch = "amd64" | "arm64";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function tdkOsFor(platformName: string): TdkOs | null {
  if (platformName === "linux") return "linux";
  if (platformName === "darwin") return "darwin";
  if (platformName === "win32") return "windows";
  return null;
}

export function tdkOs(): TdkOs | null {
  return tdkOsFor(process.platform);
}

export function tdkArchFor(architecture: string): TdkArch | null {
  if (architecture === "x64") return "amd64";
  if (architecture === "arm64") return "arm64";
  return null;
}

export function tdkArch(): TdkArch | null {
  return tdkArchFor(process.arch);
}

export function binaryAssetNameFor(platformName: string, architecture: string): string | null {
  const osName = tdkOsFor(platformName);
  const archName = tdkArchFor(architecture);
  if (!osName || !archName) return null;
  if (osName === "windows" && archName !== "amd64") return null;
  const base = `flisk-${osName}-${archName}`;
  return osName === "windows" ? `${base}.exe` : base;
}

export function binaryAssetName(): string | null {
  return binaryAssetNameFor(process.platform, process.arch);
}

export function executableName(): string {
  return isWindows() ? "flisk.exe" : "flisk";
}

/** Installs published before the Flisk rename shipped the binary as `tdk`. */
export function legacyExecutableName(): string {
  return isWindows() ? "tdk.exe" : "tdk";
}

export function pathLookups(binName: string, windows = isWindows()): string[] {
  if (!windows) return [binName];
  if (extname(binName)) return [binName];
  return [binName, `${binName}.exe`, `${binName}.cmd`, `${binName}.bat`];
}

export function pathDelimiter(windows = isWindows()): string {
  return windows ? ";" : delimiter;
}
