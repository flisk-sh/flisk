// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { SERVICE_LOCAL_JSON } from "./constants.js";
import { FliskError } from "./errors.js";
/** The only fields a sibling `service.local.json` may change. */
export const LOCAL_OVERRIDE_FIELDS = [
    "port",
    "enabled",
    "command",
    "env",
];
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
function displayPath(localPath) {
    const fromCwd = relative(process.cwd(), localPath).split(sep).join("/");
    if (fromCwd && !fromCwd.startsWith("../") && !fromCwd.startsWith("..\\"))
        return fromCwd;
    return `${basename(dirname(localPath))}/${SERVICE_LOCAL_JSON}`;
}
function invalid(file, message, suggestions = []) {
    throw new FliskError(`${file}: ${message}`, [
        ...suggestions,
        `Only ${LOCAL_OVERRIDE_FIELDS.join(", ")} may be overridden in ${SERVICE_LOCAL_JSON}`,
    ]);
}
/**
 * Merges every sibling `service.local.json` into a copy of its discovered resource.
 *
 * Generation never calls this: it reads the committed `service.json` only. Callers that start local
 * processes (`flisk up`'s native path and `flisk run`) and commands that report active overrides use
 * this one helper, so the field whitelist and the `env` merge rule live in a single place.
 */
export function applyServiceLocalOverrides(resources) {
    const result = { resources: [], overrides: [] };
    for (const resource of resources) {
        const localPath = join(dirname(resource.configPath), SERVICE_LOCAL_JSON);
        if (!existsSync(localPath)) {
            result.resources.push(resource);
            continue;
        }
        const file = displayPath(localPath);
        let content;
        try {
            content = readFileSync(localPath, "utf-8");
        }
        catch (error) {
            invalid(file, `could not read file: ${error instanceof Error ? error.message : String(error)}`);
        }
        let parsed;
        try {
            parsed = JSON.parse(content);
        }
        catch (error) {
            invalid(file, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            invalid(file, "expected a JSON object");
        }
        const local = parsed;
        const rejected = Object.keys(local)
            .filter((field) => !LOCAL_OVERRIDE_FIELDS.includes(field))
            .sort();
        if (rejected.length > 0) {
            invalid(file, `"${rejected[0]}" cannot be overridden`, rejected.length === 1
                ? [`Remove "${rejected[0]}" from ${SERVICE_LOCAL_JSON}, or put it in service.json`]
                : [
                    `Remove ${rejected.map((field) => `"${field}"`).join(", ")} from ${SERVICE_LOCAL_JSON}`,
                ]);
        }
        if ("port" in local && (!Number.isInteger(local.port) || local.port <= 0)) {
            invalid(file, "port: expected a positive integer");
        }
        if ("enabled" in local && typeof local.enabled !== "boolean") {
            invalid(file, "enabled: expected true or false");
        }
        if ("command" in local && (typeof local.command !== "string" || local.command.trim() === "")) {
            invalid(file, "command: expected a non-empty string");
        }
        let localEnv;
        if ("env" in local) {
            const env = local.env;
            if (!env || typeof env !== "object" || Array.isArray(env)) {
                invalid(file, "env: expected an object of string values (null removes a key)");
            }
            localEnv = env;
            for (const [key, value] of Object.entries(localEnv)) {
                if (!ENV_KEY.test(key)) {
                    invalid(file, `env.${key}: expected a name of letters, digits or _`);
                }
                if (value !== null && typeof value !== "string") {
                    invalid(file, `env.${key}: expected a string or null (null removes the key)`);
                }
            }
        }
        // Discovery caches its resources; never mutate one while applying a per-machine file.
        const config = { ...resource.config };
        const fields = [];
        if ("port" in local) {
            config.port = local.port;
            fields.push("port");
        }
        if ("enabled" in local) {
            config.enabled = local.enabled;
            fields.push("enabled");
        }
        if ("command" in local) {
            config.command = local.command;
            fields.push("command");
        }
        if (localEnv) {
            let env = { ...config.env };
            for (const [key, value] of Object.entries(localEnv)) {
                if (value === null) {
                    env = { ...env };
                    delete env[key];
                }
                else {
                    env = { ...env, [key]: value };
                }
            }
            config.env = env;
            fields.push("env");
        }
        for (const field of fields)
            result.overrides.push({ service: resource.name, field });
        result.resources.push({ ...resource, config, port: config.port });
    }
    return result;
}
