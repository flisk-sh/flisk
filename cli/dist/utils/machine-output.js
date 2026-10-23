// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { TdkError } from "./errors.js";
export const SCHEMA_VERSION = 1;
export function createMachineEnvelope(data, errors = []) {
    return { schemaVersion: SCHEMA_VERSION, data, errors };
}
function isMachineError(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const error = value;
    if (typeof error.code !== "string" || typeof error.message !== "string")
        return false;
    if (error.suggestions !== undefined) {
        if (!Array.isArray(error.suggestions))
            return false;
        if (!error.suggestions.every((item) => typeof item === "string"))
            return false;
    }
    return true;
}
/** Narrows unknown JSON to the machine-output envelope used by CLI `--json` commands. */
export function isMachineOutputEnvelope(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const envelope = value;
    if (envelope.schemaVersion !== SCHEMA_VERSION)
        return false;
    if (!("data" in envelope))
        return false;
    if (!Array.isArray(envelope.errors))
        return false;
    return envelope.errors.every(isMachineError);
}
export function toMachineError(error) {
    if (error instanceof TdkError) {
        return {
            error: {
                code: "COMMAND_FAILED",
                message: error.message,
                ...(error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}),
            },
            exitCode: error.exitCode,
        };
    }
    return {
        error: {
            code: "INTERNAL",
            message: error instanceof Error ? error.message : String(error),
        },
        exitCode: 2,
    };
}
/** Keep machine stdout parseable when a command fails before it has data to return. */
export function writeMachineError(error) {
    const result = toMachineError(error);
    console.log(JSON.stringify(createMachineEnvelope(null, [result.error])));
    console.error(result.error.message);
    process.exit(result.exitCode);
}
