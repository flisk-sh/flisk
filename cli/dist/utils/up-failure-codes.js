// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * One classifier for the `failures[]` entries of `flisk up --json` and the MCP `up` tool.
 *
 * A failure arrives as free text (`reason`/`message`) plus, when the service wrote anything, its last `logs`. The code is
 * inferred from those, in priority order: a missing program wins over a port conflict, a dependency failure over a
 * health check, and a health check over a crash loop. `exitCode` is the service's last exit code when the runtime knows
 * it, otherwise what the text says, otherwise null. Nothing here touches the filesystem: the same classifier is used
 * for local-process and container/Tilt failures so the same cause gets the same code.
 */
export const UP_FAILURE_CODES = [
    "PROGRAM_NOT_FOUND",
    "PORT_IN_USE",
    "HEALTHCHECK_FAILED",
    "CRASH_LOOP",
    "DEPENDENCY_FAILED",
    "UNKNOWN",
];
/** The phrase pointed at output printed to a terminal that a machine caller does not have. */
const SEE_OUTPUT_ABOVE = /[,;:\s]*see (?:its|the) output above[.!]?/gi;
const COMMAND_NOT_FOUND = /\b(?:command not found|not found on PATH|ENOENT|is not recognized)\b/i;
const PORT_IN_USE = /\b(?:port\s+\S+\b[^.\n]*\b(?:already\s+)?in use|EADDRINUSE|address already in use|PORT_IN_USE)\b/i;
const DEPENDENCY_FAILED = /\b(?:not started:|did not start|waiting for|depends? on|blocked by|DEPENDENCY_FAILED)\b/i;
const HEALTHCHECK_FAILED = /\b(?:health(?:check)?|no answer from|not ready after|readiness|HEALTHCHECK_FAILED)\b/i;
const CRASH_LOOP = /\b(?:kept exiting|exited with code|exit status|did not exit 0|gave up|exited repeatedly|crash(?:ed|ing| loop)?)\b/i;
/** Shell spellings of "no such program", in the order they are most useful. */
const PROGRAM_PATTERNS = [
    /\bruns\s+`?([^\s`,]+)`?,\s*which is not installed/i,
    /(?:^|[\s/"'])(?:sh|bash|zsh|dash|cmd(?:\.exe)?):\s*(?:\d+:\s*)?([^\s:]+):\s*(?:command not found|not found|is not recognized)/i,
    /\bcommand not found:\s*([^\s"'`]+)/i,
    /\bspawn\s+([^\s"'`]+)\s+ENOENT/i,
    /\b([^\s"'`]+)'?\s+is not recognized/i,
    /\b([^\s"'`]+):\s*command not found/i,
];
function parseExitCode(text) {
    const match = text.match(/\b(?:exit(?:ed)?(?:\s+with)?\s+(?:code|status)|exit code|status)\s+(-?\d+)\b/i);
    if (!match?.[1])
        return null;
    const code = Number(match[1]);
    return Number.isInteger(code) ? code : null;
}
function findMissingProgram(text, known) {
    if (known?.trim())
        return known.trim();
    for (const pattern of PROGRAM_PATTERNS) {
        const match = text.match(pattern);
        if (match?.[1])
            return match[1].replace(/^["'`]+|["'`]+$/g, "");
    }
    return undefined;
}
/** Reason for a machine caller: no "see its output above", and no dangling punctuation after its removal. */
export function machineUpFailureReason(failure) {
    const raw = failure.reason ?? failure.message ?? "failed";
    return (raw
        .replace(SEE_OUTPUT_ABOVE, "")
        .replace(/[\s;,]+$/, "")
        .trim() || "failed");
}
/** Enrich one failure with the fields every `--json` and MCP `up` failure carries. */
export function classifyUpFailure(failure) {
    const text = [failure.reason, failure.message, ...(failure.logs ?? []).slice(-8)]
        .filter((part) => typeof part === "string" && part.length > 0)
        .join("\n");
    const exitCode = failure.exitCode ?? parseExitCode(text);
    const program = findMissingProgram(text, failure.program);
    let code;
    if (exitCode === 127 || program !== undefined || COMMAND_NOT_FOUND.test(text)) {
        // Shells such as /bin/sh report "sleep: not found" without the words "command not found"; the extracted program
        // is the reliable signal in that case.
        code = "PROGRAM_NOT_FOUND";
    }
    else if (PORT_IN_USE.test(text)) {
        code = "PORT_IN_USE";
    }
    else if (DEPENDENCY_FAILED.test(text)) {
        code = "DEPENDENCY_FAILED";
    }
    else if (HEALTHCHECK_FAILED.test(text)) {
        code = "HEALTHCHECK_FAILED";
    }
    else if (CRASH_LOOP.test(text) || (exitCode !== null && exitCode !== 0)) {
        code = "CRASH_LOOP";
    }
    else {
        code = "UNKNOWN";
    }
    let reason = machineUpFailureReason(failure);
    if (code === "PROGRAM_NOT_FOUND" &&
        program &&
        !reason.toLowerCase().includes(program.toLowerCase())) {
        reason = `${reason} (${program} is not on PATH)`;
    }
    const name = failure.name;
    const suggestions = code === "PROGRAM_NOT_FOUND"
        ? [
            program
                ? `Install ${program} so it is on PATH, then run \`flisk up\``
                : "Install the missing program on PATH, then run `flisk up`",
            "Run `flisk doctor` to check your machine",
        ]
        : code === "PORT_IN_USE"
            ? [
                "Run `flisk down` to stop this project's stack",
                "Free the port (or change `port` in service.json), then run `flisk up`",
            ]
            : code === "HEALTHCHECK_FAILED"
                ? [
                    `Run \`flisk logs --service ${name}\` to read its output`,
                    `Fix the cause, then run \`flisk restart ${name}\``,
                ]
                : code === "CRASH_LOOP"
                    ? [
                        `Run \`flisk logs --service ${name} --source runtime\` to read the crash output`,
                        "Fix the cause, then run `flisk up` again",
                    ]
                    : code === "DEPENDENCY_FAILED"
                        ? [
                            "Run `flisk status` to find the dependency that failed",
                            "Fix it, then run `flisk up` again",
                        ]
                        : [
                            `Run \`flisk logs --service ${name}\` to see why it failed`,
                            "Run `flisk doctor` to check the machine",
                        ];
    return {
        ...failure,
        name,
        reason,
        exitCode,
        code,
        suggestions,
        ...(program && code === "PROGRAM_NOT_FOUND" ? { program } : {}),
    };
}
/** Classify every failure in a result. Existing `logs`, `fix` and other fields are preserved. */
export function withUpFailureCodes(failures) {
    return failures.map((failure) => classifyUpFailure(failure));
}
