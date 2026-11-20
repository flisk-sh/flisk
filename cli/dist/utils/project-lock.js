// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { randomBytes } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { dirname, resolve } from "node:path";
import { FliskError } from "./errors.js";
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 50;
const EMPTY_LOCK_GRACE_MS = 2_000;
const REAP_LOCK_STALE_MS = 5_000;
export function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        // EPERM means the process exists, we just lack permission to signal it.
        return error.code === "EPERM";
    }
}
function parseLockRecord(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed.pid === "number" && Number.isInteger(parsed.pid) && parsed.pid > 0) {
            return {
                pid: parsed.pid,
                token: typeof parsed.token === "string" ? parsed.token : "",
                startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : 0,
            };
        }
    }
    catch {
        const pid = Number.parseInt(trimmed, 10);
        if (Number.isInteger(pid) && pid > 0) {
            return { pid, token: "", startedAt: 0 };
        }
    }
    return null;
}
function readLockRecord(lockPath) {
    try {
        const raw = readFileSync(lockPath, "utf-8");
        return { exists: true, record: parseLockRecord(raw) };
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return { exists: false, record: null };
        }
        return { exists: true, record: null };
    }
}
function isLockStale(lockPath, isPidAlive) {
    const { exists, record } = readLockRecord(lockPath);
    if (!exists)
        return false;
    if (record) {
        return !isPidAlive(record.pid);
    }
    // A freshly created lock file may briefly be empty before the holder writes its PID.
    // Only reap an unreadable or empty lock once it outlives that brief write window.
    try {
        return Date.now() - statSync(lockPath).mtimeMs >= EMPTY_LOCK_GRACE_MS;
    }
    catch {
        return false;
    }
}
function tryReapStaleLock(lockPath, isPidAlive) {
    const reapPath = `${lockPath}.reap`;
    let reapFd;
    try {
        reapFd = openSync(reapPath, "wx");
    }
    catch (error) {
        if (error.code !== "EEXIST")
            return false;
        try {
            if (Date.now() - statSync(reapPath).mtimeMs >= REAP_LOCK_STALE_MS) {
                rmSync(reapPath, { force: true });
            }
        }
        catch {
            // Another process removed the reap lock.
        }
        return false;
    }
    try {
        closeSync(reapFd);
        // Re-check liveness inside the reap guard so two waiters cannot reap a newly acquired lock.
        if (isLockStale(lockPath, isPidAlive)) {
            rmSync(lockPath, { force: true });
            return true;
        }
        return false;
    }
    finally {
        rmSync(reapPath, { force: true });
    }
}
function tryCreateLock(lockPath, token) {
    let fd;
    try {
        fd = openSync(lockPath, "wx");
    }
    catch (error) {
        const code = error.code;
        if (code === "EEXIST")
            return false;
        throw error;
    }
    try {
        const payload = {
            pid: process.pid,
            token,
            startedAt: Date.now(),
        };
        writeFileSync(fd, `${JSON.stringify(payload)}\n`, "utf-8");
        return true;
    }
    catch (error) {
        rmSync(lockPath, { force: true });
        throw error;
    }
    finally {
        closeSync(fd);
    }
}
function releaseLock(lockPath, token) {
    const { exists, record } = readLockRecord(lockPath);
    if (!exists)
        return;
    if (record?.token && record.token !== token)
        return;
    rmSync(lockPath, { force: true });
}
function sleep(ms) {
    return new Promise((resolvePromise) => {
        setTimeout(resolvePromise, ms);
    });
}
export function projectLockPath(projectRoot) {
    return resolve(projectRoot, ".flisk", ".lock");
}
/**
 * Serializes project generation across processes and concurrent calls in the same process using
 * an exclusive `.flisk/.lock` file. Waits for a live holder, reaps stale locks whose PID has
 * exited, and fails with a clear FliskError if the wait times out.
 */
export async function withProjectLock(projectRoot, fn, options = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const isPidAlive = options.isPidAlive ?? isProcessAlive;
    const lockPath = projectLockPath(projectRoot);
    const token = randomBytes(8).toString("hex");
    mkdirSync(dirname(lockPath), { recursive: true });
    const deadline = Date.now() + timeoutMs;
    let acquired = false;
    while (!acquired) {
        if (tryCreateLock(lockPath, token)) {
            acquired = true;
            break;
        }
        if (isLockStale(lockPath, isPidAlive) && tryReapStaleLock(lockPath, isPidAlive)) {
            continue;
        }
        if (Date.now() >= deadline) {
            const { record } = readLockRecord(lockPath);
            const holder = record ? ` (pid ${record.pid})` : "";
            throw new FliskError(`Another flisk command${holder} is regenerating this project`, [
                "Wait for the other flisk command to finish and try again",
                `If no flisk command is running, remove ${lockPath}`,
            ]);
        }
        const remaining = deadline - Date.now();
        await sleep(Math.max(1, Math.min(retryDelayMs, remaining)));
    }
    try {
        return await fn();
    }
    finally {
        releaseLock(lockPath, token);
    }
}
