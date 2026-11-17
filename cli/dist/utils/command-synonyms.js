// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Common command synonyms or lifecycle verbs that people intuitively try
 * after `flisk up`, mapped to the corresponding Flisk command.
 */
export const COMMAND_SYNONYMS = {
    stop: "down",
    kill: "down",
    start: "up",
};
/**
 * Checks if the unknown command error message matches a known synonym
 * and appends a clear recommendation (e.g. `(Did you mean "flisk down"?)`).
 */
export function enhanceUnknownCommandError(errorMessage) {
    const match = errorMessage.match(/error:\s+unknown command '([^']+)'/i);
    if (!match)
        return errorMessage;
    const unknownName = match[1]?.toLowerCase();
    const suggestion = unknownName ? COMMAND_SYNONYMS[unknownName] : undefined;
    if (!suggestion)
        return errorMessage;
    // Replace commander's spelling typo suggestion if present, or append our synonym suggestion.
    const prefix = `error: unknown command '${match[1]}'`;
    return `${prefix}\n(Did you mean "flisk ${suggestion}"?)\n`;
}
