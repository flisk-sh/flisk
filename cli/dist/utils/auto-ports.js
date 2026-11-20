// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import { PORT_RANGES } from "./constants.js";
import { FliskError } from "./errors.js";
import { createPortClaimer } from "./port-claims.js";
export const AUTO_PORT = "auto";
export function isAutoPort(value) {
    return value === AUTO_PORT;
}
/** The resolved value of `port` in a discovered manifest, before any run-time overlay. */
export function declaredPortOf(resource) {
    // declaredPort keeps the original "auto" even after a numeric overlay, so dependency URL rewrites know what changed.
    const value = resource.declaredPort ?? resource.config?.port;
    return typeof value === "number" || isAutoPort(value) ? value : undefined;
}
const STATE_DIR = join(".flisk", "local");
const STATE_FILE = "auto-ports.json";
export function autoPortStatePath(projectRoot) {
    return join(projectRoot, STATE_DIR, STATE_FILE);
}
function writeState(projectRoot, state) {
    const dir = join(projectRoot, STATE_DIR);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // The state is this checkout's, not the project's: keep it out of git without editing the user's .gitignore.
    const ignore = join(dir, ".gitignore");
    if (!existsSync(ignore))
        writeFileSync(ignore, "*\n", { mode: 0o600 });
    writeFileSync(autoPortStatePath(projectRoot), `${JSON.stringify(state, null, 2)}\n`, {
        mode: 0o600,
    });
}
export function readAutoPortState(projectRoot) {
    try {
        const parsed = JSON.parse(readFileSync(autoPortStatePath(projectRoot), "utf-8"));
        if (parsed.version !== 1 || !parsed.ports || typeof parsed.ports !== "object")
            return new Map();
        const result = new Map();
        for (const [name, entry] of Object.entries(parsed.ports)) {
            if (entry &&
                typeof entry === "object" &&
                typeof entry.port === "number" &&
                Number.isInteger(entry.port)) {
                result.set(name, entry);
            }
        }
        return result;
    }
    catch {
        return new Map();
    }
}
/** The port range a service uses when its port is `auto`. Unknown types use the backend-compatible range. */
export function autoPortRange(resource) {
    const appType = resource.config?.appType ?? resource.type;
    const key = (appType && appType in PORT_RANGES ? appType : "backend");
    const entry = PORT_RANGES[key];
    return { base: entry.base, min: entry.min, max: entry.max, range: entry.range };
}
/** The Compose/Tilt environment variable that carries a service's resolved port into generated `${...}` placeholders. */
export function autoPortEnvName(resource) {
    const name = resource.name.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
    return `FLISK_SERVICE_${name}_PORT`;
}
export function overlayResolvedPorts(resources, resolved, previous = new Map()) {
    return resources.map((resource) => {
        const declared = declaredPortOf(resource);
        const port = resolved.get(resource.name) ?? (typeof declared === "number" ? declared : undefined);
        const autoPort = resolved.has(resource.name) || isAutoPort(declared);
        const config = resource.config
            ? {
                ...resource.config,
                ...(port !== undefined ? { port } : {}),
            }
            : undefined;
        return {
            ...resource,
            ...(config ? { config } : {}),
            ...(port !== undefined ? { port } : {}),
            ...(declared !== undefined ? { declaredPort: declared } : {}),
            ...(previous.has(resource.name) ? { portBeforeAuto: previous.get(resource.name) } : {}),
            ...(autoPort ? { autoPort: true } : {}),
        };
    });
}
/** Overlay the ports remembered from an earlier `flisk up` so status/open/resources report the same addresses. */
export function applySavedAutoPorts(resources, projectRoot) {
    if (!projectRoot)
        return [...resources];
    const saved = readAutoPortState(projectRoot);
    const resolved = new Map();
    const previous = new Map();
    for (const resource of resources) {
        if (!isAutoPort(declaredPortOf(resource)))
            continue;
        const entry = saved.get(resource.name);
        if (!entry)
            continue;
        const range = autoPortRange(resource);
        if (entry.port >= range.min && entry.port <= range.max) {
            resolved.set(resource.name, entry.port);
            previous.set(resource.name, range.base);
        }
    }
    return resolved.size > 0 ? overlayResolvedPorts(resources, resolved, previous) : [...resources];
}
function portIsFree(port, timeoutMs) {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host: "127.0.0.1" }, () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => resolve(true));
        socket.setTimeout(timeoutMs, () => {
            socket.destroy();
            resolve(false);
        });
    });
}
export function autoPortReportFromResources(resources) {
    const report = { autoPorts: [], portsBeforeAuto: [] };
    for (const resource of resources) {
        if (!resource.autoPort || typeof resource.port !== "number")
            continue;
        const declared = declaredPortOf(resource);
        const previous = resource.portBeforeAuto ??
            (typeof declared === "number" ? declared : autoPortRange(resource).base);
        report.autoPorts.push({
            name: resource.name,
            port: resource.port,
            appType: resource.config?.appType ?? resource.type,
            range: autoPortRange(resource).range,
            source: isAutoPort(declared) ? "manifest" : "flag",
        });
        report.portsBeforeAuto.push({ name: resource.name, port: previous });
    }
    return report;
}
/**
 * Choose a free port for every `auto` service (and every service under `--auto-port`), reusing this checkout's saved port
 * while it is still free. Fixed ports and their conflict errors are untouched when `force` is false.
 */
export async function resolveAutoPorts(resources, projectRoot, options = {}) {
    const force = options.force === true;
    const claim = options.claim ?? createPortClaimer(projectRoot);
    const isFree = options.isFree ?? ((port) => portIsFree(port, 1_000));
    const fixedPorts = new Set();
    for (const resource of options.all ?? resources) {
        const declared = declaredPortOf(resource);
        const auto = isAutoPort(declared) || (force && typeof declared === "number");
        if (!auto && typeof declared === "number")
            fixedPorts.add(declared);
    }
    const saved = options.dryRun ? new Map() : readAutoPortState(projectRoot);
    const previousPorts = new Map();
    const chosen = new Map();
    const autoResources = resources
        .filter((resource) => {
        const declared = declaredPortOf(resource);
        return isAutoPort(declared) || (force && typeof declared === "number");
    })
        .sort((a, b) => a.name.localeCompare(b.name));
    for (const resource of autoResources) {
        const declared = declaredPortOf(resource);
        const range = autoPortRange(resource);
        // A manifest "auto" was generated against the appType's base port; --auto-port rewrites the declared number.
        previousPorts.set(resource.name, typeof declared === "number" ? declared : range.base);
        const used = new Set(fixedPorts);
        for (const port of chosen.values())
            used.add(port);
        const remembered = saved.get(resource.name);
        if (remembered &&
            remembered.appType === (resource.config?.appType ?? resource.type) &&
            remembered.port >= range.min &&
            remembered.port <= range.max &&
            !used.has(remembered.port) &&
            (await isFree(remembered.port)) &&
            claim(remembered.port)) {
            chosen.set(resource.name, remembered.port);
            continue;
        }
        let picked = null;
        for (let port = range.base; port <= range.max; port++) {
            if (used.has(port))
                continue;
            if (!(await isFree(port)))
                continue;
            if (!claim(port))
                continue;
            picked = port;
            break;
        }
        if (picked === null) {
            throw new FliskError(`No free port for service "${resource.name}" in range ${range.range}.`, [
                "Stop a service that holds a port in that range, or give the service a fixed port in service.json",
                "See the ports in use with: flisk resources",
            ]);
        }
        chosen.set(resource.name, picked);
    }
    if (!options.dryRun && chosen.size > 0) {
        const next = { version: 1, ports: {} };
        for (const [name, port] of chosen) {
            const resource = resources.find((entry) => entry.name === name);
            next.ports[name] = { port, appType: resource?.config?.appType ?? resource?.type };
        }
        // Keep choices made for services outside this selection: a later `flisk up --only` must not lose them.
        for (const [name, entry] of saved)
            if (!(name in next.ports))
                next.ports[name] = entry;
        writeState(projectRoot, next);
    }
    const env = {};
    for (const resource of autoResources) {
        const port = chosen.get(resource.name);
        if (port !== undefined)
            env[autoPortEnvName(resource)] = String(port);
    }
    const overlaid = overlayResolvedPorts(resources, chosen, previousPorts);
    return {
        ports: chosen,
        previousPorts,
        resources: overlaid,
        report: autoPortReportFromResources(overlaid),
        env,
    };
}
