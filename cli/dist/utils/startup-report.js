// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { parseTiltResourceFailures, summarizeTiltBuildError } from "./doctor-runtime.js";
import { conflictPort, portConflictFix } from "./port-conflict-fix.js";
import { stripTerminalControls } from "./tilt-events.js";
import { effectiveRuntimeStatus, isNeverStarted, isTiltResourcePending, } from "./tilt-resource-state.js";
import { onlyEnabledResources } from "./up-readiness.js";
/** The resources Tilt says this one is waiting for. */
function waitingOn(item) {
    return (item.status?.waiting?.on ?? [])
        .filter((ref) => (ref.kind ?? "UIResource") === "UIResource" && ref.name)
        .map((ref) => ref.name);
}
// Docker has no free subnet left for a new network (every project creates several and `flisk down` keeps them).
const NETWORK_POOL_EXHAUSTED = /all predefined address pools have been fully subnetted/i;
/**
 * Tilt's error for a failed local command is only "exit status 1"; the reason (for example Docker's "all predefined
 * address pools have been fully subnetted") is in the resource's log. Returns the fix for each failed resource whose
 * message or log names a known machine problem.
 */
export async function machineProblemFixes(failures, fetchLogs) {
    const fixes = new Map();
    for (const { name, message } of failures.slice(0, 5)) {
        const fix = machineProblemFix(message) ?? machineProblemFix((await fetchLogs(name)) ?? "");
        if (fix)
            fixes.set(name, fix);
    }
    return fixes;
}
// What Tilt reports for a local_resource whose command exited non-zero: no reason at all.
const BARE_EXIT_STATUS = /^(?:Command failed: )?exit status \d+$/i;
// What Tilt reports for a failed local command (`Command "..." failed`) or compose step (`command [...] failed`): the
// command line, often hundreds of characters, and not why it failed.
const FAILED_COMMAND = /^command\s+(?:"[\s\S]*"|\[[\s\S]*\])\s+failed\b/i;
/** The most of a failure message `flisk up` prints for one resource. */
export const MAX_FAILURE_MESSAGE = 300;
const LOG_TAIL_LINES = 3;
/**
 * Failures whose message carries no reason, given the reason their command logged instead. The health gates
 * (`postgres-healthy`, `<svc>-healthy`, `<job>-done`) print the cause as their last `ERROR: ...` line, such as a container
 * that exited or a health check that kept failing past its recovery window, so `flisk up` shows that rather than
 * "exit status 1" (#3210). A failed command or compose step (`init-networks`, `docker compose up`) is shown as the last
 * lines of its log, where Docker's own message is, rather than the command line. Other failures, and those whose log
 * has nothing to show, are returned unchanged, with the command text cut to MAX_FAILURE_MESSAGE characters.
 */
export async function withLoggedReasons(failures, fetchLogs) {
    const out = [];
    for (const [index, failure] of failures.entries()) {
        const message = failure.message.trim();
        const isBareExit = BARE_EXIT_STATUS.test(message);
        const isCommand = FAILED_COMMAND.test(message);
        if (index >= 5 || (!isBareExit && !isCommand)) {
            out.push(failure);
            continue;
        }
        const log = (await fetchLogs(failure.name)) ?? "";
        const reason = loggedErrorLine(log) ?? (isCommand ? logTail(log) : null);
        if (reason)
            out.push({ ...failure, message: reason });
        else if (isCommand)
            out.push({ ...failure, message: capStart(message) });
        else
            out.push(failure);
    }
    return out;
}
/** The last lines of a log that have text, joined on one line, keeping the end when it is too long. */
export function logTail(log, lines = LOG_TAIL_LINES) {
    const tail = log
        .split("\n")
        .map((line) => stripTerminalControls(line).trim())
        .filter(Boolean)
        .slice(-lines)
        .join(" ");
    if (!tail)
        return null;
    return tail.length > MAX_FAILURE_MESSAGE
        ? `…${tail.slice(tail.length - (MAX_FAILURE_MESSAGE - 1))}`
        : tail;
}
/**
 * The failure lines `flisk up --wait` prints from the `flisk up --json` result: each failed resource and its reason,
 * and under it the fix when the reason names a known machine problem.
 */
export function formatWaitFailures(failures) {
    return failures.map((f) => {
        const line = `${f.name}: ${f.reason ?? f.message ?? "failed"}`;
        return f.fix ? `${line}\n    → ${f.fix.replace(/^Fix:\s*/, "")}` : line;
    });
}
function capStart(text) {
    return text.length > MAX_FAILURE_MESSAGE ? `${text.slice(0, MAX_FAILURE_MESSAGE - 1)}…` : text;
}
/**
 * The last `ERROR: ...` line of a resource log, without that prefix, or null. Tilt may put the resource name and a
 * separator before each line, so the marker can come after other text.
 */
export function loggedErrorLine(log) {
    let reason = null;
    for (const line of log.split("\n")) {
        const match = line.trimEnd().match(/(?:^|\s)ERROR: (\S.*)$/);
        if (match)
            reason = match[1];
    }
    return reason;
}
/** A plain fix for a failure message that names a known machine problem, or null. */
export function machineProblemFix(message) {
    if (NETWORK_POOL_EXHAUSTED.test(message)) {
        return "Fix: Docker has no free network ranges left. Run `flisk doctor --fix --scope=machine` to remove the unused networks of every Flisk project (networks in use are kept), then run flisk up again";
    }
    return null;
}
export function transitiveDependencies(name, dependsOn) {
    const seen = new Set();
    const visit = (current) => {
        for (const dep of dependsOn[current] ?? []) {
            if (seen.has(dep))
                continue;
            seen.add(dep);
            visit(dep);
        }
    };
    visit(name);
    return seen;
}
function isPending(item) {
    return isTiltResourcePending(item.status?.updateStatus ?? "", effectiveRuntimeStatus(item.status));
}
export function buildStartupReport(jsonText, dependsOn, deferred = new Set()) {
    const enabledJson = onlyEnabledResources(jsonText);
    const failures = parseTiltResourceFailures(enabledJson, deferred).failures;
    const failed = failures.map((failure) => ({
        name: failure.name,
        message: failure.error
            ? summarizeTiltBuildError(failure.error)
            : `${failure.updateStatus}/${failure.runtimeStatus}`,
    }));
    const failedNames = new Set(failed.map((entry) => entry.name));
    const items = JSON.parse(enabledJson).items ?? [];
    // service.json dependsOn, plus what Tilt reports as waited for (shared infrastructure such as init-networks, which no
    // service.json names).
    const deps = { ...dependsOn };
    for (const item of items) {
        const name = item.metadata?.name;
        if (!name)
            continue;
        const waits = waitingOn(item);
        if (waits.length > 0)
            deps[name] = [...new Set([...(deps[name] ?? []), ...waits])];
    }
    const blocked = [];
    const starting = [];
    const stillBuilding = [];
    for (const item of items) {
        const name = item.metadata?.name ?? "unknown";
        // A resource Flisk registers but never starts waits on nothing, so it is neither blocked nor starting:
        // parseTiltResourceFailures leaves it out of pendingCount, and this report must agree with it.
        if (name === "(Tiltfile)" ||
            failedNames.has(name) ||
            deferred.has(name) ||
            isNeverStarted(item.status))
            continue;
        const because = [...transitiveDependencies(name, deps)]
            .filter((dep) => failedNames.has(dep))
            .sort();
        if (because.length > 0) {
            blocked.push({ name, because });
        }
        else if (isPending(item)) {
            starting.push(name);
            if (item.status?.updateStatus === "in_progress") {
                stillBuilding.push(name);
            }
        }
    }
    return {
        failed,
        blocked,
        starting,
        stillBuilding: stillBuilding.length > 0 ? stillBuilding : undefined,
    };
}
/** A failure exists and everything still pending is blocked by it, so waiting longer cannot help. */
export function isStartupStalled(jsonText, dependsOn, deferred = new Set()) {
    const report = buildStartupReport(jsonText, dependsOn, deferred);
    return report.failed.length > 0 && report.starting.length === 0;
}
export function formatStartupReport(report, timedOut, occupantOf, machineFixes = new Map(), lastLogs) {
    const lines = [];
    for (const { name, message } of report.failed) {
        lines.push(`✗ ${name} failed: ${message}`);
        const port = conflictPort(message);
        const fix = portConflictFix(message, port !== null && occupantOf ? occupantOf(port) : null) ??
            machineFixes.get(name) ??
            machineProblemFix(message);
        if (fix)
            lines.push(`  ${fix}`);
    }
    for (const { name, because } of report.blocked) {
        lines.push(`✗ ${name} is not ready because ${because.join(", ")} failed`);
    }
    if (report.stillBuilding && report.stillBuilding.length > 0) {
        lines.push(`${timedOut ? "Timed out while building:" : "Still building:"} ${report.stillBuilding.join(", ")}`);
    }
    const startingOnly = report.starting.filter((s) => !report.stillBuilding?.includes(s));
    if (startingOnly.length > 0) {
        lines.push(`${timedOut ? "Timed out waiting for" : "Still starting:"} ${startingOnly.join(", ")}`);
    }
    const combinedLogs = { ...(report.lastLogs ?? {}), ...(lastLogs ?? {}) };
    const timedOutServices = [...(report.stillBuilding ?? []), ...startingOnly];
    if (timedOut) {
        for (const name of timedOutServices) {
            const logs = combinedLogs[name]?.trim();
            if (logs) {
                lines.push(`Last log lines for ${name}:`);
                for (const logLine of logs.split("\n").slice(-10)) {
                    lines.push(`  ${logLine}`);
                }
            }
        }
    }
    if (lines.length > 0) {
        const causes = [...new Set(report.blocked.flatMap((entry) => entry.because))].sort();
        const count = report.blocked.length;
        const summary = count > 0
            ? `: ${causes.join(", ")} failed, so ${count} dependent ${count === 1 ? "service is" : "services are"} not ready`
            : "";
        lines.push(`The environment is not ready${summary}. Tilt is still running; inspect it or run: flisk down`);
    }
    return lines;
}
