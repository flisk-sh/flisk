// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { type ChildProcess, execFile, spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lastLines } from "./startup-report.js";

/** Seconds `flisk up --wait` waits for a healthy stack when `--wait-timeout` is not given. */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
const LOG_TAIL_CHARS = 2000;
const POLL_MS = 250;

/** Lines of each unhealthy service's log a failed `flisk up --wait` prints, and the most it prints in all. */
export const UNHEALTHY_LINES_PER_SERVICE = 5;
export const UNHEALTHY_LINES_TOTAL = 20;

/** The last log lines of one service that was not healthy when `flisk up --wait` gave up. */
export interface UnhealthyLogTail {
  name: string;
  lines: string[];
}

/**
 * The lines `flisk logs --unhealthy --json` returned, grouped by service in the order they first appear: the last
 * `perService` lines of each, and no more than `total` lines over all of them (a service past that keeps its name with
 * no lines, so it is still named).
 */
export function unhealthyLogTails(
  lines: Array<{ resource: string | null; text: string }>,
  perService = UNHEALTHY_LINES_PER_SERVICE,
  total = UNHEALTHY_LINES_TOTAL,
): UnhealthyLogTail[] {
  const byService = new Map<string, string[]>();
  for (const line of lines) {
    const text = line.text.trimEnd();
    if (!line.resource || !text.trim()) continue;
    const kept = byService.get(line.resource) ?? [];
    kept.push(text);
    byService.set(line.resource, kept);
  }
  let left = total;
  return [...byService].map(([name, kept]) => {
    const tail = kept.slice(-perService).slice(0, Math.max(0, left));
    left -= tail.length;
    return { name, lines: tail };
  });
}

/** The human lines for those tails, under the failure message: each service, its lines, and how to see more. */
export function formatUnhealthyLogTails(tails: UnhealthyLogTail[]): string[] {
  return tails.flatMap(({ name, lines }) => [
    `  ${name}: not healthy`,
    ...lines.map((line) => `    ${line}`),
    `    (${lines.length > 0 ? `${lastLines(lines.length)} of: ` : "see: "}flisk logs --service ${name})`,
  ]);
}

/**
 * Runs `flisk logs --unhealthy --json` the same way `flisk up --wait` runs `flisk up`, so the lookup (Tilt or local
 * processes, and secret redaction) is the one `flisk logs` does. Resolves to null when it cannot run or says nothing.
 */
export function fetchUnhealthyLogLines(
  invocation: () => string[],
  cwd?: string,
  timeoutMs = 20_000,
): Promise<Array<{ resource: string | null; text: string }> | null> {
  const [command, ...prefix] = invocation();
  return new Promise((resolve) => {
    execFile(
      command as string,
      [...prefix, "logs", "--unhealthy", "--json"],
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1" },
      },
      (_error, stdout) => {
        const line = resultLine(String(stdout ?? ""));
        if (!line) return resolve(null);
        try {
          const parsed = JSON.parse(line) as {
            data?: { lines?: Array<{ resource?: string | null; text?: string }> } | null;
          };
          const found = parsed.data?.lines;
          resolve(
            Array.isArray(found)
              ? found.map((entry) => ({
                  resource: entry.resource ?? null,
                  text: String(entry.text ?? ""),
                }))
              : null,
          );
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/**
 * The `flisk up --json` result with each failure that names an unhealthy service given its log lines as `logs`, and
 * any other unhealthy service added as a failure of its own.
 */
export function withUnhealthyLogs(
  failures: Array<{ name: string; [key: string]: unknown }>,
  tails: UnhealthyLogTail[],
): Array<{ name: string; [key: string]: unknown }> {
  const byName = new Map(tails.map((tail) => [tail.name, tail.lines]));
  const out = failures.map((failure) =>
    byName.has(failure.name) ? { ...failure, logs: byName.get(failure.name) } : failure,
  );
  const named = new Set(failures.map((failure) => failure.name));
  for (const tail of tails) {
    if (!named.has(tail.name))
      out.push({ name: tail.name, message: "not healthy", logs: tail.lines });
  }
  return out;
}

export interface UpWaitDeps {
  /** Starts `flisk up` detached with its output going to a log file. */
  spawnUp: (args: string[], logFile: string, cwd?: string) => ChildProcess;
  readLog: (logFile: string) => string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  logFile: () => string;
}

export type UpWaitOutcome =
  | { kind: "ready"; json: string }
  | { kind: "failed"; json: string }
  | { kind: "exited"; exitCode: number | null; logTail: string }
  | { kind: "timeout"; logTail: string; logFile: string }
  | { kind: "spawn-error"; message: string };

/** The arguments of the detached child: the caller's own, without the wait options, asking for one JSON result. */
export function detachedUpArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--wait") continue;
    if (arg === "--wait-timeout") {
      i++;
      continue;
    }
    if (arg.startsWith("--wait-timeout=")) continue;
    out.push(arg);
  }
  if (!out.includes("--json")) out.push("--json");
  return out;
}

/** Parses `--wait-timeout`: a whole number of seconds from 1 to 21600 (6 hours), or the default when omitted. */
export function parseWaitTimeout(
  value: unknown,
): { ok: true; seconds: number } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, seconds: DEFAULT_WAIT_TIMEOUT_SECONDS };
  const seconds = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 21_600) {
    return {
      ok: false,
      message: "--wait-timeout must be a whole number of seconds from 1 to 21600",
    };
  }
  return { ok: true, seconds };
}

function resultLine(log: string): string | undefined {
  return log
    .split("\n")
    .filter((line) => line.startsWith('{"schemaVersion"'))
    .pop();
}

/**
 * Starts the stack detached and waits for the JSON result `flisk up --json` prints when the stack is ready or the
 * command fails. The stack keeps running afterwards, also on a timeout (`flisk down` stops it).
 */
export async function upAndWait(
  argv: string[],
  timeoutSeconds: number,
  deps: UpWaitDeps,
  cwd?: string,
): Promise<UpWaitOutcome> {
  const logFile = deps.logFile();
  const child = deps.spawnUp(detachedUpArgs(argv), logFile, cwd);
  let exited: number | null | undefined;
  let spawnError: Error | undefined;
  child.once("exit", (code) => {
    exited = code;
  });
  child.once("error", (error) => {
    spawnError = error;
  });

  const deadline = deps.now() + timeoutSeconds * 1000;
  for (;;) {
    if (spawnError) return { kind: "spawn-error", message: spawnError.message };
    const log = deps.readLog(logFile);
    const line = resultLine(log);
    if (line) {
      child.unref();
      try {
        const parsed = JSON.parse(line) as { errors?: unknown[]; data?: { ok?: boolean } };
        const failed = (parsed.errors?.length ?? 0) > 0 || parsed.data?.ok === false;
        if (!failed) {
          try {
            rmSync(logFile, { force: true });
          } catch {
            // A cleanup failure must not turn a healthy stack into a failed startup.
          }
        }
        return { kind: failed ? "failed" : "ready", json: line };
      } catch {
        return { kind: "failed", json: line };
      }
    }
    if (exited !== undefined) {
      return { kind: "exited", exitCode: exited, logTail: log.slice(-LOG_TAIL_CHARS) };
    }
    if (deps.now() >= deadline) {
      child.unref();
      return { kind: "timeout", logTail: log.slice(-LOG_TAIL_CHARS), logFile };
    }
    await deps.sleep(POLL_MS);
  }
}

export const defaultUpWaitDeps = (invocation: () => string[]): UpWaitDeps => ({
  spawnUp(args, logFile, cwd) {
    const fd = openSync(logFile, "a", 0o600);
    const [command, ...prefix] = invocation();
    const child = spawn(command as string, [...prefix, ...args], {
      cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, NO_COLOR: "1" },
    });
    closeSync(fd);
    return child;
  },
  readLog(logFile) {
    try {
      return readFileSync(logFile, "utf-8");
    } catch {
      return "";
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  logFile: () => join(tmpdir(), `flisk-up-wait-${Date.now()}.log`),
});
