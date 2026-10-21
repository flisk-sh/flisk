// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
export interface LogLine {
  time: string | null;
  resource: string | null;
  level: string | null;
  source: string | null;
  text: string;
}

export const DEFAULT_LOG_TAIL = 200;
/** Upper bound for --tail so a snapshot stays small enough for an agent to read. */
export const MAX_LOG_TAIL = 10_000;

const NANOSECONDS: Record<string, number> = {
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
export function isValidSince(value: string): boolean {
  if (!/^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$/.test(value)) return false;
  let total = 0;
  for (const [, amount, unit] of value.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/g)) {
    total += Number(amount) * (NANOSECONDS[unit as string] ?? 0);
  }
  return total <= MAX_DURATION_NANOSECONDS;
}

export function isValidPort(value: string): boolean {
  return /^[1-9]\d{0,4}$/.test(value) && Number(value) <= 65535;
}

export function isValidTail(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_LOG_TAIL;
}

/** Parse `tilt logs --json` (JSON Lines) into normalized lines, keeping at most the last `limit`. Unparseable lines are skipped. */
export function parseTiltLogLines(output: string, limit: number): LogLine[] {
  const lines: LogLine[] = [];
  for (const raw of output.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const entry = JSON.parse(raw) as Record<string, unknown>;
      const str = (value: unknown): string | null =>
        typeof value === "string" && value !== "" ? value : null;
      lines.push({
        time: str(entry.time),
        resource: str(entry.resource),
        level: str(entry.level),
        source: str(entry.source),
        text: typeof entry.message === "string" ? entry.message : "",
      });
    } catch {
      // Tilt can print a non-JSON notice before the stream; it is not a log line.
    }
  }
  return lines.slice(-limit);
}

/** True when `tilt logs` failed because no Tilt server answered, as opposed to rejecting its arguments. */
export function isTiltConnectionFailure(stderr: string): boolean {
  return /connection refused|connecting to Tilt|no such host|dial tcp|websocket_token/i.test(
    stderr,
  );
}
