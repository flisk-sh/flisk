// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseSizeToBytes } from "./docker-build-cache.js";
const execFileAsync = promisify(execFile);
const defaultRunner = async (command, args) => {
    const { stdout } = await execFileAsync(command, args, {
        encoding: "utf-8",
        timeout: 10_000,
        windowsHide: true,
        env: { ...process.env, LC_ALL: "C" },
    });
    return stdout;
};
export const PS_ARGS = ["-axo", "pgid=,rss=,pcpu="];
export const DOCKER_STATS_ARGS = [
    "stats",
    "--no-stream",
    "--format",
    "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}",
];
/** `ps -axo pgid=,rss=,pcpu=` gives PGID, RSS (KB) and %CPU, in that order. */
export function parseProcessGroups(output) {
    const groups = new Map();
    for (const line of output.split(/\r?\n/)) {
        const [pgidRaw, rssRaw, cpuRaw] = line.trim().split(/\s+/);
        if (!pgidRaw || !/^\d+$/.test(pgidRaw))
            continue;
        const rssKb = Number(rssRaw);
        const cpuPercent = Number.parseFloat(cpuRaw ?? "");
        if (!Number.isFinite(rssKb) || !Number.isFinite(cpuPercent))
            continue;
        const pgid = Number(pgidRaw);
        const group = groups.get(pgid) ?? { cpuPercent: 0, rssBytes: 0, processes: 0 };
        group.cpuPercent += cpuPercent;
        group.rssBytes += Math.round(rssKb * 1024);
        group.processes += 1;
        groups.set(pgid, group);
    }
    return groups;
}
function parseMemoryUsage(raw) {
    const first = (raw.split("/")[0] ?? "").trim();
    if (!/^[\d.]+(?:\s*[a-zA-Z]+)?$/.test(first))
        return null;
    const bytes = parseSizeToBytes(first);
    return Number.isFinite(bytes) ? Math.round(bytes) : null;
}
/** Docker's template prints one tab-separated row per running container. */
export function parseDockerStats(output) {
    const samples = [];
    for (const line of output.split(/\r?\n/)) {
        const [name, cpuRaw, memRaw, pidsRaw] = line.split("\t").map((field) => field?.trim() ?? "");
        if (!name)
            continue;
        const cpuPercent = Number.parseFloat((cpuRaw ?? "").replace(/%/g, ""));
        const rssBytes = parseMemoryUsage(memRaw ?? "");
        if (!Number.isFinite(cpuPercent) || rssBytes === null)
            continue;
        const parsedPids = Number.parseInt(pidsRaw ?? "", 10);
        samples.push({
            name,
            cpuPercent,
            rssBytes,
            processes: Number.isFinite(parsedPids) && parsedPids >= 0 ? parsedPids : null,
        });
    }
    return samples;
}
function normalize(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function matchContainer(samples, target) {
    const container = target.container ? normalize(target.container) : null;
    const service = target.service ? normalize(target.service) : null;
    const project = target.composeProject ? normalize(target.composeProject) : null;
    for (const sample of samples) {
        const name = normalize(sample.name);
        if (container !== null && name === container)
            return sample;
        if (service !== null && name === service)
            return sample;
        if (service !== null && project !== null && name.startsWith(project)) {
            // Compose names a container `<project>_<service>_1` (or with dashes); the trailing replica number is not part of
            // the service name. Requiring the project prefix keeps another checkout's `orders-api` out of this result.
            const rest = name.slice(project.length).replace(/\d+$/, "");
            if (rest === service)
                return sample;
        }
    }
    return null;
}
function roundPercent(value) {
    return Math.round(value * 10) / 10;
}
/**
 * Samples local process groups and Docker containers once per call, without writing anything.
 *
 * Only --usage calls this: without the flag no `ps` or `docker stats` process is started. On Windows all entries are null,
 * because neither `ps` process groups nor a Docker-equivalent service mapping are available there.
 */
export async function sampleServiceUsage(targets, options = {}) {
    const results = Object.fromEntries(targets.map((target) => [target.name, null]));
    const platform = options.platform ?? process.platform;
    if (targets.length === 0 || platform === "win32")
        return results;
    const runner = options.runner ?? defaultRunner;
    const local = targets.filter((target) => target.pid !== undefined && !target.docker && target.container === undefined);
    const containers = targets.filter((target) => target.docker === true || target.container !== undefined || target.service !== undefined);
    if (local.length > 0) {
        try {
            const groups = parseProcessGroups(await runner("ps", [...PS_ARGS]));
            for (const target of local) {
                const pgid = target.pgid ?? target.pid;
                if (pgid === undefined)
                    continue;
                const group = groups.get(pgid);
                results[target.name] = group
                    ? {
                        cpuPercent: roundPercent(group.cpuPercent),
                        rssBytes: group.rssBytes,
                        processes: group.processes,
                    }
                    : null;
            }
        }
        catch {
            // ps missing or unreadable: leave every local entry null rather than failing `flisk status`.
        }
    }
    if (containers.length > 0) {
        try {
            const samples = parseDockerStats(await runner("docker", [...DOCKER_STATS_ARGS]));
            for (const target of containers) {
                const sample = matchContainer(samples, target);
                results[target.name] = sample
                    ? {
                        cpuPercent: roundPercent(sample.cpuPercent),
                        rssBytes: sample.rssBytes,
                        processes: sample.processes,
                    }
                    : null;
            }
        }
        catch {
            // Docker not answering: leave every container entry null.
        }
    }
    return results;
}
