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
export declare const LOG_SEQ_SUB_MILLISECOND = 1000;
/** A cursor is a non-negative integer, as printed in `data.nextCursor`. */
export declare function isValidCursor(value: string): boolean;
/**
 * Number `lines` and keep only those after `after`. A line written with a `seq` keeps it; otherwise the timestamp is
 * the high part of its number and a hash of its content the low part, so the same line keeps its number when older
 * lines leave the tail. `nextCursor` stays put when nothing new arrived: `max(after, last number)`.
 */
export declare function applyLogCursor<T extends CursorLine>(lines: readonly T[], after?: number): CursorPage<T & {
    seq: number;
}>;
