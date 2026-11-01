// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
/**
 * Containers in a local-process run (mixed runtime). A project whose app runs as local processes often keeps its database and
 * cache in Docker: Postgres and Redis from a Compose file, the API and the website with `npm run dev`. A service with an `image`
 * and no `command` joins such a run: `flisk up` starts it with `docker run` next to the local processes, in `dependsOn` order,
 * with no Tilt, no Traefik and no generated files. The supervisor treats the `docker run` line like any other command, so logs,
 * readiness, restarts and `flisk down` work the same way.
 *
 * The container is published on 127.0.0.1 at `port` (the port the container listens on), plus each `extraPorts` entry, so the
 * local processes reach it at localhost. A dependent never reaches it by service name: there is no shared Docker network.
 */
/** Label on every container a mixed run starts, so `flisk down` finds them even when the supervisor was killed. */
export const NATIVE_CONTAINER_LABEL = "sh.flisk.native-root";
/** True for a service a mixed run starts as a container: a ready-made `image`, no `command`, nothing to build. */
export function isNativeContainerService(resource) {
    const config = (resource.config ?? {});
    if (typeof config.command === "string" && config.command.trim() !== "")
        return false;
    if (typeof config.image !== "string" || config.image.trim() === "")
        return false;
    return config.dockerfile === undefined && config.buildContext === undefined;
}
/** The container name for a service: one per project and service, so a second `flisk up` replaces the first. */
export function nativeContainerName(projectName, service) {
    return `flisk-${projectName}-${service}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}
/** Quotes one word for /bin/sh. */
export function shellQuote(word) {
    return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, `'\\''`)}'`;
}
const STRING_LIST_OPTIONS = {
    capAdd: "--cap-add",
    capDrop: "--cap-drop",
    securityOpt: "--security-opt",
};
/**
 * The `docker run` arguments for one container service, without the program name. `env` keys are passed by name only
 * (`-e KEY`), so their values reach the container from the environment of the `docker` process and never show in `ps`.
 * Returns the errors that stop the run instead of guessing (a bind mount that leaves the project).
 */
export function dockerRunArgs(resource, options) {
    const config = (resource.config ?? {});
    const name = nativeContainerName(options.projectName, resource.name);
    const errors = [];
    const args = [
        "run",
        "--rm",
        "--name",
        name,
        "--label",
        `${NATIVE_CONTAINER_LABEL}=${options.projectRoot}`,
    ];
    const port = typeof config.port === "number" ? config.port : undefined;
    if (port !== undefined)
        args.push("-p", `127.0.0.1:${port}:${port}`);
    for (const entry of Array.isArray(config.extraPorts)
        ? config.extraPorts
        : []) {
        if (typeof entry?.port !== "number")
            continue;
        const hostPort = typeof entry.hostPort === "number" ? entry.hostPort : entry.port;
        const bind = typeof entry.bind === "string" ? entry.bind : "127.0.0.1";
        const protocol = entry.protocol === "udp" ? "/udp" : "";
        args.push("-p", `${bind}:${hostPort}:${entry.port}${protocol}`);
    }
    for (const key of options.envKeys)
        args.push("-e", key);
    for (const volume of Array.isArray(config.volumes) ? config.volumes : []) {
        if (typeof volume?.source !== "string" || typeof volume.target !== "string")
            continue;
        const readOnly = volume.readOnly === true ? ":ro" : "";
        if (volume.source.startsWith("./") || volume.source.startsWith("../")) {
            const path = resolve(resource.path, volume.source);
            const inside = relative(options.projectRoot, path);
            if (inside.startsWith("..") || isAbsolute(inside)) {
                errors.push(`service "${resource.name}": volume ${volume.source} is outside the project; bind mounts must stay inside it`);
                continue;
            }
            args.push("-v", `${path}:${volume.target}${readOnly}`);
        }
        else {
            // The same name a Compose install uses when `name` is set, so `docker compose up` and `flisk up` share the data.
            const volumeName = typeof volume.name === "string" && volume.name
                ? volume.name
                : `${options.projectName}_${volume.source}`;
            args.push("-v", `${volumeName}:${volume.target}${readOnly}`);
        }
    }
    const container = (config.container && typeof config.container === "object" ? config.container : {});
    if (container.init !== false)
        args.push("--init");
    for (const [key, flag] of Object.entries(STRING_LIST_OPTIONS)) {
        const values = container[key];
        if (Array.isArray(values))
            for (const value of values)
                if (typeof value === "string")
                    args.push(flag, value);
    }
    if (container.readOnly === true)
        args.push("--read-only");
    if (typeof container.user === "string")
        args.push("--user", container.user);
    if (typeof container.shmSize === "string")
        args.push("--shm-size", container.shmSize);
    const entrypoint = stringList(container.entrypoint);
    // `docker run --entrypoint` takes one program; the rest of an entrypoint list goes in front of the command.
    if (entrypoint)
        args.push("--entrypoint", entrypoint[0] ?? "");
    args.push(String(config.image));
    if (entrypoint)
        args.push(...entrypoint.slice(1));
    // Compose reads `$$VAR` as a literal `$VAR`; docker run does no interpolation, so undo the escaping.
    const command = stringList(container.command);
    if (command)
        args.push(...command.map((word) => word.replace(/\$\$/g, "$")));
    return { args, errors };
}
function stringList(value) {
    return Array.isArray(value) && value.every((part) => typeof part === "string")
        ? value
        : undefined;
}
/**
 * The shell line the supervisor runs for a container service. A container left by a run that was killed is removed first, and
 * `exec` makes `docker run` the process the supervisor signals: it passes SIGTERM to the container and `--rm` removes it.
 */
export function dockerRunLine(args, containerName, platform = process.platform) {
    const run = ["docker", ...args].map(shellQuote).join(" ");
    if (platform === "win32")
        return run;
    return `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1; exec ${run}`;
}
/** True when the Docker daemon answers. */
export function isDockerRunning() {
    try {
        execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
            stdio: "ignore",
            timeout: 15_000,
        });
        return true;
    }
    catch {
        return false;
    }
}
/** Removes every container a mixed run of this project started. Used by `flisk down` after the supervisor is gone. */
export function removeNativeContainers(projectRoot) {
    try {
        const ids = execFileSync("docker", ["ps", "-aq", "--filter", `label=${NATIVE_CONTAINER_LABEL}=${projectRoot}`], { encoding: "utf-8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] })
            .split("\n")
            .map((id) => id.trim())
            .filter(Boolean);
        if (ids.length > 0) {
            execFileSync("docker", ["rm", "-f", ...ids], { stdio: "ignore", timeout: 60_000 });
        }
        return ids;
    }
    catch {
        return [];
    }
}
