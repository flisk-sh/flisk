/**
 * Size at which a local process's log is rotated to `<service>.log.1` (one old file is kept), so a noisy dev server
 * cannot fill the disk (#3720). Maintainers may tune this number.
 */
export declare const NATIVE_LOG_MAX_BYTES: number;
/** Highest sequence number already present in these logs (current and rotated); 0 when none is numbered yet. */
export declare function maxNativeLogSeq(paths: readonly string[]): number;
/**
 * The last `tail` non-empty lines of a log, oldest first, read from the end of the file in blocks so memory follows the
 * size of the answer, not of the file. With `cutoffMs`, reading stops at the first line whose timestamp is older; lines
 * with no timestamp are skipped, as before. A trailing `\r` is dropped. A `tail` of 0 or less reads every line.
 */
export declare function readLogTail(path: string, tail: number, cutoffMs?: number | null): string[];
/**
 * Appends one already formatted line to a local process's log. `sizes` holds the known size of each log (shared by the
 * stdout and stderr writers of one service); when the log reaches `maxBytes`, it is renamed to `<path>.1`, replacing an
 * older one, and the next line starts a fresh file. A log left above the cap by an earlier run is rotated before the
 * first new line.
 */
export declare function appendNativeLogLine(path: string, text: string, sizes: Map<string, number>, maxBytes?: number): void;
