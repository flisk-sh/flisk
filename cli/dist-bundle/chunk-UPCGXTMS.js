import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  OPTIONAL_INFRA_SERVICES
} from "./chunk-73W4Y4TI.js";

// dist/utils/validation.js
var KEBAB_CASE_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function isKebabCase(value) {
  return KEBAB_CASE_REGEX.test(value);
}
var MAX_NAME_LENGTH = 63;
var KEBAB_RULE = "Use lowercase letters, numbers, and hyphens only";
function invalidNameMessage(label, value) {
  const example = label === "Resource name" ? "my-service" : "my-stack";
  return `${label} "${value}" is not valid. ${KEBAB_RULE}, e.g. "${example}".`;
}
function tooLongMessage(label, value) {
  return `${label} "${value.slice(0, 20)}..." is ${value.length} characters; the limit is ${MAX_NAME_LENGTH} (it becomes a container hostname).`;
}
function validateResourceName(name) {
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
function validateStackName(name) {
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
function createKebabCaseValidator(context) {
  const validate = context === "resource" ? validateResourceName : validateStackName;
  return (input) => {
    const result = validate(input);
    return result.valid ? true : result.error ?? "Invalid name";
  };
}
function validateOptionalInfraService(service) {
  if (includes(OPTIONAL_INFRA_SERVICES, service)) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Invalid service. Must be one of: ${OPTIONAL_INFRA_SERVICES.join(", ")}`
  };
}
function isValidPort(port) {
  if (typeof port === "number") {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }
  if (typeof port === "string") {
    return /^[1-9]\d{0,4}$/.test(port) && Number(port) <= 65535;
  }
  return false;
}
function isPathSafe(path) {
  return !path.includes("\0") && !/[<>:"|?*]/.test(path);
}
function isTargetDirSafe(path) {
  return isPathSafe(path.replace(/^[A-Za-z]:(?=[\\/])/, ""));
}
function sanitizeForShell(value, replacement = "_") {
  return value.replace(/[^a-zA-Z0-9-]/g, replacement).substring(0, 100);
}
function includes(array, value) {
  return array.includes(value);
}

export {
  validateResourceName,
  validateStackName,
  createKebabCaseValidator,
  validateOptionalInfraService,
  isValidPort,
  isPathSafe,
  isTargetDirSafe,
  sanitizeForShell,
  includes
};
