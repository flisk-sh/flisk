// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Seconds `flisk up --wait` waits for a healthy stack when `--wait-timeout` is not given. */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
const LOG_TAIL_CHARS = 2000;
const POLL_MS = 250;

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
    const fd = openSync(logFile, "a");
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
