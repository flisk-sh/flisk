import type { ValidationResult } from "../types/index.js";
export declare const KEBAB_CASE_REGEX: RegExp;
export declare function validateResourceName(name: string): ValidationResult;
export declare function validateStackName(name: string): ValidationResult;
export declare function createKebabCaseValidator(context: "resource" | "stack"): (input: string) => true | string;
export declare function validateOptionalInfraService(service: string): ValidationResult;
/**
 * Validate that a port is a valid TCP/UDP port number (1-65535).
 * Accepts either a number or a string representation without leading zeros.
 */
export declare function isValidPort(port: number | string): boolean;
/**
 * Check a filesystem path segment for characters that are unsafe to use in a
 * path (null bytes, or characters that are invalid on common filesystems).
 * Does not check for path traversal (`..`) - callers that resolve the path
 * against a base directory should check that separately.
 */
export declare function isPathSafe(path: string): boolean;
export declare function sanitizeForShell(value: string, replacement?: string): string;
export declare function includes<T extends readonly string[]>(array: T, value: string): value is T[number];
