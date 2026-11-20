// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile, execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { join, relative as relativePath, resolve as resolvePath, sep } from "node:path";
import { promisify } from "node:util";
import { toComposeProjectName } from "./compose-project-name.js";
const run = (command, args) => execFileSync(command, args, { encoding: "utf-8", stdio: "pipe", windowsHide: true });
// Unlike `run`, this lets the independent `down` probes overlap instead of blocking the event loop (#4173).
const execFileAsync = promisify(execFile);
const runAsync = async (command, args) => {
    const { stdout } = await execFileAsync(command, args, {
        encoding: "utf-8",
        windowsHide: true,
    });
    return stdout;
};
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
    const prefix = toComposeProjectName(projectName);
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
function parseNetworkNames(output) {
    return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}
/** The names from `docker network ls`, for callers that already listed networks before pruning (#4173). */
export function listProjectNetworks(commandRunner = run) {
    return parseNetworkNames(commandRunner("docker", ["network", "ls", "--format", "{{.Name}}"]));
}
/**
 * Remove this project's own networks. Only the exact names the engine creates are touched, and `docker network rm`
 * itself refuses a network that still has containers attached, so another project's networks and in-use networks
 * are never removed. `existingNetworks` reuses a list read earlier on the idle path, avoiding a second network ls.
 */
export function pruneProjectNetworks(projectName, commandRunner = run, existingNetworks) {
    const existing = new Set(existingNetworks ?? listProjectNetworks(commandRunner));
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
 * What {@link pruneProjectNetworks} would do, without removing anything: the same exact project network names, each
 * checked with `docker ps --filter network=<name>` for running attached containers (the reason `docker network rm`
 * refuses one). `down` stops before it prunes, so containers of the compose projects in `stoppedByDown` (this project's
 * stacks, from {@link projectComposeProjects}) do not count: they will be gone by the time the network is removed.
 */
export function planProjectNetworkPrune(projectName, commandRunner = run, stoppedByDown = []) {
    const existing = new Set(listProjectNetworks(commandRunner));
    const stopped = new Set(stoppedByDown);
    const plan = { remove: [], keep: [] };
    for (const name of projectNetworkNames(projectName)) {
        if (!existing.has(name))
            continue;
        let composeProjects;
        try {
            composeProjects = commandRunner("docker", [
                "ps",
                "--filter",
                `network=${name}`,
                "--format",
                // The `c:` prefix keeps a line for a container without a compose label (an empty label is not "no container").
                'c:{{.Label "com.docker.compose.project"}}',
            ])
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.startsWith("c:"))
                .map((line) => line.slice(2));
        }
        catch (err) {
            const stderr = String(err.stderr ?? err).trim();
            plan.keep.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
            continue;
        }
        const remaining = composeProjects.filter((project) => !project || !stopped.has(project)).length;
        if (remaining > 0) {
            plan.keep.push({
                name,
                reason: `${remaining} container${remaining === 1 ? " is" : "s are"} attached`,
            });
        }
        else {
            plan.remove.push(name);
        }
    }
    return plan;
}
function parseTiltUpPids(output, tiltfilePath) {
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
/**
 * Like {@link findProjectTiltUpPids}, but null when the process list cannot be read (`ps` fails, or the platform has none),
 * so a caller can tell "no tilt up" from "could not look".
 */
export function lookupProjectTiltUpPids(tiltfilePath, platform = process.platform, commandRunner = run) {
    if (platform === "win32")
        return null;
    let output;
    try {
        output = commandRunner("ps", ["-axo", "pid=,command="]);
    }
    catch {
        return null;
    }
    return parseTiltUpPids(output, tiltfilePath);
}
/**
 * PIDs of `tilt up` processes started for this project's Tiltfile. Matching on the Tiltfile path keeps another
 * project's Tilt (or a Tilt the user started by hand) untouched.
 */
export function findProjectTiltUpPids(tiltfilePath, platform = process.platform, commandRunner = run) {
    return lookupProjectTiltUpPids(tiltfilePath, platform, commandRunner) ?? [];
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
function realPathOrSelf(dir) {
    try {
        return realpathSync(dir);
    }
    catch {
        return resolvePath(dir);
    }
}
/**
 * True when `dir` holds Compose files Flisk generated for the project at `root`: `.flisk/.flisk-out` or a service's
 * `.autogenerated` folder. A hand-written Compose project in a subfolder, and anything inside a nested Flisk project (a worktree,
 * a project vendored below this one), lives elsewhere or under its own `.flisk`, so Flisk did not start it.
 */
function isFliskComposeDir(root, dir) {
    if (!dir.startsWith(root + sep))
        return false;
    const parts = relativePath(root, dir).split(sep);
    const generated = join(".flisk", ".flisk-out");
    // Before the rename (#2039) the output folder was `.tdk/.tdk-out`; containers from that layout still hold ports.
    const legacy = join(".tdk", ".tdk-out");
    const head = parts.slice(0, 2).join(sep);
    const inOutput = head === generated || head === legacy;
    if (!inOutput && parts[parts.length - 1] !== ".autogenerated")
        return false;
    const ancestors = inOutput ? [] : parts.slice(0, -1);
    return !ancestors.some((_, i) => existsSync(join(root, ...ancestors.slice(0, i + 1), ".flisk", "project.json")));
}
/** The container-list args shared by `projectComposeProjects` and the concurrent idle probe. */
const CONTAINER_LIST_ARGS = [
    "ps",
    "-a",
    "--format",
    '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}',
];
function parseProjectComposeProjects(output, projectRoot) {
    const root = realPathOrSelf(projectRoot);
    const names = new Set();
    for (const line of output.split(/\r?\n/)) {
        const [name, workingDir] = line.split("\t");
        if (!name || !workingDir)
            continue;
        const dir = realPathOrSelf(workingDir.trim());
        if (isFliskComposeDir(root, dir))
            names.add(name.trim());
    }
    return [...names].sort();
}
/**
 * The Compose projects Flisk generated for this project, read from the containers' `com.docker.compose.project.working_dir`
 * label (the folder of the first compose file). Matching the folder, not the project name, keeps a project named `shop`
 * from taking `shop-admin`'s containers.
 */
export function projectComposeProjects(projectRoot, commandRunner = run) {
    const output = commandRunner("docker", [...CONTAINER_LIST_ARGS]);
    return parseProjectComposeProjects(output, projectRoot);
}
/**
 * Read the independent inputs of `down`'s idle decision together (#4173): the process list, the Docker container list,
 * and (when asked) the Docker network list. Each failure keeps the old meaning: an unreadable process list or a failed
 * container list means "not idle", and a failed network list leaves pruning to warn later as before.
 */
export async function probeProjectIdle(projectRoot, tiltfilePath, options = {}) {
    const platform = options.platform ?? process.platform;
    const commandRunner = options.commandRunner ?? runAsync;
    const [pids, composeProjects, networkNames] = await Promise.all([
        platform === "win32"
            ? Promise.resolve(null)
            : commandRunner("ps", ["-axo", "pid=,command="])
                .then((output) => parseTiltUpPids(output, tiltfilePath))
                .catch(() => null),
        commandRunner("docker", [...CONTAINER_LIST_ARGS])
            .then((output) => parseProjectComposeProjects(output, projectRoot))
            .catch(() => undefined),
        options.listNetworks
            ? commandRunner("docker", ["network", "ls", "--format", "{{.Name}}"])
                .then(parseNetworkNames)
                .catch(() => undefined)
            : Promise.resolve(undefined),
    ]);
    return {
        idle: pids !== null &&
            pids.length === 0 &&
            composeProjects !== undefined &&
            composeProjects.length === 0,
        ...(networkNames ? { networkNames } : {}),
    };
}
/**
 * Every Compose project that has a container whose working folder is `folder` or inside it, whatever generated it. Used by
 * the demo reset, which deletes the folder: a container left running from an older layout (`flisk_demo_postgres`, from
 * `.tdk/` or `services/platform/...`) keeps its host port and the next run fails with "port is already allocated" (#4124).
 */
export function composeProjectsUnder(folder, commandRunner = run) {
    const root = realPathOrSelf(folder);
    const output = commandRunner("docker", [
        "ps",
        "-a",
        "--format",
        '{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}',
    ]);
    const names = new Set();
    for (const line of output.split(/\r?\n/)) {
        const [name, workingDir] = line.split("\t");
        if (!name || !workingDir)
            continue;
        const dir = realPathOrSelf(workingDir.trim());
        if (dir === root || dir.startsWith(root + sep))
            names.add(name.trim());
    }
    return [...names].sort();
}
/** Stops and removes the Compose projects of {@link composeProjectsUnder}. Volumes are kept. Never throws. */
export function stopComposeProjectsUnder(folder, commandRunner = run) {
    const result = { stopped: [], failed: [] };
    let names;
    try {
        names = composeProjectsUnder(folder, commandRunner);
    }
    catch {
        return result; // Docker is not running: there is nothing to stop.
    }
    for (const name of names) {
        try {
            commandRunner("docker", ["compose", "-p", name, "down", "--remove-orphans"]);
            result.stopped.push(name);
        }
        catch (err) {
            const stderr = String(err.stderr ?? err).trim();
            result.failed.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
        }
    }
    return result;
}
/**
 * Stops and removes this project's containers with `docker compose -p <name> down`, for when `tilt down` cannot (its Tiltfile
 * fails to evaluate, #2899). Volumes are kept, as `tilt down` keeps them.
 */
export function stopProjectComposeProjects(projectRoot, commandRunner = run) {
    const result = { stopped: [], failed: [] };
    for (const name of projectComposeProjects(projectRoot, commandRunner)) {
        try {
            commandRunner("docker", ["compose", "-p", name, "down", "--remove-orphans"]);
            result.stopped.push(name);
        }
        catch (err) {
            const stderr = String(err.stderr ?? err).trim();
            result.failed.push({ name, reason: stderr.split(/\r?\n/)[0] ?? "" });
        }
    }
    return result;
}
