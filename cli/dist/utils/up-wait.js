// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, spawn } from "node:child_process";
import { closeSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatWaitFailures, lastLines } from "./startup-report.js";
/** Seconds `flisk up --wait` waits for a healthy stack when `--wait-timeout` is not given. */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
const LOG_TAIL_CHARS = 2000;
const POLL_MS = 250;
/** Lines of each unhealthy service's log a failed `flisk up --wait` prints, and the most it prints in all. */
export const UNHEALTHY_LINES_PER_SERVICE = 5;
export const UNHEALTHY_LINES_TOTAL = 20;
/**
 * The lines `flisk logs --unhealthy --json` returned, grouped by service in the order they first appear: the last
 * `perService` lines of each, and no more than `total` lines over all of them (a service past that keeps its name with
 * no lines, so it is still named).
 */
export function unhealthyLogTails(lines, perService = UNHEALTHY_LINES_PER_SERVICE, total = UNHEALTHY_LINES_TOTAL) {
    const byService = new Map();
    for (const line of lines) {
        if (!line.resource)
            continue;
        // One log entry can hold several lines (a traceback), so the caps count the lines that are printed.
        const texts = line.text
            .split(/\r?\n/)
            .map((text) => text.trimEnd())
            .filter((text) => text.trim());
        if (texts.length === 0)
            continue;
        const kept = byService.get(line.resource) ?? [];
        kept.push(...texts);
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
export function formatUnhealthyLogTails(tails) {
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
export function fetchUnhealthyLogLines(invocation, cwd, timeoutMs = 20_000) {
    const [command, ...prefix] = invocation();
    return new Promise((resolve) => {
        execFile(command, [...prefix, "logs", "--unhealthy", "--json"], {
            cwd,
            timeout: timeoutMs,
            maxBuffer: 4 * 1024 * 1024,
            env: { ...process.env, NO_COLOR: "1" },
        }, (_error, stdout) => {
            const line = resultLine(String(stdout ?? ""));
            if (!line)
                return resolve(null);
            try {
                const parsed = JSON.parse(line);
                const found = parsed.data?.lines;
                resolve(Array.isArray(found)
                    ? found.map((entry) => ({
                        resource: entry.resource ?? null,
                        text: String(entry.text ?? ""),
                    }))
                    : null);
            }
            catch {
                resolve(null);
            }
        });
    });
}
/**
 * The lines `flisk up --wait` prints for a failed `flisk up --json` result: each failure with its fix and, under it,
 * its service's log lines, then any other unhealthy service. A result with no service failures (an env file refused,
 * drift) keeps its error messages first, so the log lines never hide why `flisk up` stopped.
 */
export function failedWaitMessages(result, unhealthy) {
    const failures = result.data?.failures ?? [];
    const lines = formatWaitFailures(withUnhealthyLogs(failures, unhealthy));
    const messages = failures.length > 0
        ? lines
        : [...(result.errors ?? []).map((error) => error.message ?? ""), ...lines];
    return messages.filter(Boolean);
}
/**
 * The `flisk up --json` result with each failure that names an unhealthy service given its log lines as `logs`, and
 * any other unhealthy service added as a failure of its own.
 */
export function withUnhealthyLogs(failures, tails) {
    const byName = new Map(tails.map((tail) => [tail.name, tail.lines]));
    const out = failures.map((failure) => byName.has(failure.name) ? { ...failure, logs: byName.get(failure.name) } : failure);
    const named = new Set(failures.map((failure) => failure.name));
    for (const tail of tails) {
        if (!named.has(tail.name))
            out.push({ name: tail.name, message: "not healthy", logs: tail.lines });
    }
    return out;
}
/** The arguments of the detached child: the caller's own, without the wait options, asking for one JSON result. */
export function detachedUpArgs(argv) {
    const out = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--wait")
            continue;
        if (arg === "--wait-timeout") {
            i++;
            continue;
        }
        if (arg.startsWith("--wait-timeout="))
            continue;
        out.push(arg);
    }
    if (!out.includes("--json"))
        out.push("--json");
    return out;
}
/** Parses `--wait-timeout`: a whole number of seconds from 1 to 21600 (6 hours), or the default when omitted. */
export function parseWaitTimeout(value) {
    if (value === undefined)
        return { ok: true, seconds: DEFAULT_WAIT_TIMEOUT_SECONDS };
    const seconds = typeof value === "number" ? value : Number(String(value));
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 21_600) {
        return {
            ok: false,
            message: "--wait-timeout must be a whole number of seconds from 1 to 21600",
        };
    }
    return { ok: true, seconds };
}
function resultLine(log) {
    return log
        .split("\n")
        .filter((line) => line.startsWith('{"schemaVersion"'))
        .pop();
}
/**
 * Starts the stack detached and waits for the JSON result `flisk up --json` prints when the stack is ready or the
 * command fails. The stack keeps running afterwards, also on a timeout (`flisk down` stops it).
 */
export async function upAndWait(argv, timeoutSeconds, deps, cwd) {
    const logFile = deps.logFile();
    const child = deps.spawnUp(detachedUpArgs(argv), logFile, cwd);
    let exited;
    let spawnError;
    child.once("exit", (code) => {
        exited = code;
    });
    child.once("error", (error) => {
        spawnError = error;
    });
    const deadline = deps.now() + timeoutSeconds * 1000;
    for (;;) {
        if (spawnError)
            return { kind: "spawn-error", message: spawnError.message };
        const log = deps.readLog(logFile);
        const line = resultLine(log);
        if (line) {
            child.unref();
            try {
                const parsed = JSON.parse(line);
                const failed = (parsed.errors?.length ?? 0) > 0 || parsed.data?.ok === false;
                if (!failed) {
                    try {
                        rmSync(logFile, { force: true });
                    }
                    catch {
                        // A cleanup failure must not turn a healthy stack into a failed startup.
                    }
                }
                return { kind: failed ? "failed" : "ready", json: line };
            }
            catch {
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
export const defaultUpWaitDeps = (invocation) => ({
    spawnUp(args, logFile, cwd) {
        const fd = openSync(logFile, "a", 0o600);
        const [command, ...prefix] = invocation();
        const child = spawn(command, [...prefix, ...args], {
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
        }
        catch {
            return "";
        }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    logFile: () => join(tmpdir(), `flisk-up-wait-${Date.now()}.log`),
});
