// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  appendFileSync,
  chmodSync,
  closeSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
} from "node:fs";

/**
 * Size at which a local process's log is rotated to `<service>.log.1` (one old file is kept), so a noisy dev server
 * cannot fill the disk (#3720). Maintainers may tune this number.
 */
export const NATIVE_LOG_MAX_BYTES = 10 * 1024 * 1024;

/** How many run start markers are copied into a fresh log on rotation, so the last runs stay addressable (#4693). */
export const NATIVE_LOG_KEEP_RUNS = 5;

/** Bytes read per step when `flisk logs` reads a log from the end. */
const TAIL_BLOCK_BYTES = 64 * 1024;

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) /;
const RUN_MARKER = /^\[flisk\] run (\d+) (started \(pid (\d+)\)|exited \(code (-?\d+|null)\))$/;

/** A supervisor boundary written into a local-process service log, never shown as service output. */
export interface NativeRunMarker {
  runId: string;
  event: "started" | "exited";
  detail: string;
}

/** One service output line with the run it belongs to; `run` is null for a line written by an older Flisk. */
export interface NativeLogEntry {
  time: string | null;
  text: string;
  run: string | null;
}

/** Parses the `[flisk] run <id> started (pid <pid>)` / `exited (code <n>)` marker written by the supervisor. */
export function parseNativeRunMarker(text: string): NativeRunMarker | null {
  const match = RUN_MARKER.exec(text);
  if (!match) return null;
  return {
    runId: match[1] as string,
    event: (match[2] as string).startsWith("started") ? "started" : "exited",
    detail: match[2] as string,
  };
}

/** True for the three forms `--run` accepts: the two relative selectors or a numeric run id. */
export function isValidNativeRun(value: string): boolean {
  return value === "current" || value === "previous" || /^\d+$/.test(value);
}

function splitBody(raw: string): { time: string | null; text: string } {
  const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
  const match = TIMESTAMP.exec(line);
  return match
    ? { time: match[1] ?? null, text: line.slice(match[0].length) }
    : { time: null, text: line };
}

/**
 * The last `tail` non-empty lines of a log, oldest first, read from the end of the file in blocks so memory follows the
 * size of the answer, not of the file. With `cutoffMs`, reading stops at the first line whose timestamp is older; lines
 * with no timestamp are skipped, as before. A trailing `\r` is dropped. A `tail` of 0 or less reads every line.
 */
export function readLogTail(path: string, tail: number, cutoffMs: number | null = null): string[] {
  const limit = tail > 0 ? tail : Number.POSITIVE_INFINITY;
  const found: string[] = [];
  const fd = openSync(path, "r");
  try {
    let position = statSync(path).size;
    // Bytes of a line whose start lies in a block not read yet.
    let carry: Buffer = Buffer.alloc(0);
    while (found.length < limit) {
      const atStart = position === 0;
      let pieces: Buffer[];
      if (atStart) {
        pieces = [carry];
        carry = Buffer.alloc(0);
      } else {
        const size = Math.min(TAIL_BLOCK_BYTES, position);
        position -= size;
        const block = Buffer.alloc(size);
        readSync(fd, block, 0, size, position);
        const joined = carry.length > 0 ? Buffer.concat([block, carry]) : block;
        pieces = splitLines(joined);
        // The first piece may continue in the previous block; keep it until that block is read.
        carry = pieces.shift() ?? Buffer.alloc(0);
      }
      for (let index = pieces.length - 1; index >= 0 && found.length < limit; index -= 1) {
        let line = pieces[index]?.toString("utf-8") ?? "";
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line) continue;
        if (cutoffMs !== null) {
          const time = TIMESTAMP.exec(line)?.[1];
          if (!time) continue;
          if (Date.parse(time) < cutoffMs) return found.reverse();
        }
        found.push(line);
      }
      if (atStart) break;
    }
  } finally {
    closeSync(fd);
  }
  return found.reverse();
}

/** Splits on `\n` bytes, so a multi-byte character is never cut. */
function splitLines(buffer: Buffer): Buffer[] {
  const pieces: Buffer[] = [];
  let start = 0;
  for (let index = buffer.indexOf(0x0a); index !== -1; index = buffer.indexOf(0x0a, start)) {
    pieces.push(buffer.subarray(start, index));
    start = index + 1;
  }
  pieces.push(buffer.subarray(start));
  return pieces;
}

/** The rotated file first, then the current one, so output stays in the order it was written. */
function logTexts(path: string, includeRotated: boolean): string[] {
  const texts: string[] = [];
  if (includeRotated) texts.push(readText(`${path}.1`));
  texts.push(readText(path));
  return texts.filter((text) => text.length > 0);
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

/** Turns raw log text into output lines with their run id, dropping marker lines. */
function entriesFromText(text: string): NativeLogEntry[] {
  const entries: NativeLogEntry[] = [];
  let activeRun: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw) continue;
    const body = splitBody(raw);
    const marker = parseNativeRunMarker(body.text);
    if (marker) {
      if (marker.event === "started") {
        // A rotation copies the surviving start markers into the fresh file. Seeing an older one again is not a new run.
        if (activeRun !== null && Number(marker.runId) < Number(activeRun)) continue;
        activeRun = marker.runId;
      }
      continue;
    }
    entries.push({ time: body.time, text: body.text, run: activeRun });
  }
  return entries;
}

/** All output lines of a service, from the rotated and current logs, with markers hidden and a `run` on each line. */
export function readNativeRunLog(path: string): NativeLogEntry[] {
  return entriesFromText(logTexts(path, true).join("\n"));
}

/** All output lines of the current file only; used when no `--run` selector was given. */
export function readNativeLogEntries(path: string): NativeLogEntry[] {
  return entriesFromText(logTexts(path, false).join("\n"));
}

function startIdsIn(text: string): string[] {
  const ids: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const body = splitBody(raw);
    const marker = parseNativeRunMarker(body.text);
    if (marker?.event === "started" && !ids.includes(marker.runId)) ids.push(marker.runId);
  }
  return ids;
}

/** Every run id in a service's logs, numeric order oldest first (a run can have written no output). */
export function nativeRunIds(path: string): string[] {
  return [...new Set(logTexts(path, true).flatMap(startIdsIn))].sort(
    (a, b) => Number(a) - Number(b),
  );
}

/** The highest run id already in a service's logs, or null when it has never been supervised. */
export function latestNativeRunId(path: string): string | null {
  const ids = nativeRunIds(path);
  return ids.length > 0 ? (ids[ids.length - 1] ?? null) : null;
}

/** The original start-marker lines to carry into a fresh log after rotation, oldest first. */
function startMarkersToPreserve(path: string): string {
  const byId = new Map<number, string>();
  for (const text of logTexts(path, true)) {
    for (const raw of text.split(/\r?\n/)) {
      const body = splitBody(raw);
      const marker = parseNativeRunMarker(body.text);
      if (marker?.event === "started") {
        const id = Number(marker.runId);
        if (Number.isFinite(id)) byId.set(id, raw.endsWith("\r") ? raw.slice(0, -1) : raw);
      }
    }
  }
  const lines = [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .slice(-NATIVE_LOG_KEEP_RUNS)
    .map(([, line]) => line);
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

function markerLine(runId: string, detail: string): string {
  return `${new Date().toISOString()} [flisk] run ${runId} ${detail}\n`;
}

/** Records the start of one spawn or respawn of a local service. */
export function appendNativeRunStart(
  path: string,
  runId: string,
  pid: number | undefined,
  sizes: Map<string, number>,
  maxBytes: number = NATIVE_LOG_MAX_BYTES,
): void {
  appendNativeLogLine(path, markerLine(runId, `started (pid ${pid ?? 0})`), sizes, maxBytes);
}

/** Records the exit of one spawn or respawn of a local service. */
export function appendNativeRunExit(
  path: string,
  runId: string,
  code: number | null,
  sizes: Map<string, number>,
  maxBytes: number = NATIVE_LOG_MAX_BYTES,
): void {
  appendNativeLogLine(path, markerLine(runId, `exited (code ${code ?? "null"})`), sizes, maxBytes);
}

/**
 * Appends one already formatted line to a local process's log. `sizes` holds the known size of each log (shared by the
 * stdout and stderr writers of one service); when the log reaches `maxBytes`, it is renamed to `<path>.1`, replacing an
 * older one, and the next line starts a fresh file. A log left above the cap by an earlier run is rotated before the
 * first new line. The start markers of the last `NATIVE_LOG_KEEP_RUNS` runs, including the current one, are copied to
 * the fresh file so a rotation can never orphan the run being read (#4693).
 */
export function appendNativeLogLine(
  path: string,
  text: string,
  sizes: Map<string, number>,
  maxBytes: number = NATIVE_LOG_MAX_BYTES,
): void {
  let size = sizes.get(path);
  if (size === undefined) {
    try {
      size = statSync(path).size;
    } catch {
      size = 0;
    }
    if (size >= maxBytes) size = rotate(path);
  }
  appendFileSync(path, text, { mode: 0o600 });
  // Also fix permissions on files left by an earlier run (append's mode only applies on creation).
  chmodSync(path, 0o600);
  size += Buffer.byteLength(text);
  if (size >= maxBytes) size = rotate(path);
  sizes.set(path, size);
}

/** Moves the log to `<path>.1`, returns the new size of the current log, and preserves recent run markers. */
function rotate(path: string): number {
  const preserved = startMarkersToPreserve(path);
  let renamed = false;
  try {
    renameSync(path, `${path}.1`);
    renamed = true;
  } catch {
    // A rename can fail (for example while another program holds the old file open on Windows); keep appending.
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }
  if (!renamed || !preserved) return 0;
  try {
    appendFileSync(path, preserved, { mode: 0o600 });
    chmodSync(path, 0o600);
    return Buffer.byteLength(preserved);
  } catch {
    return 0;
  }
}
