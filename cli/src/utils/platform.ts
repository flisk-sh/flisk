// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { release as osRelease } from "node:os";
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
  const base = `flisk-${osName}-${archName}`;
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

/** Where Flisk is running, for advice that differs by host: native Windows, WSL2, Linux or macOS. */
export type PlatformKind = "windows" | "wsl2" | "linux" | "macos" | "other";

export interface PlatformProbe {
  platform?: string;
  env?: Record<string, string | undefined>;
  /** The kernel release string (`os.release()`); WSL2 kernels contain "microsoft". */
  release?: string;
}

/** True inside a WSL distribution (Linux kernel running under Windows). */
export function isWsl(probe: PlatformProbe = {}): boolean {
  const platform = probe.platform ?? process.platform;
  if (platform !== "linux") return false;
  const env = probe.env ?? process.env;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return true;
  return /microsoft|wsl/i.test(probe.release ?? osRelease());
}

export function detectPlatformKind(probe: PlatformProbe = {}): PlatformKind {
  const platform = probe.platform ?? process.platform;
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return isWsl(probe) ? "wsl2" : "linux";
  return "other";
}
