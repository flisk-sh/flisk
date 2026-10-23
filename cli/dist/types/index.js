// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { RESOURCE_DEFAULTS_FILE, TECH_STACK_FILE } from "../utils/constants.js";
export const RESOURCE_CONFIG_APP_TYPES = [
    "backend",
    "frontend",
    "library",
    "sdk",
    "worker",
    "migrator",
    "mcp",
    "agent",
    "bring-your-own",
];
export const CREATABLE_RESOURCE_TYPES = [
    "backend",
    "frontend",
    "worker",
    "mcp",
    "agent",
    "bring-your-own",
];
/**
 * Every value `flisk resource --type` accepts: the creatable types plus `sdk`, which registers a
 * package that already exists instead of scaffolding one.
 */
export const RESOURCE_TYPE_VALUES = [...CREATABLE_RESOURCE_TYPES, "sdk"];
export function isCreatableResourceType(value) {
    return (typeof value === "string" && CREATABLE_RESOURCE_TYPES.includes(value));
}
/**
 * Type guard to validate filename is a known master config file.
 * Eliminates the need for 'as MasterConfigFileName' assertion.
 */
export function isMasterConfigFileName(filename) {
    const validNames = [TECH_STACK_FILE, RESOURCE_DEFAULTS_FILE, "spec.master"];
    return validNames.includes(filename);
}
