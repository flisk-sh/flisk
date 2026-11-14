// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { STANDARD_PORTS } from "./constants.js";
import { isValidPort } from "./validation.js";
export function parseTiltPort(value) {
    if (value === undefined || value === "")
        return { ok: true, port: undefined };
    const port = Number(value);
    if (/[^0-9]/.test(value) || !isValidPort(port)) {
        return {
            ok: false,
            message: `Invalid TILT_PORT "${value}": expected an integer from 1 to 65535.`,
        };
    }
    return { ok: true, port };
}
/** Resolve the port for read-only polling, falling back when TILT_PORT is absent or invalid. */
export function getTiltPollingPort(value) {
    const result = parseTiltPort(value);
    return result.ok ? (result.port ?? STANDARD_PORTS.tiltUi) : STANDARD_PORTS.tiltUi;
}
export function secondUpAction(input) {
    if (input.runningPorts.length === 0 || input.force)
        return { action: "start" };
    if (input.only)
        return { action: "only-blocked", ports: input.runningPorts };
    return { action: "already-running", ports: input.runningPorts };
}
/**
 * What a second `flisk up` says about the Tilt it found running. A failed `flisk up` leaves its Tilt running, so
 * "a Tilt answers on the port" is not "the stack is healthy": report what that Tilt is running.
 */
export function alreadyRunningReport(port, readiness) {
    if (readiness.ready) {
        return { ok: true, message: `Environment is already running on port ${port}.` };
    }
    const detail = readiness.failures.map((f) => `${f.name}: ${f.message}`).join("; ");
    const building = readiness.stillBuilding && readiness.stillBuilding.length > 0
        ? ` (${readiness.stillBuilding.join(", ")} still building)`
        : "";
    const state = readiness.failures.length > 0
        ? `is not healthy${detail ? ` (${detail})` : ""}`
        : `is still starting${building}`;
    return {
        ok: false,
        code: readiness.failures.length > 0 ? "UP_RESOURCE_FAILED" : "UP_TIMEOUT",
        message: `The stack already running on port ${port} ${state}. An earlier flisk up left it running.`,
        suggestions: [
            "See what failed: flisk status",
            "Fix the cause, then replace the running stack: flisk down && flisk up",
        ],
    };
}
export async function resolveTiltPort(options) {
    if (options.configuredPort !== undefined) {
        return { port: options.configuredPort, autoSwitched: false };
    }
    if (options.force)
        return { port: options.basePort, autoSwitched: false };
    const availablePort = await options.findAvailablePort(options.basePort, 10);
    if (availablePort && availablePort !== options.basePort) {
        return { port: availablePort, autoSwitched: true };
    }
    if (!availablePort && options.fallbackPort !== undefined) {
        return { port: options.fallbackPort, autoSwitched: options.fallbackPort !== options.basePort };
    }
    return { port: options.basePort, autoSwitched: false };
}
/**
 * Under --force, stop the Tilt on the port this run starts on, and this project's own Tilt on any other port (`ownPorts`), so
 * the replaced stack does not keep running beside the new one (#4165). `force` is false when another project holds the base
 * port; `ownPorts` are still this project's and are stopped.
 */
export async function stopTiltForUp(options, dependencies) {
    const ports = [
        ...new Set([...(options.force ? [options.port] : []), ...(options.ownPorts ?? [])]),
    ];
    if (ports.length === 0)
        return;
    if (!options.quiet) {
        dependencies.log(`Force flag set - stopping Tilt on port ${ports.join(", ")} if running...`);
    }
    for (const port of ports)
        dependencies.stop(port);
    await dependencies.wait(2000);
}
/** The ports among `ports` that still serve a Tilt after waiting up to `timeoutMs` for them to stop. */
export async function waitForTiltPortsToStop(ports, isServing, options = {}) {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 500;
    const wait = options.wait ??
        ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let remaining = [...ports];
    for (let waited = 0;; waited += intervalMs) {
        const stillServing = [];
        for (const port of remaining)
            if (await isServing(port))
                stillServing.push(port);
        remaining = stillServing;
        if (remaining.length === 0 || waited >= timeoutMs)
            return remaining;
        await wait(intervalMs);
    }
}
