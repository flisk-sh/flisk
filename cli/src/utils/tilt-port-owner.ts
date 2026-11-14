// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseTiltProcesses } from "./doctor-wiring.js";
import { findTiltProcessIdsOnPort, stopTiltProcessIds } from "./tilt-process.js";

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
  /** The project root of the Tiltfile (`tilt up -f <root>/.flisk/.flisk-out/Tiltfile`). */
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

/** Whether `owner` is confirmed to belong to this project's Tiltfile. */
export function isOwnTilt(owner: TiltPortOwner | null, projectRoot: string): boolean {
  return owner !== null && canonical(owner.root) === canonical(projectRoot);
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

export interface ProjectTiltPorts extends ClassifiedTiltPorts {
  /**
   * Ports in `running` that only the saved port found and whose Tilt is confirmed to belong to this project.
   * Unknown-owner listeners on a stale saved port are excluded so `--force` never stops an unconfirmed process.
   */
  savedRunning: number[];
  /**
   * The saved port serves a Tilt whose owner could not be identified (Windows, or no lsof/ps). It is not counted as this
   * project's in `running`, and `--force` must refuse rather than start a second Tilt beside it.
   */
  unknownSaved: number[];
}

/**
 * The Tilt UI ports `flisk up` treats as this project's running Tilt. The watched ports are classified as before. The port
 * the last `flisk up` saved is checked too: a project whose first run moved off 10350 (another project's Tilt held it) keeps
 * its Tilt on that port, and a second run that looked at 10350 alone started another Tilt for the same Tiltfile on the next
 * free port (#4165). The saved port only adds to `running`. Another project's Tilt on it is not reported in `foreign`,
 * because this run never asked for that port. Only confirmed project-owned saved ports enter `savedRunning` for `--force`.
 */
export async function findProjectTiltPorts(options: {
  watchedPorts: number[];
  savedPort: number | null;
  projectRoot: string;
  isServing: (port: number) => Promise<boolean>;
  ownerOf?: (port: number) => TiltPortOwner | null;
}): Promise<ProjectTiltPorts> {
  const ownerOf = options.ownerOf ?? findTiltPortOwner;
  const confirmedWatched: number[] = [];
  const unknownWatched: number[] = [];
  const foreign: { port: number; root: string }[] = [];
  for (const port of options.watchedPorts) {
    if (!(await options.isServing(port))) continue;
    const owner = ownerOf(port);
    if (owner && isForeignTilt(owner, options.projectRoot)) {
      foreign.push({ port, root: owner.root });
    } else if (isOwnTilt(owner, options.projectRoot)) {
      confirmedWatched.push(port);
    } else {
      unknownWatched.push(port);
    }
  }
  const watchedRunning = [...confirmedWatched, ...unknownWatched];
  const savedPort = options.savedPort;
  if (savedPort === null || options.watchedPorts.includes(savedPort)) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  if (!(await options.isServing(savedPort))) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  const savedOwner = ownerOf(savedPort);
  if (isOwnTilt(savedOwner, options.projectRoot) && savedOwner !== null) {
    // Prefer confirmed project ownership over an unknown watched listener (e.g. another project's plain `tilt up` without `-f`).
    return {
      running: [...confirmedWatched, savedPort],
      foreign,
      savedRunning: [savedPort],
      unknownSaved: [],
    };
  }
  if (isForeignTilt(savedOwner, options.projectRoot)) {
    return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
  }
  // Unknown ownership is not confirmation: the saved listener is never reported as this project's in `running`. It is
  // returned in `unknownSaved` so --force can refuse rather than start a second Tilt beside it.
  if (confirmedWatched.length > 0) {
    return { running: confirmedWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
  }
  return { running: unknownWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
}

/**
 * Stop a Tilt on `port` only after re-verifying that the current listener is a `tilt` process owned by `projectRoot`
 * (and matching `expectedOwner.pid` when provided). Prevents `--force` from killing an unrelated or unknown-owner Tilt
 * that reused a stale saved port.
 */
export function stopOwnedTiltOnPort(
  port: number,
  projectRoot: string,
  expectedOwner?: TiltPortOwner,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): number[] {
  const currentOwner = findTiltPortOwner(port, platform, commandRunner);
  if (!isOwnTilt(currentOwner, projectRoot) || currentOwner === null) {
    return [];
  }
  if (expectedOwner && currentOwner.pid !== expectedOwner.pid) {
    return [];
  }
  const tiltPids = findTiltProcessIdsOnPort(port, platform, commandRunner);
  if (!tiltPids.includes(currentOwner.pid)) {
    return [];
  }
  return stopTiltProcessIds([currentOwner.pid], platform, commandRunner);
}
