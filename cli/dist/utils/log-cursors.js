// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Room for sub-millisecond ordering inside one timestamp. 1_000 keeps every sequence number below
 * Number.MAX_SAFE_INTEGER for dates well past this century, so a cursor survives a JSON round trip.
 */
export const LOG_SEQ_SUB_MILLISECOND = 1_000;
/** A cursor is a non-negative integer, as printed in `data.nextCursor`. */
export function isValidCursor(value) {
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}
/** FNV-1a: small, deterministic, and enough to give two lines in one millisecond different positions. */
function fingerprint(line) {
    const key = [line.time, line.resource, line.level, line.source, line.text].join("\u0000");
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i += 1) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % LOG_SEQ_SUB_MILLISECOND;
}
/** Milliseconds since the epoch for a log timestamp, or 0 when Tilt did not give a parseable one. */
function timeBase(time) {
    if (!time)
        return 0;
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? parsed * LOG_SEQ_SUB_MILLISECOND : 0;
}
/**
 * Number `lines` and keep only those after `after`. A line written with a `seq` keeps it; otherwise the timestamp is
 * the high part of its number and a hash of its content the low part, so the same line keeps its number when older
 * lines leave the tail. `nextCursor` stays put when nothing new arrived: `max(after, last number)`.
 */
export function applyLogCursor(lines, after) {
    let previous = 0;
    const sequenced = lines.map((line) => {
        const written = line.seq;
        const candidate = typeof written === "number" && Number.isSafeInteger(written) && written > 0
            ? written
            : timeBase(line.time) + fingerprint(line);
        // A backwards clock or an older log without numbers must not make the output go backwards.
        const seq = Math.max(candidate, previous + 1);
        previous = seq;
        return { ...line, seq };
    });
    const nextCursor = after === undefined ? previous : Math.max(after, previous);
    const oldest = sequenced.length > 0 ? Math.min(...sequenced.map((line) => line.seq)) : undefined;
    return {
        lines: after === undefined ? sequenced : sequenced.filter((line) => line.seq > after),
        nextCursor,
        truncated: after !== undefined && oldest !== undefined && after < oldest,
    };
}
