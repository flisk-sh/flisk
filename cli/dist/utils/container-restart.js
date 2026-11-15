// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";
import { FliskError } from "./errors.js";
import { isNativeService } from "./native-service.js";
/**
 * Restart a container resource without rebuilding its image (#4192).
 *
 * `tilt trigger <resource>` runs a full Tilt update: it builds a new `tilt-<hash>` image, destroys the
 * container and creates another one, which took 6-10 s for an unchanged service. Restarting the
 * container that is already there keeps its id, image, volumes and networks, builds no image at all
 * and brings the service back in 1-2 s. Use `--rebuild` when the source or an env value changed and
 * the image/container really has to be rebuilt.
 */
/** Default timeout for bounded Docker lookups and standard container restarts. */
export const RESTART_TIMEOUT_MS = 60_000;
/** Extra startup/overhead budget added on top of a container's configured stopGracePeriod. */
export const RESTART_STARTUP_ALLOWANCE_MS = 50_000;
/** Default subprocess timeout when the MCP server spawns a CLI command. */
export const DEFAULT_MCP_CLI_TIMEOUT_MS = 120_000;
/** Budget for Tilt reachability check and CLI process overhead around `restartContainer`. */
const RESTART_CLI_OVERHEAD_MS = 20_000;
const dockerRun = (args, options) => spawnSync("docker", args, {
    encoding: "utf-8",
    timeout: options?.timeoutMs ?? RESTART_TIMEOUT_MS,
    windowsHide: process.platform === "win32",
});
const DURATION_SEGMENT_RE = /([0-9]+(?:\.[0-9]+)?)(us|ms|s|m|h)/g;
const DURATION_FULL_RE = /^([0-9]+(?:\.[0-9]+)?(us|ms|s|m|h))+$/;
const UNIT_MS = {
    us: 0.001,
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
};
/** Parse a Flisk/Docker duration string such as `30s` or `1m30s` into milliseconds. */
export function parseDurationMs(duration) {
    if (!duration || !DURATION_FULL_RE.test(duration))
        return undefined;
    let total = 0;
    for (const match of duration.matchAll(DURATION_SEGMENT_RE)) {
        const value = Number(match[1]);
        const unit = match[2];
        if (!Number.isFinite(value) || !(unit in UNIT_MS))
            return undefined;
        total += value * UNIT_MS[unit];
    }
    return Math.ceil(total);
}
/** Timeout for `docker restart`, respecting `container.stopGracePeriod` plus startup allowance. */
export function resolveRestartTimeoutMs(stopGracePeriod) {
    const graceMs = parseDurationMs(stopGracePeriod);
    if (graceMs === undefined)
        return RESTART_TIMEOUT_MS;
    return Math.max(RESTART_TIMEOUT_MS, graceMs + RESTART_STARTUP_ALLOWANCE_MS);
}
/**
 * Total subprocess timeout budget for `flisk restart` over MCP:
 * Docker lookup (`RESTART_TIMEOUT_MS`) + `docker restart` (`resolveRestartTimeoutMs(stopGracePeriod)`)
 * + Tilt reachability check / CLI overhead, floored at the standard MCP CLI timeout.
 */
export function resolveRestartCliTimeoutMs(stopGracePeriod) {
    return resolveRestartSequenceCliTimeoutMs([stopGracePeriod]);
}
/**
 * Total subprocess timeout budget when `flisk restart` restarts a container and its sequential
 * `sidecarOf` dependents (including nested sidecars).
 */
export function resolveRestartSequenceCliTimeoutMs(stopGracePeriods) {
    const targets = stopGracePeriods.length > 0 ? stopGracePeriods : [undefined];
    const dockerBudget = targets.reduce((sum, grace) => sum + RESTART_TIMEOUT_MS + resolveRestartTimeoutMs(grace), 0);
    return Math.max(DEFAULT_MCP_CLI_TIMEOUT_MS, dockerBudget + RESTART_CLI_OVERHEAD_MS);
}
const NON_CONTAINER_APP_TYPES = new Set(["library", "sdk", "infra", "database"]);
/**
 * True when `resource` runs as a generated Compose container in the stack project.
 */
export function isGeneratedComposeContainer(resource) {
    if (isNativeService(resource))
        return false;
    const appType = resource.config?.appType ?? resource.type;
    return !appType || !NON_CONTAINER_APP_TYPES.has(appType);
}
/**
 * Collects dependent container resources whose `config.sidecarOf` transitively points at
 * `targetName`, ordered breadth-first so every host restarts before its sidecars.
 */
/**
 * Extracts resource names enabled in the current Tilt session from `tilt get uiresources -o json`,
 * excluding items with `disableStatus.state === "Disabled"`. Returns `null` when stdout is not a
 * `UIResourceList` JSON payload.
 */
export function parseEnabledTiltResourceNames(stdout) {
    if (!stdout.trim())
        return null;
    try {
        const parsed = JSON.parse(stdout);
        if (!Array.isArray(parsed?.items))
            return null;
        const enabled = new Set();
        for (const item of parsed.items) {
            const name = item.metadata?.name;
            if (!name)
                continue;
            if (item.status?.disableStatus?.state === "Disabled")
                continue;
            enabled.add(name);
        }
        return enabled;
    }
    catch {
        return null;
    }
}
export function collectSidecarDependents(resources, targetName) {
    const host = resources.find((r) => r.name === targetName);
    const visited = new Set([targetName]);
    const queue = host ? [host] : [];
    const dependents = [];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current)
            continue;
        for (const candidate of resources) {
            if (visited.has(candidate.name))
                continue;
            if (candidate.config?.sidecarOf !== current.name)
                continue;
            if (candidate.stack && current.stack && candidate.stack !== current.stack)
                continue;
            if (!isGeneratedComposeContainer(candidate))
                continue;
            visited.add(candidate.name);
            dependents.push(candidate);
            queue.push(candidate);
        }
    }
    return dependents;
}
/**
 * The Compose project a stack's containers belong to, as the engine names it in
 * `runtime/engine/topologies/platform/docker/constants.star` (`<project>-<stack>-autogenerated`).
 * Docker lowercases Compose project names. The project name comes from `.flisk/project.json`, the
 * same source the engine and `flisk run` use.
 */
export function composeProjectName(projectRoot, stack) {
    let projectName = "flisk-project";
    try {
        const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
        if (typeof parsed?.project?.name === "string" && parsed.project.name) {
            projectName = parsed.project.name;
        }
    }
    catch {
        // A project without a readable project.json falls back to the engine's own default.
    }
    return `${projectName}-${stack}-autogenerated`.toLowerCase();
}
/** Non-empty container ids from `docker ps -q` output, oldest line first. */
function containerIds(output) {
    return output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}
/** The part of a failed Docker call worth showing the user. */
function failureDetail(result) {
    return ((result.stderr ?? "").trim() ||
        (result.stdout ?? "").trim() ||
        result.error?.message ||
        `docker exited ${result.status ?? 1}`);
}
/**
 * Stop and start the resource's existing containers, with no build step.
 *
 * Containers are found by the labels Docker Compose adds (`com.docker.compose.project` and
 * `com.docker.compose.service`), the same lookup `flisk run` uses. Looking up containers rather
 * than loading a Compose file keeps this independent of generated file paths and covers every
 * container resource type (backend `api`, frontend `web`, workers, agents). As with `tilt trigger
 * <resource>`, an exact service name selects the primary container; replicas are separate Compose
 * services (`<name>-1`, …). Both running and exited containers are included: a one-shot worker
 * that already exited is started again by `docker restart`, as a full Tilt update would redo it.
 *
 * @param projectRoot Absolute path of the Flisk project.
 * @param stack The resource's stack (the engine makes one Compose project per stack).
 * @param resourceName The Compose service name, which is the resource name.
 * @param run Injectable docker runner, for unit tests.
 * @throws FliskError when Docker is missing/unreachable or no container for the resource exists.
 */
export function restartContainer(projectRoot, stack, resourceName, run = dockerRun, options) {
    const project = composeProjectName(projectRoot, stack);
    const lookup = run([
        "ps",
        "-a",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project}`,
        "--filter",
        `label=com.docker.compose.service=${resourceName}`,
        "--filter",
        "label=com.docker.compose.oneoff=False",
    ], { timeoutMs: RESTART_TIMEOUT_MS });
    if (lookup.error || lookup.status !== 0) {
        throw new FliskError(`Could not find containers for ${resourceName}: ${failureDetail(lookup)}`, ["Check that Docker is running with: docker ps", "Check the machine with: flisk doctor"]);
    }
    const ids = containerIds(lookup.stdout ?? "");
    if (ids.length === 0) {
        throw new FliskError(`No container for ${resourceName} in Compose project ${project}.`, [
            "Start the stack first with: flisk up",
            "Check the resource's state with: flisk status",
        ]);
    }
    const restarted = run(["restart", ...ids], {
        timeoutMs: resolveRestartTimeoutMs(options?.stopGracePeriod),
    });
    if (restarted.error || restarted.status !== 0) {
        throw new FliskError(`Could not restart ${resourceName}: ${failureDetail(restarted)}`, [
            "Check the container with: docker ps",
            `Read the resource logs with: flisk logs --service ${resourceName}`,
        ]);
    }
    return {
        exitCode: restarted.status ?? 0,
        stdout: restarted.stdout ?? "",
        stderr: restarted.stderr ?? "",
    };
}
