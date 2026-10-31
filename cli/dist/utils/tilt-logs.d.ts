export interface LogLine {
    time: string | null;
    resource: string | null;
    level: string | null;
    source: string | null;
    text: string;
}
export declare const DEFAULT_LOG_TAIL = 200;
/** Upper bound for --tail so a snapshot stays small enough for an agent to read. */
export declare const MAX_LOG_TAIL = 10000;
/**
 * Go-style duration such as 30s, 5m, 1h or 1h30m, within roughly the range Go's ParseDuration accepts.
 * The sum is a JS number, so values within a few nanoseconds of the int64 limit can disagree with Go; this only needs to
 * reject absurd input, and Tilt remains the final judge (its rejection is reported as TILT_LOGS_FAILED).
 */
export declare function isValidSince(value: string): boolean;
/** A valid --since duration in milliseconds, for logs Flisk reads itself (local processes) rather than through Tilt. */
export declare function sinceMilliseconds(value: string): number;
export { isValidPort } from "./validation.js";
export declare function isValidTail(value: string): boolean;
/** Parse `tilt logs --json` (JSON Lines) into normalized lines, keeping at most the last `limit`. Unparseable lines are skipped. */
export declare function parseTiltLogLines(output: string, limit: number): LogLine[];
/** True when `tilt logs` failed because no Tilt server answered, as opposed to rejecting its arguments. */
export declare function isTiltConnectionFailure(stderr: string): boolean;
