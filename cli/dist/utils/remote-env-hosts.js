// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join, relative } from "node:path";
import { PROJECT_JSON } from "./constants.js";
import { parseEnv } from "./env-validator.js";
import { findProjectRoot } from "./paths.js";
import { discoverResourcesFromRoot } from "./services.js";
const CHECK_NAME = "Remote hosts in env";
/** Env files in a service folder that its own dev server reads. */
const SERVICE_ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const LOCAL_SUFFIXES = [".localhost", ".local", ".internal", ".test", ".example", ".invalid"];
const HOST_KEY = /(^|_)(HOST|HOSTNAME|DOMAIN)$/;
/**
 * The host a value points at, or undefined when it names none: a URL (`https://api.example.com/x`,
 * `postgres://u:p@db.example.com:5432/app`), or the plain value of a `*_HOST`/`*_HOSTNAME`/`*_DOMAIN` variable.
 */
export function hostOfValue(key, value) {
    const trimmed = value.trim();
    // An unresolved reference (`${API_HOST}`) is not a host yet.
    if (!trimmed || trimmed.includes("${"))
        return undefined;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        try {
            const host = new URL(trimmed).hostname;
            return host ? host.replace(/^\[|\]$/g, "").toLowerCase() : undefined;
        }
        catch {
            return undefined;
        }
    }
    if (HOST_KEY.test(key.toUpperCase()) && /^[a-z0-9.-]+(:\d+)?$/i.test(trimmed)) {
        return trimmed.replace(/:\d+$/, "").toLowerCase();
    }
    return undefined;
}
function isPrivateOrLoopbackIp(host) {
    const version = isIP(host);
    if (version === 4) {
        const [a = 0, b = 0] = host.split(".").map(Number);
        return (a === 127 ||
            a === 10 ||
            a === 0 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168));
    }
    if (version === 6) {
        const lower = host.toLowerCase();
        return (lower === "::1" ||
            lower === "::" ||
            lower.startsWith("fc") ||
            lower.startsWith("fd") ||
            lower.startsWith("fe80"));
    }
    return false;
}
function matchesAllowed(host, allowed) {
    return allowed.some((pattern) => {
        const p = pattern.trim().toLowerCase();
        if (!p)
            return false;
        if (p.startsWith("*."))
            return host === p.slice(2) || host.endsWith(p.slice(1));
        return host === p;
    });
}
/**
 * True when a host is part of the local stack: localhost and the local suffixes, a loopback or private IP, a one-word
 * name (a Compose service or container on the stack network), a discovered service or stack, or an allowed host.
 */
export function isLocalHost(host, localNames, allowedHosts = []) {
    const h = host.toLowerCase();
    if (h === "localhost" || LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix)))
        return true;
    if (h === "host.docker.internal")
        return true;
    if (isIP(h))
        return isPrivateOrLoopbackIp(h);
    if (!h.includes("."))
        return true;
    if (localNames.has(h))
        return true;
    return matchesAllowed(h, allowedHosts);
}
/** `allowedHosts` from `.flisk/project.json`: hosts that are meant to be remote (a payment sandbox, a model API). */
export function readAllowedHosts(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
        return Array.isArray(parsed?.allowedHosts)
            ? parsed.allowedHosts.filter((entry) => typeof entry === "string")
            : [];
    }
    catch {
        return [];
    }
}
function stringEntries(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    return Object.entries(value).filter((entry) => typeof entry[1] === "string");
}
function readEnvFile(path) {
    try {
        return [...parseEnv(readFileSync(path, "utf-8")).entries()];
    }
    catch {
        return [];
    }
}
/** Every env value in the project that points at a host outside the local stack. */
export function scanRemoteEnvHosts(projectRoot, resources = discoverResourcesFromRoot(projectRoot)) {
    const localNames = new Set();
    for (const resource of resources) {
        localNames.add(resource.name.toLowerCase());
        if (resource.stack)
            localNames.add(resource.stack.toLowerCase());
    }
    const allowed = readAllowedHosts(projectRoot);
    const findings = [];
    const seen = new Set();
    const add = (service, source, entries) => {
        for (const [variable, value] of entries) {
            const host = hostOfValue(variable, value);
            if (!host || isLocalHost(host, localNames, allowed))
                continue;
            const key = `${service}\0${variable}\0${host}\0${source}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            findings.push({ service, variable, host, source });
        }
    };
    const projectEnv = join(projectRoot, ".env");
    if (existsSync(projectEnv))
        add("(project)", ".env", readEnvFile(projectEnv));
    for (const resource of resources) {
        const config = (resource.config ?? {});
        add(resource.name, "service.json env", stringEntries(config.env));
        add(resource.name, "service.json params", stringEntries(config.params));
        for (const file of SERVICE_ENV_FILES) {
            const path = join(resource.path, file);
            if (existsSync(path))
                add(resource.name, relative(projectRoot, path) || file, readEnvFile(path));
        }
    }
    return findings;
}
/**
 * `flisk doctor`: env values that point outside the local stack. A warning by default (a remote host can be intended);
 * a failure with --strict. Names the service, the variable, the host and where it is set, never the value.
 */
export function checkRemoteEnvHosts(projectRoot = findProjectRoot() ?? process.cwd(), strict = false) {
    let findings;
    try {
        findings = scanRemoteEnvHosts(projectRoot);
    }
    catch {
        return {
            name: CHECK_NAME,
            didPass: true,
            isSkipped: true,
            message: "Could not read the services - skipped the remote host check",
        };
    }
    if (findings.length === 0) {
        return {
            name: CHECK_NAME,
            didPass: true,
            message: "Every host in the env points at the local stack",
        };
    }
    const list = findings
        .map((f) => `${f.service} ${f.variable} -> ${f.host} (${f.source})`)
        .join("\n    ");
    return {
        name: CHECK_NAME,
        didPass: !strict,
        isWarning: !strict,
        message: `${findings.length === 1 ? "1 value points" : `${findings.length} values point`} outside the local stack:\n    ${list}`,
        fix: 'Point them at a local service (http://<service>:<port>, *.localhost), or list hosts that are meant to be remote in "allowedHosts" in .flisk/project.json',
    };
}
