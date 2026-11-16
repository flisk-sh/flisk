// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import {
  appendFileSync,
  chmodSync,
  closeSync,
  openSync,
  readSync,
  renameSync,
  statSync,
} from "node:fs";

/**
 * Size at which a local process's log is rotated to `<service>.log.1` (one old file is kept), so a noisy dev server
 * cannot fill the disk (#3720). Maintainers may tune this number.
 */
export const NATIVE_LOG_MAX_BYTES = 10 * 1024 * 1024;

/** Bytes read per step when `flisk logs` reads a log from the end. */
const TAIL_BLOCK_BYTES = 64 * 1024;

const TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) /;

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

/**
 * Appends one already formatted line to a local process's log. `sizes` holds the known size of each log (shared by the
 * stdout and stderr writers of one service); when the log reaches `maxBytes`, it is renamed to `<path>.1`, replacing an
 * older one, and the next line starts a fresh file. A log left above the cap by an earlier run is rotated before the
 * first new line.
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

/** Moves the log to `<path>.1` and returns the new size of the current log. */
function rotate(path: string): number {
  try {
    renameSync(path, `${path}.1`);
    return 0;
  } catch {
    // A rename can fail (for example while another program holds the old file open on Windows); keep appending.
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }
}
