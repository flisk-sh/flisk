// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FliskError } from "./errors.js";
import { findOnPath } from "./which.js";
const execFilePromise = promisify(execFile);
const DOCKER_TIMEOUT_MS = 15_000;
export const DOCKER_BUILD_CACHE_CHECK = "Docker Build Cache";
/** Keep this threshold in GiB (1 GiB = 1024 ** 3 bytes), matching DISK_WARN_GIB from #2362. */
export const DOCKER_BUILD_CACHE_WARN_GIB = 10;
export const defaultDockerRunner = async (args) => {
    const { stdout } = await execFilePromise("docker", args, {
        encoding: "utf-8",
        timeout: DOCKER_TIMEOUT_MS,
        windowsHide: true,
    });
    return stdout;
};
/** Parses human size strings, using SI for kB/MB/GB/TB and IEC for KiB/MiB/GiB/TiB. */
export function parseSizeToBytes(raw) {
    const match = raw.trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
    if (!match)
        return 0;
    const num = Number.parseFloat(match[1] ?? "0");
    if (!Number.isFinite(num))
        return 0;
    const unit = (match[2] ?? "B").toUpperCase();
    switch (unit) {
        case "B":
            return num;
        case "KB":
            return num * 1000;
        case "MB":
            return num * 1000 ** 2;
        case "GB":
            return num * 1000 ** 3;
        case "TB":
            return num * 1000 ** 4;
        case "K":
        case "KIB":
            return num * 1024;
        case "M":
        case "MIB":
            return num * 1024 ** 2;
        case "G":
        case "GIB":
            return num * 1024 ** 3;
        case "T":
        case "TIB":
            return num * 1024 ** 4;
        default:
            return num;
    }
}
/**
 * Parses `docker system df --format "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}"` output.
 */
export function parseDockerBuildCache(dfOutput) {
    for (const line of dfOutput.split(/\r?\n/)) {
        const parts = line.split("\t");
        const type = (parts[0] ?? "").trim();
        if (type.toLowerCase() === "build cache") {
            const entries = Number.parseInt((parts[1] ?? "").trim(), 10) || 0;
            const rawSize = (parts[2] ?? "").trim() || "0B";
            const rawReclaimable = (parts[3] ?? "").replace(/\s*\(.*\)/, "").trim() || "0B";
            const sizeBytes = parseSizeToBytes(rawSize);
            const reclaimableBytes = parseSizeToBytes(rawReclaimable);
            return {
                size: rawSize,
                sizeBytes,
                sizeGib: sizeBytes / 1024 ** 3,
                entries,
                reclaimable: rawReclaimable,
                reclaimableBytes,
            };
        }
    }
    return null;
}
/**
 * Checks the size of Docker's build cache and warns if it exceeds DOCKER_BUILD_CACHE_WARN_GIB.
 */
export async function checkDockerBuildCache(runner = defaultDockerRunner, hasDocker = Boolean(findOnPath("docker"))) {
    if (!hasDocker) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: false,
            message: "Docker CLI not found",
            fix: "Install Docker: https://docs.docker.com/get-docker/",
        };
    }
    let stdout;
    try {
        stdout = await runner([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}",
        ]);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: true,
            isSkipped: true,
            message: `Could not read Docker build cache: ${msg.split(/\r?\n/)[0]}`,
        };
    }
    const info = parseDockerBuildCache(stdout);
    if (!info) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: true,
            isSkipped: true,
            message: "Could not parse Docker build cache information",
        };
    }
    const buildCache = {
        size: info.size,
        entries: info.entries,
        reclaimable: info.reclaimable,
    };
    const entryLabel = info.entries === 1 ? "entry" : "entries";
    if (info.sizeGib >= DOCKER_BUILD_CACHE_WARN_GIB) {
        return {
            name: DOCKER_BUILD_CACHE_CHECK,
            didPass: false,
            isWarning: true,
            message: `${info.size} across ${info.entries} ${entryLabel}: Docker build cache exceeds ${DOCKER_BUILD_CACHE_WARN_GIB} GiB threshold. Cache is shared across all projects on this machine`,
            fix: "Prune old build cache: flisk down --prune-cache (or docker builder prune --filter until=24h). Note: this affects other projects on this machine.",
            buildCache,
        };
    }
    const shown = info.entries === 0 || info.sizeBytes === 0
        ? "0 B in 0 entries (Docker build cache is empty)"
        : `${info.size} across ${info.entries} ${entryLabel} (shared across all projects on this machine)`;
    return {
        name: DOCKER_BUILD_CACHE_CHECK,
        didPass: true,
        message: shown,
        buildCache,
    };
}
/** Validates that the age filter is safe (e.g. "24h", "7d", "168h", "30m", or ISO date). */
export function validateCacheUntil(until) {
    if (!until || typeof until !== "string")
        return false;
    const trimmed = until.trim();
    // Duration format like 24h, 7d, 2h30m, 168h
    if (/^(\d+[hmsd])+$/i.test(trimmed))
        return true;
    // ISO date format like 2026-10-01 or 2026-10-01T00:00:00
    if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.test(trimmed))
        return true;
    return false;
}
/**
 * Converts a validated age filter into a value Docker accepts for `until=`. Docker parses
 * durations with Go's time.ParseDuration, which has no "d" unit and is case-sensitive, so
 * days become hours (7d -> 168h, 1d12h -> 36h) and units are lowercased (24H -> 24h).
 * ISO dates and anything else pass through unchanged (T and Z keep their case).
 */
export function normalizeCacheUntil(until) {
    const trimmed = until.trim();
    if (!/^(\d+[hmsd])+$/i.test(trimmed))
        return trimmed;
    let hours = 0n;
    let rest = "";
    for (const match of trimmed.matchAll(/(\d+)([hmsd])/gi)) {
        const value = BigInt(match[1] ?? "0");
        const unit = (match[2] ?? "").toLowerCase();
        if (unit === "d" || unit === "h") {
            hours += unit === "d" ? value * 24n : value;
        }
        else {
            rest += `${value}${unit}`;
        }
    }
    return `${hours > 0n || !rest ? `${hours}h` : ""}${rest}`;
}
/** Parses reclaimed size from `docker builder prune` output. */
export function parseReclaimedFromPrune(stdout) {
    const match = stdout.match(/(?:Total reclaimed space|Total):\s*([0-9.]+\s*[a-zA-Z]+)/i);
    return match?.[1]?.trim() ?? "0 B";
}
/**
 * Prunes Docker build cache using `docker builder prune -f --filter until=<age>`.
 */
export async function pruneDockerBuildCache(options = {}) {
    const until = options.until ?? "24h";
    if (!validateCacheUntil(until)) {
        throw new FliskError(`Invalid --cache-until format: "${until}"`, [
            "Use a duration such as 24h, 168h, 7d, or 2h30m",
        ]);
    }
    const runner = options.runner ?? defaultDockerRunner;
    const normalized = normalizeCacheUntil(until);
    const stdout = await runner(["builder", "prune", "-f", "--filter", `until=${normalized}`]);
    const reclaimed = parseReclaimedFromPrune(stdout);
    return { reclaimed, until: normalized };
}
/** The build cache is trimmed on `flisk up` when it grows past this many GiB. `0` turns the ceiling off. */
export const DEFAULT_BUILD_CACHE_CEILING_GIB = 20;
export const BUILD_CACHE_CEILING_ENV = "FLISK_BUILD_CACHE_MAX_GIB";
export function resolveBuildCacheCeilingGib(env = process.env) {
    const raw = env[BUILD_CACHE_CEILING_ENV];
    if (raw === undefined || raw.trim() === "")
        return DEFAULT_BUILD_CACHE_CEILING_GIB;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUILD_CACHE_CEILING_GIB;
}
/** `docker system df` takes 0.8-1.3 s; the ceiling is checked at most this often while the cache is well below it. */
export const BUILD_CACHE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** A last-seen size above this share of the ceiling is re-checked on every `flisk up`. */
export const BUILD_CACHE_NEAR_CEILING_RATIO = 0.8;
const BUILD_CACHE_STAMP = "build-cache-check.json";
function stampPath(home) {
    return join(home, ".flisk", BUILD_CACHE_STAMP);
}
function readStamp(home) {
    try {
        const raw = JSON.parse(readFileSync(stampPath(home), "utf-8"));
        if (typeof raw.checkedAt === "number" && typeof raw.sizeGib === "number") {
            return { checkedAt: raw.checkedAt, sizeGib: raw.sizeGib };
        }
    }
    catch {
        // No stamp, or an unreadable one: check the cache.
    }
    return undefined;
}
function writeStamp(home, stamp) {
    try {
        mkdirSync(join(home, ".flisk"), { recursive: true });
        writeFileSync(stampPath(home), JSON.stringify(stamp));
    }
    catch {
        // Best effort: without a stamp the next `flisk up` simply checks again.
    }
}
/**
 * Keeps the shared BuildKit cache from growing without a limit: when it is above the ceiling, the least recently used
 * entries are removed until it fits. Best effort; a Docker that cannot be asked leaves the cache as it is.
 */
export async function enforceBuildCacheCeiling(run = defaultDockerRunner, env = process.env, options = {}) {
    const ceilingGib = resolveBuildCacheCeilingGib(env);
    if (ceilingGib === 0)
        return { pruned: false, ceilingGib };
    const home = options.home ?? homedir();
    const now = options.now ?? Date.now;
    // The check costs about a second and almost always finds nothing to do: skip it while the last check was recent and
    // the cache was far below the ceiling. Near or above the ceiling it runs every time, so the disk guard still sees a trim.
    const last = readStamp(home);
    const age = last ? now() - last.checkedAt : -1;
    if (last &&
        age >= 0 &&
        age < BUILD_CACHE_CHECK_INTERVAL_MS &&
        last.sizeGib < ceilingGib * BUILD_CACHE_NEAR_CEILING_RATIO) {
        return { pruned: false, ceilingGib, sizeGib: last.sizeGib, skipped: true };
    }
    try {
        const df = await run([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}",
        ]);
        const sizeGib = parseDockerBuildCache(df)?.sizeGib;
        if (sizeGib !== undefined)
            writeStamp(home, { checkedAt: now(), sizeGib });
        if (sizeGib === undefined || sizeGib <= ceilingGib)
            return { pruned: false, ceilingGib, sizeGib };
        await run([
            "builder",
            "prune",
            "-f",
            "--keep-storage",
            String(Math.round(ceilingGib * 1024 ** 3)),
        ]);
        writeStamp(home, { checkedAt: now(), sizeGib: ceilingGib });
        return { pruned: true, ceilingGib, sizeGib };
    }
    catch {
        return { pruned: false, ceilingGib };
    }
}
