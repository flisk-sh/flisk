// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseTiltProcesses } from "./doctor-wiring.js";
import { findTiltProcessIdsOnPort, stopTiltProcessIds } from "./tilt-process.js";
const run = (command, args) => execFileSync(command, args, {
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 5000,
    windowsHide: true,
});
/**
 * The project whose `tilt up` listens on `port`, or null when it cannot be told (no lsof, Windows, a Tilt started
 * without `-f`, a listener that is not Tilt). Callers must treat null as "unknown", not as "not mine".
 */
export function findTiltPortOwner(port, platform = process.platform, commandRunner = run) {
    if (platform === "win32")
        return null;
    try {
        const pids = commandRunner("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        for (const pid of pids) {
            const command = commandRunner("ps", ["-p", pid, "-o", "command="]).trim();
            const [owner] = parseTiltProcesses(`${pid} ${command}`);
            if (owner)
                return owner;
        }
    }
    catch {
        // lsof exits 1 when nothing listens, and may be missing.
    }
    return null;
}
/** Symlinked checkouts (macOS /tmp -> /private/tmp) must not make a project look foreign to itself. */
function canonical(path) {
    try {
        return realpathSync(path);
    }
    catch {
        return resolve(path);
    }
}
/** Whether `owner` is confirmed to belong to this project's Tiltfile. */
export function isOwnTilt(owner, projectRoot) {
    return owner !== null && canonical(owner.root) === canonical(projectRoot);
}
/** Whether `owner` is another project's Tilt, as opposed to this project's or unknown. */
export function isForeignTilt(owner, projectRoot) {
    return owner !== null && canonical(owner.root) !== canonical(projectRoot);
}
/**
 * The one "which project owns the Tilt on this port" lookup shared by `status` and `doctor`.
 * Null means this project's Tilt, an unknown owner, or no project to compare against; callers
 * must not treat it as proof that this project is running.
 */
export function findForeignTiltOnPort(port, projectRoot, ownerOf = findTiltPortOwner) {
    if (!projectRoot)
        return null;
    const owner = ownerOf(port);
    if (!owner || !isForeignTilt(owner, projectRoot))
        return null;
    return { port, root: owner.root };
}
/** Split the candidate Tilt UI ports that answer into this project's and other projects'. */
export async function classifyTiltPorts(candidatePorts, projectRoot, isServing, ownerOf = findTiltPortOwner) {
    const result = { running: [], foreign: [] };
    for (const port of candidatePorts) {
        if (!(await isServing(port)))
            continue;
        const owner = ownerOf(port);
        if (owner && isForeignTilt(owner, projectRoot))
            result.foreign.push({ port, root: owner.root });
        else
            result.running.push(port);
    }
    return result;
}
/**
 * The Tilt UI ports `flisk up` treats as this project's running Tilt. The watched ports are classified as before. The port
 * the last `flisk up` saved is checked too: a project whose first run moved off 10350 (another project's Tilt held it) keeps
 * its Tilt on that port, and a second run that looked at 10350 alone started another Tilt for the same Tiltfile on the next
 * free port (#4165). The saved port only adds to `running`. Another project's Tilt on it is not reported in `foreign`,
 * because this run never asked for that port. Only confirmed project-owned saved ports enter `savedRunning` for `--force`.
 */
export async function findProjectTiltPorts(options) {
    const ownerOf = options.ownerOf ?? findTiltPortOwner;
    const confirmedWatched = [];
    const unknownWatched = [];
    const foreign = [];
    for (const port of options.watchedPorts) {
        if (!(await options.isServing(port)))
            continue;
        const owner = ownerOf(port);
        if (owner && isForeignTilt(owner, options.projectRoot)) {
            foreign.push({ port, root: owner.root });
        }
        else if (isOwnTilt(owner, options.projectRoot)) {
            confirmedWatched.push(port);
        }
        else {
            unknownWatched.push(port);
        }
    }
    const watchedRunning = [...confirmedWatched, ...unknownWatched];
    const savedPort = options.savedPort;
    if (savedPort === null || options.watchedPorts.includes(savedPort)) {
        return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
    }
    if (!(await options.isServing(savedPort))) {
        return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
    }
    const savedOwner = ownerOf(savedPort);
    if (isOwnTilt(savedOwner, options.projectRoot) && savedOwner !== null) {
        // Prefer confirmed project ownership over an unknown watched listener (e.g. another project's plain `tilt up` without `-f`).
        return {
            running: [...confirmedWatched, savedPort],
            foreign,
            savedRunning: [savedPort],
            unknownSaved: [],
        };
    }
    if (isForeignTilt(savedOwner, options.projectRoot)) {
        return { running: watchedRunning, foreign, savedRunning: [], unknownSaved: [] };
    }
    // Unknown ownership is not confirmation: the saved listener is never reported as this project's in `running`. It is
    // returned in `unknownSaved` so --force can refuse rather than start a second Tilt beside it.
    if (confirmedWatched.length > 0) {
        return { running: confirmedWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
    }
    return { running: unknownWatched, foreign, savedRunning: [], unknownSaved: [savedPort] };
}
/**
 * Stop a Tilt on `port` only after re-verifying that the current listener is a `tilt` process owned by `projectRoot`
 * (and matching `expectedOwner.pid` when provided). Prevents `--force` from killing an unrelated or unknown-owner Tilt
 * that reused a stale saved port.
 */
export function stopOwnedTiltOnPort(port, projectRoot, expectedOwner, platform = process.platform, commandRunner = run) {
    const currentOwner = findTiltPortOwner(port, platform, commandRunner);
    if (!isOwnTilt(currentOwner, projectRoot) || currentOwner === null) {
        return [];
    }
    if (expectedOwner && currentOwner.pid !== expectedOwner.pid) {
        return [];
    }
    const tiltPids = findTiltProcessIdsOnPort(port, platform, commandRunner);
    if (!tiltPids.includes(currentOwner.pid)) {
        return [];
    }
    return stopTiltProcessIds([currentOwner.pid], platform, commandRunner);
}
