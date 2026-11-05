import { OPTIONAL_INFRA_SERVICES } from "./constants.js";
// Starts and ends with a letter or digit: "-x" and "--json" (an option swallowed as a value) are not names.
export const KEBAB_CASE_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function isKebabCase(value) {
    return KEBAB_CASE_REGEX.test(value);
}
// A resource or stack name becomes a container hostname, and a DNS label is at most 63 characters.
export const MAX_NAME_LENGTH = 63;
const KEBAB_RULE = "Use lowercase letters, numbers, and hyphens only";
function invalidNameMessage(label, value) {
    const example = label === "Resource name" ? "my-service" : "my-stack";
    return `${label} "${value}" is not valid. ${KEBAB_RULE}, e.g. "${example}".`;
}
function tooLongMessage(label, value) {
    return `${label} "${value.slice(0, 20)}..." is ${value.length} characters; the limit is ${MAX_NAME_LENGTH} (it becomes a container hostname).`;
}
export function validateResourceName(name) {
    if (!name.trim()) {
        return { valid: false, error: "Resource name is required" };
    }
    if (!isKebabCase(name)) {
        return { valid: false, error: invalidNameMessage("Resource name", name) };
    }
    if (name.length > MAX_NAME_LENGTH) {
        return { valid: false, error: tooLongMessage("Resource name", name) };
    }
    return { valid: true };
}
export function validateStackName(name) {
    if (!name.trim()) {
        return { valid: false, error: "Stack name is required" };
    }
    if (!isKebabCase(name)) {
        return { valid: false, error: invalidNameMessage("Stack name", name) };
    }
    if (name.length > MAX_NAME_LENGTH) {
        return { valid: false, error: tooLongMessage("Stack name", name) };
    }
    return { valid: true };
}
export function createKebabCaseValidator(context) {
    const validate = context === "resource" ? validateResourceName : validateStackName;
    return (input) => {
        const result = validate(input);
        return result.valid ? true : (result.error ?? "Invalid name");
    };
}
export function validateOptionalInfraService(service) {
    if (includes(OPTIONAL_INFRA_SERVICES, service)) {
        return { valid: true };
    }
    return {
        valid: false,
        error: `Invalid service. Must be one of: ${OPTIONAL_INFRA_SERVICES.join(", ")}`,
    };
}
/**
 * Validate that a port is a valid TCP/UDP port number (1-65535).
 * Accepts either a number or a string representation without leading zeros.
 */
export function isValidPort(port) {
    if (typeof port === "number") {
        return Number.isInteger(port) && port >= 1 && port <= 65535;
    }
    if (typeof port === "string") {
        return /^[1-9]\d{0,4}$/.test(port) && Number(port) <= 65535;
    }
    return false;
}
/**
 * Check a filesystem path segment for characters that are unsafe to use in a
 * path (null bytes, or characters that are invalid on common filesystems).
 * Does not check for path traversal (`..`) - callers that resolve the path
 * against a base directory should check that separately.
 */
export function isPathSafe(path) {
    return !path.includes("\0") && !/[<>:"|?*]/.test(path);
}
/**
 * Like {@link isPathSafe}, for a destination directory that may be absolute: a Windows drive prefix (`D:\` or `D:/`) is
 * allowed, because its colon is not a special character. Any other colon, and every other reserved character, is still
 * refused. Without this `flisk demo --project D:\...` failed with "Invalid path" on a Windows runner. Use isPathSafe, not
 * this, for paths that must stay inside the project (resource paths).
 */
export function isTargetDirSafe(path) {
    return isPathSafe(path.replace(/^[A-Za-z]:(?=[\\/])/, ""));
}
export function sanitizeForShell(value, replacement = "_") {
    return value.replace(/[^a-zA-Z0-9-]/g, replacement).substring(0, 100);
}
export function includes(array, value) {
    return array.includes(value);
}
