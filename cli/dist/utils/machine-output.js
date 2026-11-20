// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { FliskError } from "./errors.js";
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
function resolveFliskErrorCode(error) {
    const customCode = error.code;
    if (typeof customCode === "string" && customCode) {
        return customCode;
    }
    const name = error.name || error.constructor?.name;
    switch (name) {
        case "NotInProjectError":
        case "ProjectConfigNotFoundError":
            return "NOT_IN_PROJECT";
        case "ResourceNotFoundError":
            return "RESOURCE_NOT_FOUND";
        case "UnknownResourceError":
            return "UNKNOWN_RESOURCE";
        case "StackNotFoundError":
            return "STACK_NOT_FOUND";
        case "ConfigInvalidError":
        case "InvalidServiceJsonError":
            return "CONFIG_INVALID";
        case "EnvUnreadableError":
            return "ENV_UNREADABLE";
        case "TiltEventsLoadError":
            return "TILT_EVENTS_LOAD_ERROR";
        case "DirectoryExistsError":
            return "DIRECTORY_EXISTS";
        case "InvalidPathError":
            return "INVALID_PATH";
        case "NoResourcesError":
            return "NO_RESOURCES";
        case "TiltNotInstalledError":
            return "TILT_NOT_INSTALLED";
        case "DockerNotAvailableError":
            return "DOCKER_NOT_AVAILABLE";
        case "DockerNotRespondingError":
            return "DOCKER_NOT_RESPONDING";
        case "UnknownServicesError":
            return "UNKNOWN_SERVICES";
        case "InteractiveTerminalRequiredError":
            return "INTERACTIVE_TERMINAL_REQUIRED";
        default:
            return "COMMAND_FAILED";
    }
}
export function toMachineError(error) {
    if (error instanceof FliskError) {
        return {
            error: {
                code: resolveFliskErrorCode(error),
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
