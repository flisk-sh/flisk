/**
 * Size at which a local process's log is rotated to `<service>.log.1` (one old file is kept), so a noisy dev server
 * cannot fill the disk (#3720). Maintainers may tune this number.
 */
export declare const NATIVE_LOG_MAX_BYTES: number;
/** How many run start markers are copied into a fresh log on rotation, so the last runs stay addressable (#4693). */
export declare const NATIVE_LOG_KEEP_RUNS = 5;
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
export declare function parseNativeRunMarker(text: string): NativeRunMarker | null;
/** True for the three forms `--run` accepts: the two relative selectors or a numeric run id. */
export declare function isValidNativeRun(value: string): boolean;
/**
 * The last `tail` non-empty lines of a log, oldest first, read from the end of the file in blocks so memory follows the
 * size of the answer, not of the file. With `cutoffMs`, reading stops at the first line whose timestamp is older; lines
 * with no timestamp are skipped, as before. A trailing `\r` is dropped. A `tail` of 0 or less reads every line.
 */
export declare function readLogTail(path: string, tail: number, cutoffMs?: number | null): string[];
/** All output lines of a service, from the rotated and current logs, with markers hidden and a `run` on each line. */
export declare function readNativeRunLog(path: string): NativeLogEntry[];
/** All output lines of the current file only; used when no `--run` selector was given. */
export declare function readNativeLogEntries(path: string): NativeLogEntry[];
/** Every run id in a service's logs, numeric order oldest first (a run can have written no output). */
export declare function nativeRunIds(path: string): string[];
/** The highest run id already in a service's logs, or null when it has never been supervised. */
export declare function latestNativeRunId(path: string): string | null;
/** Records the start of one spawn or respawn of a local service. */
export declare function appendNativeRunStart(path: string, runId: string, pid: number | undefined, sizes: Map<string, number>, maxBytes?: number): void;
/** Records the exit of one spawn or respawn of a local service. */
export declare function appendNativeRunExit(path: string, runId: string, code: number | null, sizes: Map<string, number>, maxBytes?: number): void;
/**
 * Appends one already formatted line to a local process's log. `sizes` holds the known size of each log (shared by the
 * stdout and stderr writers of one service); when the log reaches `maxBytes`, it is renamed to `<path>.1`, replacing an
 * older one, and the next line starts a fresh file. A log left above the cap by an earlier run is rotated before the
 * first new line. The start markers of the last `NATIVE_LOG_KEEP_RUNS` runs, including the current one, are copied to
 * the fresh file so a rotation can never orphan the run being read (#4693).
 */
export declare function appendNativeLogLine(path: string, text: string, sizes: Map<string, number>, maxBytes?: number): void;
