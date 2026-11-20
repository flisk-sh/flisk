// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { MachineError } from "../types/index.js";
import { FliskError, UnknownResourceError } from "./errors.js";

export const SCHEMA_VERSION = 1 as const;

export interface MachineEnvelope<T> {
  schemaVersion: typeof SCHEMA_VERSION;
  data: T | null;
  errors: MachineError[];
}

/** JSON envelope shape emitted by CLI `--json` commands (`schemaVersion`, `data`, `errors`). */
export type MachineOutputEnvelope = MachineEnvelope<unknown>;

export function createMachineEnvelope<T>(
  data: T | null,
  errors: MachineError[] = [],
): MachineEnvelope<T> {
  return { schemaVersion: SCHEMA_VERSION, data, errors };
}

function isMachineError(value: unknown): value is MachineError {
  if (typeof value !== "object" || value === null) return false;
  const error = value as Record<string, unknown>;
  if (typeof error.code !== "string" || typeof error.message !== "string") return false;
  if (error.suggestions !== undefined) {
    if (!Array.isArray(error.suggestions)) return false;
    if (!error.suggestions.every((item) => typeof item === "string")) return false;
  }
  return true;
}

/** Narrows unknown JSON to the machine-output envelope used by CLI `--json` commands. */
export function isMachineOutputEnvelope(value: unknown): value is MachineOutputEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.schemaVersion !== SCHEMA_VERSION) return false;
  if (!("data" in envelope)) return false;
  if (!Array.isArray(envelope.errors)) return false;
  return envelope.errors.every(isMachineError);
}

function resolveFliskErrorCode(error: FliskError): string {
  const customCode = (error as { code?: unknown }).code;
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

export function toMachineError(error: unknown): { error: MachineError; exitCode: number } {
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
export function writeMachineError(error: unknown): never {
  const result = toMachineError(error);
  console.log(JSON.stringify(createMachineEnvelope(null, [result.error])));
  console.error(result.error.message);
  process.exit(result.exitCode);
}
