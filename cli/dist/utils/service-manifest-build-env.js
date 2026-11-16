// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { isPlainObject } from "./is-plain-object.js";
import { ENV_NAME_PATTERN, isPlainText } from "./service-manifest-shared.js";
/**
 * `buildArgs` (bring-your-own): Compose `build.args` for a resource built from its Dockerfile. Values are text, Compose
 * variables included (`${NODE_VERSION:-22}`), written as JSON strings. Mirrors byo_build_args_lines in
 * engine/.../compose/byo_build_logging.star.
 */
export function buildArgsErrors(manifest, displayPath) {
    const args = manifest.buildArgs;
    if (args === undefined || args === null)
        return [];
    const field = `${displayPath}.buildArgs`;
    if (!isPlainObject(args))
        return [`${field}: expected an object of string values such as { "NODE_VERSION": "22" }`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    if (typeof manifest.image === "string" && manifest.image && !manifest.dockerfile) {
        return [
            `${field}: only applies to a resource built from a Dockerfile, not one that runs "image"`,
        ];
    }
    const errors = [];
    for (const [name, value] of Object.entries(args)) {
        if (!ENV_NAME_PATTERN.test(name)) {
            errors.push(`${field}.${name}: names must be letters, digits or _, not starting with a digit`);
        }
        else if (!isPlainText(value)) {
            errors.push(`${field}.${name}: expected a string without line breaks or control characters`);
        }
    }
    return errors;
}
/**
 * `logging` (bring-your-own, #2965): Compose `logging`, such as `{ "driver": "json-file", "options": { "max-size": "5m" } }`.
 * Mirrors byo_logging_section in engine/.../compose/byo_build_logging.star.
 */
export function loggingErrors(manifest, displayPath) {
    const logging = manifest.logging;
    if (logging === undefined || logging === null)
        return [];
    const field = `${displayPath}.logging`;
    if (!isPlainObject(logging)) {
        return [
            `${field}: expected an object such as { "driver": "json-file", "options": { "max-size": "5m" } }`,
        ];
    }
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    for (const key of Object.keys(logging)) {
        if (key !== "driver" && key !== "options")
            errors.push(`${field}.${key}: unknown option (use driver, options)`);
    }
    const { driver, options } = logging;
    if (driver !== undefined &&
        !(typeof driver === "string" && /^[a-z0-9][a-z0-9_.-]*$/.test(driver))) {
        errors.push(`${field}.driver: expected a driver name such as json-file or local`);
    }
    if (options !== undefined) {
        if (!isPlainObject(options)) {
            errors.push(`${field}.options: expected an object of string values such as { "max-size": "5m" }`);
        }
        else {
            for (const [key, value] of Object.entries(options)) {
                if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key)) {
                    errors.push(`${field}.options: keys must be letters, digits, '-', '_' and '.', such as max-size`);
                }
                else if (!isPlainText(value)) {
                    errors.push(`${field}.options.${key}: expected a string without line breaks or control characters`);
                }
            }
        }
    }
    return errors;
}
/**
 * `envFile`: extra env files for a bring-your-own resource, each a path relative to the service directory that must stay inside
 * the project (`serviceDepth` is how many directories the service sits below the project root, unknown when validating a manifest
 * alone). A missing file is not an error. Mirrors engine/.../compose/byo_env_file.star.
 */
export function envFileErrors(manifest, displayPath, serviceDepth) {
    const envFile = manifest.envFile;
    if (envFile === undefined || envFile === null)
        return [];
    const field = `${displayPath}.envFile`;
    if (!Array.isArray(envFile))
        return [`${field}: expected a list of paths such as ["../../../.env"]`];
    if (manifest.appType !== "bring-your-own") {
        return [`${field}: only applies to bring-your-own resources (appType "bring-your-own")`];
    }
    const errors = [];
    envFile.forEach((source, i) => {
        const at = `${field}[${i}]`;
        if (typeof source !== "string" || !/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(source)) {
            errors.push(`${at}: expected a relative file path such as ../../../.env`);
            return;
        }
        if (serviceDepth === undefined)
            return;
        let depth = serviceDepth;
        for (const segment of source.split("/")) {
            if (segment === "..")
                depth -= 1;
            else if (segment !== ".")
                depth += 1;
            if (depth < 0)
                break;
        }
        if (depth < 0)
            errors.push(`${at}: must stay inside the project`);
        else if (depth === 0)
            errors.push(`${at}: expected a file inside the project, not its root`);
    });
    return errors;
}
