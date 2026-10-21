// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseTiltProcesses } from "./doctor-wiring.js";

type CommandRunner = (command: string, args: string[]) => string;

const run: CommandRunner = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 5000,
    windowsHide: true,
  });

export interface TiltPortOwner {
  pid: number;
  /** The project root of the Tiltfile (`tilt up -f <root>/.tdk/.tdk-out/Tiltfile`). */
  root: string;
}

/**
 * The project whose `tilt up` listens on `port`, or null when it cannot be told (no lsof, Windows, a Tilt started
 * without `-f`, a listener that is not Tilt). Callers must treat null as "unknown", not as "not mine".
 */
export function findTiltPortOwner(
  port: number,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): TiltPortOwner | null {
  if (platform === "win32") return null;
  try {
    const pids = commandRunner("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const pid of pids) {
      const command = commandRunner("ps", ["-p", pid, "-o", "command="]).trim();
      const [owner] = parseTiltProcesses(`${pid} ${command}`);
      if (owner) return owner;
    }
  } catch {
    // lsof exits 1 when nothing listens, and may be missing.
  }
  return null;
}

/** Symlinked checkouts (macOS /tmp -> /private/tmp) must not make a project look foreign to itself. */
function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** Whether `owner` is another project's Tilt, as opposed to this project's or unknown. */
export function isForeignTilt(owner: TiltPortOwner | null, projectRoot: string): boolean {
  return owner !== null && canonical(owner.root) !== canonical(projectRoot);
}

export interface ClassifiedTiltPorts {
  /** Ports whose Tilt is this project's, or whose owner cannot be told (treated as before: this environment). */
  running: number[];
  /** Ports held by another project's Tilt. */
  foreign: { port: number; root: string }[];
}

/** Split the candidate Tilt UI ports that answer into this project's and other projects'. */
export async function classifyTiltPorts(
  candidatePorts: number[],
  projectRoot: string,
  isServing: (port: number) => Promise<boolean>,
  ownerOf: (port: number) => TiltPortOwner | null = findTiltPortOwner,
): Promise<ClassifiedTiltPorts> {
  const result: ClassifiedTiltPorts = { running: [], foreign: [] };
  for (const port of candidatePorts) {
    if (!(await isServing(port))) continue;
    const owner = ownerOf(port);
    if (owner && isForeignTilt(owner, projectRoot)) result.foreign.push({ port, root: owner.root });
    else result.running.push(port);
  }
  return result;
}
