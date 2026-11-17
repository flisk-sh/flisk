// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FliskError } from "./errors.js";
import { discoverServiceManifestPaths } from "./services.js";
/**
 * `flisk resource` picks a port from the resources it found when it started and writes service.json later. Several creates
 * at once (shell `&`, or agents calling the `resource_create` MCP tool together) all start from the same scan, so they
 * picked the same port and all exited 0 (#4023). A create now claims its port in a per-project claim folder and then reads
 * the ports in service.json again: a port
 * that another create holds or has written in the meantime is skipped, or refused when --port asked for it.
 */
/** One claim folder per project, outside the project so nothing has to be ignored in git. */
export function resourcePortClaimDir(projectRoot) {
    const key = createHash("sha256").update(path.resolve(projectRoot)).digest("hex").slice(0, 16);
    return path.join(tmpdir(), "flisk-resource-port-claims", key);
}
/** The ports every service.json in the project has on disk now, except the one at `ignorePath`. */
export function readAssignedPorts(projectRoot, ignorePath) {
    const ignored = ignorePath === undefined ? undefined : path.resolve(ignorePath);
    const ports = new Set();
    for (const file of discoverServiceManifestPaths(projectRoot)) {
        if (ignored !== undefined && path.resolve(file) === ignored)
            continue;
        try {
            const port = JSON.parse(readFileSync(file, "utf-8")).port;
            if (typeof port === "number" && port > 0)
                ports.add(port);
        }
        catch {
            // An unreadable service.json is reported by discovery; it holds no port here.
        }
    }
    return ports;
}
/** The path of another service.json in the project that uses `port`, or undefined. */
export function findPortOwner(projectRoot, port, ignorePath) {
    const ignored = path.resolve(ignorePath);
    for (const file of discoverServiceManifestPaths(projectRoot)) {
        if (path.resolve(file) === ignored)
            continue;
        try {
            if (JSON.parse(readFileSync(file, "utf-8")).port === port) {
                return path.relative(projectRoot, file);
            }
        }
        catch {
            // Unreadable manifests hold no port here.
        }
    }
    return undefined;
}
export function resourcePortReservation(projectRoot, options = {}) {
    const owner = options.owner ?? `resource:${process.pid}:${randomUUID()}`;
    const dir = options.dir ?? resourcePortClaimDir(projectRoot);
    const alive = options.isProcessAlive ??
        ((pid) => {
            try {
                process.kill(pid, 0);
                return true;
            }
            catch (error) {
                return error.code === "EPERM";
            }
        });
    // Serialize claim-file changes, including stale recovery. A half-written file must never be stolen by another create.
    // A crash while holding this tiny synchronous guard leaves that port reserved; automatic allocation skips it safely.
    const guarded = (port, action) => {
        const guard = path.join(dir, `${port}.guard`);
        try {
            mkdirSync(dir, { recursive: true });
            try {
                mkdirSync(guard);
            }
            catch (error) {
                if (error.code === "EEXIST")
                    return false;
                throw error;
            }
            try {
                return action(path.join(dir, `${port}.json`));
            }
            finally {
                rmdirSync(guard);
            }
        }
        catch (error) {
            throw new FliskError(`Cannot reserve a resource port: ${String(error)}`, [
                "Check that the temporary directory is writable, then try again",
            ]);
        }
    };
    return {
        claim: (port) => guarded(port, (file) => {
            let held;
            try {
                held = JSON.parse(readFileSync(file, "utf8"));
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            if (held && held.owner !== owner && alive(held.pid))
                return false;
            writeFileSync(file, JSON.stringify({ owner, pid: process.pid }));
            return true;
        }),
        release: (port) => {
            guarded(port, (file) => {
                try {
                    if (JSON.parse(readFileSync(file, "utf8")).owner === owner)
                        unlinkSync(file);
                }
                catch (error) {
                    if (error.code !== "ENOENT")
                        throw error;
                }
                return true;
            });
        },
        assignedPorts: () => readAssignedPorts(projectRoot, options.ignorePath),
    };
}
/**
 * Claims `port`, or the next port up to `max` that no other create holds and no service.json has. The claim comes first
 * and the service.json read second, so a create that wrote between this one's scan and its claim is still seen.
 */
export async function reserveResourcePort(port, options, reservation) {
    const last = options.explicit ? port : Math.max(port, options.max);
    for (let candidate = port; candidate <= last; candidate++) {
        if (!reservation.claim(candidate))
            continue;
        try {
            const taken = reservation.assignedPorts().has(candidate) ||
                (candidate !== port && options.isFree !== undefined && !(await options.isFree(candidate)));
            if (!taken)
                return { port: candidate, release: () => reservation.release(candidate) };
        }
        catch (error) {
            reservation.release(candidate);
            throw error;
        }
        reservation.release(candidate);
    }
    if (options.explicit) {
        throw new FliskError(`${options.subject ?? "Port"} ${port} is already assigned to another resource.`, [
            "See the ports in use with: flisk resources",
            "Pick another port, or leave the flag out and Flisk assigns a free one",
        ]);
    }
    throw new FliskError(`No available ports from ${port} through ${options.max}.`, [
        "See which ports are assigned with: flisk resources",
        "Remove a resource you no longer use, or set a free port with --port",
    ]);
}
