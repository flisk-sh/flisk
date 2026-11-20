// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readdirSync, rmSync } from "node:fs";
import { basename, dirname, join, win32 } from "node:path";

const UPGRADE_TEMP_PATTERN = /^\.flisk-upgrade-(\d+)-(\d+)$/;

export interface StaleUpgradeCleanupOptions {
  currentPid?: number;
  binaryName?: string;
  platformName?: NodeJS.Platform;
  isPidAlive?: (pid: number) => boolean;
  readdirSync?: typeof readdirSync;
  rmSync?: typeof rmSync;
}

/** True when an error code indicates a Windows in-use / locked executable or directory. */
export function isWindowsBusyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Sibling backup path used on Windows so the locked running binary sits outside the temp folder. */
export function staleBackupPathFor(fliskPath: string): string {
  return `${fliskPath}.old`;
}

/** True when `execPath` is a standalone compiled `flisk` or `flisk.exe` binary. */
export function isStandaloneBinaryExecPath(
  execPath: string,
  platformName: NodeJS.Platform = process.platform,
): boolean {
  const name = (
    platformName === "win32" ? win32.basename(execPath) : basename(execPath)
  ).toLowerCase();
  return name === "flisk" || name === "flisk.exe";
}

function isStaleOldBinaryName(name: string, binaryName?: string): boolean {
  const lower = name.toLowerCase();
  if (lower === "flisk.exe.old" || lower === "flisk.old") return true;
  if (binaryName && lower === `${binaryName.toLowerCase()}.old`) return true;
  return false;
}

/**
 * Best-effort removal of leftover upgrade artifacts in `installDir`:
 * - renamed previous binaries (`flisk.exe.old`, `flisk.old`) left behind when Windows could not
 *   unlink the running executable during self-upgrade;
 * - stale `.flisk-upgrade-<pid>-<timestamp>` temp directories whose owning PID is no longer alive.
 * Never throws: files still mapped by a running process are left for the next invocation.
 */
export function cleanupStaleUpgradeArtifacts(
  installDir: string,
  options: StaleUpgradeCleanupOptions = {},
): string[] {
  const currentPid = options.currentPid ?? process.pid;
  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  const readDir = options.readdirSync ?? readdirSync;
  const remove = options.rmSync ?? rmSync;

  let entries: string[];
  try {
    entries = readDir(installDir);
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const name of entries) {
    if (isStaleOldBinaryName(name, options.binaryName)) {
      try {
        remove(join(installDir, name), { force: true });
        removed.push(name);
      } catch {
        // Still locked by a running process on Windows; retry on next start.
      }
      continue;
    }

    const match = UPGRADE_TEMP_PATTERN.exec(name);
    if (!match) continue;
    const pid = Number.parseInt(match[1] ?? "", 10);
    if (pid === currentPid || isPidAlive(pid)) continue;

    try {
      remove(join(installDir, name), { recursive: true, force: true });
      removed.push(name);
    } catch {
      // Best-effort cleanup; ignore locked folders until the old process exits.
    }
  }

  return removed;
}

/**
 * Cleans up stale upgrade artifacts beside the running executable when invoked as a standalone
 * `flisk` / `flisk.exe` binary. No-op when running under `node` or `bun`.
 */
export function cleanupRunningBinaryArtifacts(
  execPath: string = process.execPath,
  options: StaleUpgradeCleanupOptions = {},
): string[] {
  const platformName = options.platformName ?? process.platform;
  if (!isStandaloneBinaryExecPath(execPath, platformName)) return [];
  const binaryName = platformName === "win32" ? win32.basename(execPath) : basename(execPath);
  const installDir = platformName === "win32" ? win32.dirname(execPath) : dirname(execPath);
  return cleanupStaleUpgradeArtifacts(installDir, { ...options, binaryName, platformName });
}
