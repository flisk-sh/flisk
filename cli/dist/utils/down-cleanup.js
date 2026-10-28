// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
const run = (command, args) => execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });
/** Network names the engine creates per project (see engine/.../docker/constants.star and init-networks). */
const PROJECT_NETWORK_SUFFIXES = [
    "traefik-public",
    "traefik-private",
    "backend",
    "database",
    "infisical-network",
    "verdaccio-network",
    "proxy",
];
/** The engine prefixes networks with the project name, hyphens turned into underscores. */
export function projectNetworkNames(projectName) {
    const prefix = projectName.replace(/-/g, "_");
    return PROJECT_NETWORK_SUFFIXES.map((suffix) => `${prefix}_${suffix}`);
}
/**
 * Prefixes of Flisk projects among `networkNames`, from the networks the engine creates. Generic suffixes such as
 * `backend` also occur in non-Flisk compose projects, so a prefix counts only if it has a Traefik network, which
 * only Flisk creates.
 */
export function fliskNetworkPrefixes(networkNames) {
    const prefixes = new Set();
    for (const name of networkNames) {
        for (const marker of ["traefik-public", "traefik-private"]) {
            if (name.endsWith(`_${marker}`))
                prefixes.add(name.slice(0, -(marker.length + 1)));
        }
    }
    return prefixes;
}
/** The Flisk project prefix a network belongs to (`umami` for `umami_backend`), or null. */
export function fliskNetworkOwner(name, prefixes) {
    for (const suffix of PROJECT_NETWORK_SUFFIXES) {
        if (name.endsWith(`_${suffix}`)) {
            const prefix = name.slice(0, -(suffix.length + 1));
            if (prefixes.has(prefix))
                return prefix;
        }
    }
    return null;
}
/**
 * Remove this project's own networks. Only the exact names the engine creates are touched, and `docker network rm`
 * itself refuses a network that still has containers attached, so another project's networks and in-use networks
 * are never removed.
 */
export function pruneProjectNetworks(projectName, commandRunner = run) {
    const existing = new Set(commandRunner("docker", ["network", "ls", "--format", "{{.Name}}"])
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean));
    const result = { removed: [], kept: [] };
    for (const name of projectNetworkNames(projectName)) {
        if (!existing.has(name))
            continue;
        try {
            commandRunner("docker", ["network", "rm", name]);
            result.removed.push(name);
        }
        catch (err) {
            const stderr = String(err.stderr ?? err).trim();
            result.kept.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
        }
    }
    return result;
}
/**
 * PIDs of `tilt up` processes started for this project's Tiltfile. Matching on the Tiltfile path keeps another
 * project's Tilt (or a Tilt the user started by hand) untouched.
 */
export function findProjectTiltUpPids(tiltfilePath, platform = process.platform, commandRunner = run) {
    if (platform === "win32")
        return [];
    let output;
    try {
        output = commandRunner("ps", ["-axo", "pid=,command="]);
    }
    catch {
        return [];
    }
    const pids = [];
    for (const line of output.split(/\r?\n/)) {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line);
        if (!match)
            continue;
        const command = match[2] ?? "";
        const exe = (command.split(/\s+/)[0] ?? "").split("/").at(-1);
        const target = ` -f ${tiltfilePath}`;
        const at = command.indexOf(target);
        const boundary = command[at + target.length];
        if (exe === "tilt" &&
            /^\S+\s+up\s/.test(command) &&
            at > 0 &&
            (boundary === undefined || boundary === " ")) {
            pids.push(Number(match[1]));
        }
    }
    return pids;
}
const PROJECT_TILTFILE_SUFFIX = "/.flisk/.flisk-out/Tiltfile";
/**
 * Roots of the Flisk projects that have a `tilt up` running, read from each process's `-f <root>/.flisk/.flisk-out/Tiltfile`
 * (the Tiltfile `flisk up` passes). Lets `flisk down` find the project when it runs outside one. A root counts only while
 * it still has `.flisk/project.json`.
 */
export function findRunningFliskProjects(platform = process.platform, commandRunner = run, isProject = (root) => existsSync(join(root, ".flisk", "project.json"))) {
    if (platform === "win32")
        return [];
    let output;
    try {
        output = commandRunner("ps", ["-axo", "pid=,command="]);
    }
    catch {
        return [];
    }
    const roots = new Set();
    for (const line of output.split(/\r?\n/)) {
        const command = /^\s*\d+\s+(.*)$/.exec(line)?.[1] ?? "";
        const exe = (command.split(/\s+/)[0] ?? "").split("/").at(-1);
        if (exe !== "tilt" || !/^\S+\s+up\s/.test(command))
            continue;
        const tiltfile = / -f (\/.*?\/\.flisk\/\.flisk-out\/Tiltfile)(?= |$)/.exec(command)?.[1];
        if (!tiltfile)
            continue;
        const root = tiltfile.slice(0, -PROJECT_TILTFILE_SUFFIX.length);
        if (isProject(root))
            roots.add(root);
    }
    return [...roots].sort();
}
export function stopProjectTiltUp(tiltfilePath, platform = process.platform, commandRunner = run) {
    const pids = findProjectTiltUpPids(tiltfilePath, platform, commandRunner);
    for (const pid of pids) {
        try {
            commandRunner("kill", ["-TERM", String(pid)]);
        }
        catch {
            // Already gone.
        }
    }
    return pids;
}
/** Wait (up to `timeoutMs`) for the `tilt up` processes to exit after TERM, so `tilt down` does not race a live Tilt. */
export async function waitForTiltUpExit(tiltfilePath, timeoutMs = 8000, findPids = findProjectTiltUpPids) {
    const deadline = Date.now() + timeoutMs;
    while (findPids(tiltfilePath).length > 0) {
        if (Date.now() >= deadline)
            return false;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return true;
}
