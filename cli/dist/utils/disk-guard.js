// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { homedir } from "node:os";
import { showError } from "./errors.js";
/**
 * One free-disk check for `flisk doctor`, `flisk up` and `flisk down`.
 *
 * A full disk damages Docker's image store (input/output errors on blobs; the only repair is rebuilding the VM, which
 * deletes every volume), so the check runs before a build starts instead of after the damage.
 */
const GIB = 1024 ** 3;
/** Below this much free space nothing is built or started. Override with FLISK_DISK_MIN_GIB. */
export const DISK_FAIL_GIB = 5;
/** Below this much free space the run goes on with a warning. Override with FLISK_DISK_WARN_GIB. */
export const DISK_WARN_GIB = 15;
export const DISK_MIN_ENV = "FLISK_DISK_MIN_GIB";
export const DISK_WARN_ENV = "FLISK_DISK_WARN_GIB";
/** The first cleanup offered: Docker's build cache only, safe while a stack is running. */
export const DISK_SAFE_CLEANUP = "docker builder prune -f";
export const DISK_CLEANUP_FIX = [
    "This is about the machine, not the project: free disk space, then retry: flisk doctor",
    `  ${DISK_SAFE_CLEANUP}        # build cache only; keeps images, containers and volumes`,
    "  docker image prune -f          # dangling images only",
    "  docker system prune -af        # last resort: every unused image, rebuilt on the next flisk up",
    "  npm cache clean --force",
    "  bun pm cache rm",
    "  brew cleanup -s",
].join("\n");
function gibFromEnv(value, fallback) {
    if (value === undefined || value.trim() === "")
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
/** The thresholds in effect: the defaults, or the environment variables when they hold a number. */
export function diskThresholds(env = process.env) {
    const failBelowGib = gibFromEnv(env[DISK_MIN_ENV], DISK_FAIL_GIB);
    const warnBelowGib = Math.max(gibFromEnv(env[DISK_WARN_ENV], DISK_WARN_GIB), failBelowGib);
    return { failBelowGib, warnBelowGib };
}
export function readHostFreeGib(statfs = statfsSync, path = homedir()) {
    try {
        const stats = statfs(path);
        return (Number(stats.bavail) * Number(stats.bsize)) / GIB;
    }
    catch {
        return null;
    }
}
export function evaluateDisk(input = {}) {
    const { failBelowGib, warnBelowGib } = diskThresholds(input.env);
    const host = readHostFreeGib(input.statfs, input.path);
    const vm = input.vmFreeGib ?? null;
    if (host === null && vm === null) {
        return {
            level: "unknown",
            failBelowGib,
            warnBelowGib,
            message: "Could not read free disk space",
        };
    }
    const useVm = vm !== null && (host === null || vm < host);
    const freeGib = useVm ? vm : host;
    const source = useVm ? "docker-vm" : "host";
    const where = useVm ? "the Docker VM disk" : "this machine";
    const shown = `${freeGib.toFixed(1)} GiB free on ${where}`;
    const base = { freeGib, source, failBelowGib, warnBelowGib };
    if (freeGib < failBelowGib) {
        return {
            ...base,
            level: "fail",
            message: `${shown}: building images needs at least ${failBelowGib} GiB, and a full disk damages Docker's image store`,
            fix: DISK_CLEANUP_FIX,
        };
    }
    if (freeGib < warnBelowGib) {
        return {
            ...base,
            level: "warn",
            message: `${shown}: image builds may fail below ${failBelowGib} GiB`,
            fix: DISK_CLEANUP_FIX,
        };
    }
    return { ...base, level: "ok", message: shown };
}
const defaultRun = (cmd, args) => {
    try {
        return execFileSync(cmd, args, {
            encoding: "utf8",
            timeout: 5000,
            stdio: ["ignore", "pipe", "ignore"],
        });
    }
    catch {
        return null;
    }
};
/**
 * Free GiB on the disk that holds Docker's images, which is a VM disk on a Mac (Colima, Docker Desktop) and only grows.
 * Asks the daemon for its data root: when that path exists on this host (Linux) it is read directly, otherwise through
 * `colima ssh`. Returns null when the VM cannot be asked (Docker Desktop has no shell into its VM), so the host number is used.
 */
export function readDockerVmFreeGib(deps = {}) {
    const run = deps.run ?? defaultRun;
    const root = run("docker", ["info", "--format", "{{.DockerRootDir}}"])?.trim();
    if (!root?.startsWith("/"))
        return null;
    const local = readHostFreeGib(deps.statfs ?? statfsSync, root);
    if (local !== null)
        return local;
    const df = run("colima", ["ssh", "--", "df", "-Pk", root]);
    const fields = df?.trim().split("\n").pop()?.trim().split(/\s+/);
    const availableKib = Number(fields?.[3]);
    return Number.isFinite(availableKib) ? (availableKib * 1024) / GIB : null;
}
/** The `--json` field that carries a warning; undefined when there is nothing to warn about. */
export function diskWarningField(disk) {
    if (!disk || disk.level !== "warn")
        return undefined;
    return {
        level: disk.level,
        freeGib: Number((disk.freeGib ?? 0).toFixed(1)),
        source: disk.source,
        failBelowGib: disk.failBelowGib,
        warnBelowGib: disk.warnBelowGib,
        message: disk.message,
        fix: disk.fix,
    };
}
/**
 * The check at the start of `flisk up`: stops below the hard threshold before any build, warns below the soft one.
 * Returns the assessment so the caller can put a warning into its `--json` result.
 */
export function enforceDiskGuard(deps = {}) {
    const disk = evaluateDisk(deps);
    const lines = (disk.fix ?? "").split("\n");
    if (disk.level === "fail") {
        deps.emit?.({ ok: false, disk: diskFailureField(disk) }, [
            { code: "DISK_SPACE_LOW", message: disk.message, suggestions: lines },
        ]);
        (deps.showError ?? defaultShowError)(disk.message, lines);
        return (deps.exit ?? process.exit)(1);
    }
    if (disk.level === "warn" && !deps.quiet) {
        const warn = deps.warn ?? ((line) => console.warn(line));
        warn(`⚠ ${disk.message}`);
        for (const line of lines)
            warn(`  ${line}`);
    }
    return disk;
}
function diskFailureField(disk) {
    return {
        level: disk.level,
        freeGib: Number((disk.freeGib ?? 0).toFixed(1)),
        source: disk.source,
        failBelowGib: disk.failBelowGib,
    };
}
function defaultShowError(message, suggestions) {
    showError(message, undefined, suggestions);
}
