// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * Stable sequence numbers for `flisk logs`.
 *
 * The number belongs to the log line, not to a counter file: a local-process supervisor writes it into the line as the
 * line is produced, and a line from a log we do not own (Tilt/Docker) gets a number derived from its timestamp and
 * content. Either way a repeated read of the same log gives the same numbers and the same cursor, without writing
 * anything. Lines are reported in the order they arrived, with strictly increasing `seq`.
 */

/** The shape `flisk logs` needs in order to number a line. `seq` is present once a supervisor has numbered it. */
export interface CursorLine {
  seq?: number;
  time: string | null;
  resource: string | null;
  level: string | null;
  source: string | null;
  text: string;
}

export interface SequencedLine extends CursorLine {
  seq: number;
}

export interface CursorPage<T extends SequencedLine> {
  /** Only lines newer than the cursor, oldest first. */
  lines: T[];
  /** Pass this back as `--after` / `after` to read only what arrived later. */
  nextCursor: number;
  /** True when the cursor pointed before the oldest line still in the log. */
  truncated: boolean;
}

/**
 * Room for sub-millisecond ordering inside one timestamp. 1_000 keeps every sequence number below
 * Number.MAX_SAFE_INTEGER for dates well past this century, so a cursor survives a JSON round trip.
 */
export const LOG_SEQ_SUB_MILLISECOND = 1_000;

/** A cursor is a non-negative integer, as printed in `data.nextCursor`. */
export function isValidCursor(value: string): boolean {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

/** FNV-1a: small, deterministic, and enough to give two lines in one millisecond different positions. */
function fingerprint(line: CursorLine): number {
  const key = [line.time, line.resource, line.level, line.source, line.text].join("\u0000");
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % LOG_SEQ_SUB_MILLISECOND;
}

/** Milliseconds since the epoch for a log timestamp, or 0 when Tilt did not give a parseable one. */
function timeBase(time: string | null): number {
  if (!time) return 0;
  const parsed = Date.parse(time);
  return Number.isFinite(parsed) ? parsed * LOG_SEQ_SUB_MILLISECOND : 0;
}

/**
 * Number `lines` and keep only those after `after`. A line written with a `seq` keeps it; otherwise the timestamp is
 * the high part of its number and a hash of its content the low part, so the same line keeps its number when older
 * lines leave the tail. `nextCursor` stays put when nothing new arrived: `max(after, last number)`.
 */
export function applyLogCursor<T extends CursorLine>(
  lines: readonly T[],
  after?: number,
): CursorPage<T & { seq: number }> {
  let previous = 0;
  const sequenced = lines.map((line) => {
    const written = line.seq;
    const candidate =
      typeof written === "number" && Number.isSafeInteger(written) && written > 0
        ? written
        : timeBase(line.time) + fingerprint(line);
    // A backwards clock or an older log without numbers must not make the output go backwards.
    const seq = Math.max(candidate, previous + 1);
    previous = seq;
    return { ...line, seq } as T & { seq: number };
  });

  const nextCursor = after === undefined ? previous : Math.max(after, previous);
  const oldest = sequenced.length > 0 ? Math.min(...sequenced.map((line) => line.seq)) : undefined;
  return {
    lines: after === undefined ? sequenced : sequenced.filter((line) => line.seq > after),
    nextCursor,
    truncated: after !== undefined && oldest !== undefined && after < oldest,
  };
}
