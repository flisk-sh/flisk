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
export declare const LOG_SOURCES: readonly ["runtime", "build"];
export type LogSource = (typeof LOG_SOURCES)[number];
export declare function isValidLogSource(value: string): value is LogSource;
/**
 * Keep only lines from one source. Tilt marks image build output "build" and everything a running service prints
 * "runtime"; a line with no source (local-process logs, which have no build step) is runtime output.
 */
export declare function filterLogSource<T extends {
    source: string | null;
}>(lines: readonly T[], source: LogSource): T[];
/**
 * Compile a smart-case content filter from caller-supplied text. The pattern is escaped first, so
 * it is matched as plain text: a command-line argument or MCP argument cannot inject an expression
 * for the RegExp engine to execute (CWE-400). A pattern without uppercase characters ignores case.
 */
export declare function compileLogGrep(pattern: string): RegExp;
/** Context is a non-negative safe integer; it is clipped to the selected log window. */
export declare function isValidLogContext(value: string): boolean;
/**
 * Match redacted content within the selected window, retaining neighbors from the same service only.
 * Tilt can batch multiple physical lines in one message. Expand those only for content filtering,
 * preserving metadata and input order. Merge overlapping context ranges so no line appears twice.
 */
export declare function filterLogContent<T extends {
    resource: string | null;
    text: string;
}>(lines: readonly T[], pattern: RegExp, context: number): Array<T & {
    match: boolean;
}>;
/** True when `tilt logs` failed because no Tilt server answered, as opposed to rejecting its arguments. */
export declare function isTiltConnectionFailure(stderr: string): boolean;
