export const DEFAULT_LOG_TAIL = 200;
/** Upper bound for --tail so a snapshot stays small enough for an agent to read. */
export const MAX_LOG_TAIL = 10_000;
const NANOSECONDS = {
    ns: 1,
    us: 1e3,
    µs: 1e3,
    ms: 1e6,
    s: 1e9,
    m: 6e10,
    h: 3.6e12,
};
// Go's time.Duration is an int64 of nanoseconds, so anything beyond this is rejected by `tilt logs`.
const MAX_DURATION_NANOSECONDS = 2 ** 63 - 1;
/**
 * Go-style duration such as 30s, 5m, 1h or 1h30m, within roughly the range Go's ParseDuration accepts.
 * The sum is a JS number, so values within a few nanoseconds of the int64 limit can disagree with Go; this only needs to
 * reject absurd input, and Tilt remains the final judge (its rejection is reported as TILT_LOGS_FAILED).
 */
export function isValidSince(value) {
    if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(value))
        return false;
    let total = 0;
    for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
        total += Number(amount) * (NANOSECONDS[unit] ?? 0);
    }
    return total <= MAX_DURATION_NANOSECONDS;
}
/** A valid --since duration in milliseconds, for logs Flisk reads itself (local processes) rather than through Tilt. */
export function sinceMilliseconds(value) {
    let total = 0;
    for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
        total += Number(amount) * (NANOSECONDS[unit] ?? 0);
    }
    return total / 1e6;
}
export { isValidPort } from "./validation.js";
export function isValidTail(value) {
    return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_LOG_TAIL;
}
/**
 * Turn a `time` from Tilt's log store into an RFC3339 string. Tilt writes Go MicroTime strings such as
 * `2026-11-20T12:34:56.123456Z`; `Date.parse` accepts them, but we normalize so every consumer sees one shape.
 */
function normalizedTime(value) {
    if (typeof value !== "string" || value === "")
        return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
const TILT_LEVELS = {
    INFO: "info",
    VERBOSE: "verbose",
    DEBUG: "debug",
    WARN: "warn",
    ERROR: "error",
};
/**
 * Parse the log list in `tilt dump webview` output. The webview dump carries the timestamps Tilt recorded with
 * each segment; the `tilt logs` path was observed dating lines with the query time in #4197. Returns null when
 * Tilt did not return a webview dump we can read.
 */
export function parseTiltWebviewLogLines(output, limit) {
    let parsed;
    try {
        parsed = JSON.parse(output);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const view = parsed;
    if (!view.logList || typeof view.logList !== "object")
        return null;
    const logList = view.logList;
    const spans = logList.spans && typeof logList.spans === "object"
        ? logList.spans
        : {};
    const segments = Array.isArray(logList.segments) ? logList.segments : [];
    const lines = [];
    for (const entry of segments) {
        if (!entry || typeof entry !== "object")
            continue;
        const segment = entry;
        const spanId = typeof segment.spanId === "string" ? segment.spanId : "";
        const span = spans[spanId];
        const manifestName = span && typeof span === "object" ? span.manifestName : undefined;
        const rawText = typeof segment.text === "string" ? segment.text : "";
        const level = typeof segment.level === "string" ? (TILT_LEVELS[segment.level.toUpperCase()] ?? null) : null;
        lines.push({
            time: normalizedTime(segment.time),
            resource: typeof manifestName === "string" && manifestName ? manifestName : null,
            level,
            // This is Tilt's own build/runtime distinction, from internal/hud/client/json_printer.go.
            source: spanId.startsWith("build:") || spanId.startsWith("cmdimage:") ? "build" : "runtime",
            text: rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText,
        });
    }
    return lines.slice(-limit);
}
/** Keep only lines Tilt dated at or after `now - sinceMs`; lines without a usable time cannot prove they are new. */
export function filterLogLinesSince(lines, sinceMs, now = Date.now()) {
    const cutoff = now - sinceMs;
    return lines.filter((line) => {
        if (line.time === null)
            return false;
        const time = Date.parse(line.time);
        return !Number.isNaN(time) && time >= cutoff;
    });
}
/** Parse `tilt logs --json` (JSON Lines) into normalized lines, keeping at most the last `limit`. Unparseable lines are skipped. */
export function parseTiltLogLines(output, limit) {
    const lines = [];
    for (const raw of output.split("\n")) {
        if (!raw.trim())
            continue;
        try {
            const entry = JSON.parse(raw);
            const str = (value) => typeof value === "string" && value !== "" ? value : null;
            lines.push({
                time: str(entry.time),
                resource: str(entry.resource),
                level: str(entry.level),
                source: str(entry.source),
                text: typeof entry.message === "string" ? entry.message : "",
            });
        }
        catch {
            // Tilt can print a non-JSON notice before the stream; it is not a log line.
        }
    }
    return lines.slice(-limit);
}
export const LOG_SOURCES = ["runtime", "build"];
export function isValidLogSource(value) {
    return LOG_SOURCES.includes(value);
}
/**
 * Keep only lines from one source. Tilt marks image build output "build" and everything a running service prints
 * "runtime"; a line with no source (local-process logs, which have no build step) is runtime output.
 */
export function filterLogSource(lines, source) {
    return lines.filter((line) => (line.source === "build") === (source === "build"));
}
/** True when `tilt logs` failed because no Tilt server answered, as opposed to rejecting its arguments. */
export function isTiltConnectionFailure(stderr) {
    return /connection refused|connecting to Tilt|no such host|dial tcp|websocket_token/i.test(stderr);
}
