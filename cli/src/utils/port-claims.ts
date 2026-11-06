// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Two `flisk up` runs in different projects both ask "is 10350 (or 8080, or 15432) free?", get yes, and both take it, because
 * nothing is bound until Tilt and Docker start seconds later. One project then fails to start. A claim is a short-lived file
 * per port, created exclusively, that closes the gap between the probe and the bind: the second run sees the claim and moves
 * to the next port. It only covers the start-up window. Once the port is really bound the probe itself says it is taken.
 */

/** Long enough for Tilt and Docker to bind after the probe, short enough that a crashed run never blocks a port for long. */
export const PORT_CLAIM_TTL_MS = 120_000;

interface ClaimRecord {
  pid: number;
  owner: string;
  at: number;
}

export interface PortClaimOptions {
  /** Where claim files live. Defaults to a folder in the OS temp directory, shared by every project on the machine. */
  dir?: string;
  now?: () => number;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean;
  ttlMs?: number;
}

export function defaultClaimDir(): string {
  return path.join(tmpdir(), "flisk-port-claims");
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function readClaim(file: string): ClaimRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ClaimRecord>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.owner === "string" &&
      typeof parsed.at === "number"
    ) {
      return { pid: parsed.pid, owner: parsed.owner, at: parsed.at };
    }
  } catch {
    // An unreadable or half-written claim is treated as stale below.
  }
  return null;
}

/**
 * A claim function for one project. `claim(port)` is true when this project now holds the port: nobody else holds it, or the
 * holder is gone or expired, or the holder is this same project (a second `up` in one project is handled by the Tilt check).
 * It never throws: when the claim folder cannot be written, claiming is skipped and the old probe-only behaviour applies.
 */
export function createPortClaimer(
  owner: string,
  options: PortClaimOptions = {},
): (port: number) => boolean {
  const dir = options.dir ?? defaultClaimDir();
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const alive = options.isProcessAlive ?? processIsAlive;
  const ttl = options.ttlMs ?? PORT_CLAIM_TTL_MS;

  const record = (): string => JSON.stringify({ pid, owner, at: now() } satisfies ClaimRecord);

  return (port) => {
    const file = path.join(dir, `${port}.json`);
    try {
      mkdirSync(dir, { recursive: true });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          writeFileSync(file, record(), { flag: "wx" });
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
        const held = readClaim(file);
        if (held?.owner === owner) {
          writeFileSync(file, record());
          return true;
        }
        const stale = held === null || now() - held.at > ttl || !alive(held.pid);
        if (!stale) return false;
        // Two runs can both see the stale file. Only one unlink and one exclusive create wins; the other gets EEXIST again.
        try {
          unlinkSync(file);
        } catch {
          // Already removed by the other run.
        }
      }
      return false;
    } catch {
      return true;
    }
  };
}
