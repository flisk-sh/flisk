// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

type CommandRunner = (command: string, args: string[]) => string;

const run: CommandRunner = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 5000,
    windowsHide: true,
  });

export interface PortOccupant {
  pid: number;
  /** The program's name, without its directory (`postgres`, not `/opt/homebrew/bin/postgres`). */
  command: string;
}

/**
 * The process listening on `port`, or null when it cannot be told (no lsof, Windows, nothing listens, or the process
 * exited before ps could read it). Callers must treat null as "unknown", not as "free".
 */
export function findPortOccupant(
  port: number,
  platform = process.platform,
  commandRunner: CommandRunner = run,
): PortOccupant | null {
  if (platform === "win32") return null;
  try {
    const [first] = commandRunner("lsof", ["-nP", "-t", `-iTCP:${port}`, "-sTCP:LISTEN"])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!first) return null;
    const pid = Number(first);
    const name = commandRunner("ps", ["-p", first, "-o", "comm="]).trim();
    if (!Number.isInteger(pid) || !name) return null;
    return { pid, command: basename(name) };
  } catch {
    // lsof exits 1 when nothing listens, and may be missing.
    return null;
  }
}
