// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CheckResult } from "../types/index.js";
import { type ColimaStatus, checkColima } from "./colima.js";
import { parseSizeToBytes } from "./docker-build-cache.js";
import { FliskError } from "./errors.js";

const execFilePromise = promisify(execFile);
const GIB = 1024 ** 3;

export const COLIMA_DISK_CHECK = "Colima Disk";
/** The disk file is a problem when it holds this many times what Docker reports... */
export const COLIMA_DISK_RATIO = 3;
/** ...and the difference is at least this many GiB, so a small VM never warns. */
export const COLIMA_DISK_MIN_GAP_GIB = 5;

export const COLIMA_TRIM_COMMAND = "colima ssh -- sudo fstrim -av";

export interface ColimaDiskReport {
  /** Space the VM's disk file takes on the Mac (allocated blocks, not the sparse apparent size). */
  diskFileBytes: number;
  /** Images, containers, volumes and build cache, as `docker system df` reports them. */
  dockerBytes: number;
  /** diskFileBytes / dockerBytes, or null when Docker reports nothing. */
  ratio: number | null;
}

export interface ColimaDiskDeps {
  /** Bytes the disk file takes on the host, or null when there is none. */
  diskFileBytes(): number | null;
  /** The `docker system df --format "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"` output. */
  dockerDf(): Promise<string>;
  colimaStatus(): ColimaStatus;
}

/** Lima keeps Colima's data disk here; the default profile is named "colima". */
export function colimaDiskPath(home: string = homedir()): string {
  return join(home, ".lima", "_disks", "colima", "datadisk");
}

/** Allocated bytes of the (sparse) disk file: `blocks * 512`, not its apparent size. */
export function readColimaDiskFileBytes(path: string = colimaDiskPath()): number | null {
  try {
    const stat = statSync(path);
    return stat.blocks * 512;
  } catch {
    return null;
  }
}

/** Sums the Size column of every row of `docker system df` (images, containers, volumes, build cache). */
export function sumDockerUsageBytes(dfOutput: string): number {
  let total = 0;
  for (const line of dfOutput.split(/\r?\n/)) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    total += parseSizeToBytes((parts[2] ?? "").trim());
  }
  return total;
}

export function defaultColimaDiskDeps(): ColimaDiskDeps {
  return {
    diskFileBytes: () => readColimaDiskFileBytes(),
    dockerDf: async () => {
      const { stdout } = await execFilePromise(
        "docker",
        ["system", "df", "--format", "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"],
        { encoding: "utf-8", timeout: 15_000, windowsHide: true },
      );
      return stdout;
    },
    colimaStatus: () => checkColima(),
  };
}

export function formatBytes(bytes: number): string {
  return bytes >= GIB ? `${(bytes / GIB).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** True when the disk file holds far more than Docker uses, so a trim would return space to the Mac. */
export function isColimaDiskBloated(report: ColimaDiskReport): boolean {
  return (
    report.diskFileBytes - report.dockerBytes >= COLIMA_DISK_MIN_GAP_GIB * GIB &&
    (report.dockerBytes === 0 || report.diskFileBytes > report.dockerBytes * COLIMA_DISK_RATIO)
  );
}

/** Reads the disk file and Docker usage; null when this is not a running Colima VM or either cannot be read. */
export async function readColimaDisk(
  deps: ColimaDiskDeps = defaultColimaDiskDeps(),
): Promise<ColimaDiskReport | null> {
  const colima = deps.colimaStatus();
  if (!colima.isColima || !colima.running) return null;
  const diskFileBytes = deps.diskFileBytes();
  if (diskFileBytes === null) return null;
  try {
    const dockerBytes = sumDockerUsageBytes(await deps.dockerDf());
    return {
      diskFileBytes,
      dockerBytes,
      ratio: dockerBytes > 0 ? diskFileBytes / dockerBytes : null,
    };
  } catch {
    return null;
  }
}

/** `flisk doctor`: reports the Colima disk file against Docker's own usage and warns when it is over 3x. */
export async function checkColimaDisk(
  deps: ColimaDiskDeps = defaultColimaDiskDeps(),
): Promise<CheckResult & { colimaDisk?: ColimaDiskReport }> {
  const report = await readColimaDisk(deps);
  if (!report) {
    return {
      name: COLIMA_DISK_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Docker does not run on a Colima VM, or its disk file could not be read",
    };
  }
  const summary = `disk file ${formatBytes(report.diskFileBytes)} on the Mac, Docker uses ${formatBytes(report.dockerBytes)}`;
  if (isColimaDiskBloated(report)) {
    return {
      name: COLIMA_DISK_CHECK,
      didPass: false,
      isWarning: true,
      message: `${summary}: the disk file only shrinks when the VM is trimmed`,
      fix: `Run flisk doctor --fix (or ${COLIMA_TRIM_COMMAND}) to give the space back to the Mac`,
      colimaDisk: report,
    };
  }
  return { name: COLIMA_DISK_CHECK, didPass: true, message: summary, colimaDisk: report };
}

export type ColimaTrimRunner = () => Promise<void>;

export const runColimaTrim: ColimaTrimRunner = async () => {
  try {
    await execFilePromise("colima", ["ssh", "--", "sudo", "fstrim", "-av"], {
      encoding: "utf-8",
      timeout: 300_000,
      windowsHide: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FliskError(message.split(/\r?\n/)[0] ?? message, [
      `Run it by hand: ${COLIMA_TRIM_COMMAND}`,
      "Check the container engine with: flisk doctor",
    ]);
  }
};

/**
 * Trims the Colima VM and says how much the disk file shrank on the Mac. Null when Docker is not on a running
 * Colima VM. Pruning only frees space inside the VM, so this is what makes the Mac's free space grow.
 */
export async function trimColimaAndMeasure(
  options: {
    status?: ColimaStatus;
    diskFileBytes?: () => number | null;
    trim?: ColimaTrimRunner;
  } = {},
): Promise<{ returnedBytes: number; before: number | null; after: number | null } | null> {
  const status = options.status ?? checkColima();
  if (!status.isColima || !status.running) return null;
  const read = options.diskFileBytes ?? (() => readColimaDiskFileBytes());
  const before = read();
  await (options.trim ?? runColimaTrim)();
  const after = read();
  const returnedBytes = before !== null && after !== null ? Math.max(0, before - after) : 0;
  return { returnedBytes, before, after };
}
