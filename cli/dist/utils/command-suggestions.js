// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Intent-based suggestions for common top-level words users type that are not spelling
 * typos of the actual command name (#4491). Spelling-based suggestions remain in place
 * for every other command name.
 */
export const UNKNOWN_COMMAND_SUGGESTIONS = {
    ports: ["networks"],
    port: ["networks"],
    services: ["resources", "status"],
    service: ["resource"],
    ps: ["resources", "status"],
    start: ["up"],
    stop: ["down"],
    kill: ["down"],
    run: ["up"],
    build: ["up"],
};
export function formatDidYouMean(targets) {
    if (targets.length === 0)
        return "";
    if (targets.length === 1)
        return `\n(Did you mean ${targets[0]}?)`;
    return `\n(Did you mean one of ${targets.join(", ")}?)`;
}
/**
 * Replaces Commander's spelling-based suggestion on `error: unknown command '<word>'`
 * when `<word>` has an explicit intent mapping, preserving Commander's spelling suggestion
 * for every other unknown command.
 */
export function rewriteUnknownCommandMessage(message) {
    const match = /^(error: unknown command '([^']+)')(?:\n\(Did you mean [^\n]*\?\))?(\s*)$/.exec(message);
    if (!match?.[1] || !match[2])
        return message;
    const targets = UNKNOWN_COMMAND_SUGGESTIONS[match[2]];
    if (!targets)
        return message;
    return `${match[1]}${formatDidYouMean(targets)}${match[3] ?? ""}`;
}
