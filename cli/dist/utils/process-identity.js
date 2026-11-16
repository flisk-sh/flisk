// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { uptime } from "node:os";
function runQuiet(file, args) {
    return new Promise((resolve, reject) => {
        execFile(file, args, {
            windowsHide: true,
            timeout: 15_000,
            // `ps -o lstart=` prints local time in the locale's words; fix both so the same process always reads the same.
            env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
        }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
    });
}
/** Field 22 of `/proc/<pid>/stat` (clock ticks after boot). Field 2 is the name in parentheses and may hold both. */
export function linuxStatStartTime(stat) {
    const end = stat.lastIndexOf(")");
    if (end === -1)
        return undefined;
    const fields = stat
        .slice(end + 1)
        .trim()
        .split(/\s+/);
    const value = fields[19];
    return value !== undefined && /^\d+$/.test(value) ? value : undefined;
}
/**
 * When the process with this pid started, as an opaque string that is equal for the same process and different for a later
 * process given the same pid. Undefined when no such process exists or its start time cannot be read (another user's
 * process on Windows, a missing `ps`): the caller must then treat the pid as not its own.
 */
export async function processStartTime(pid, deps = {}) {
    if (!Number.isInteger(pid) || pid <= 0)
        return undefined;
    const platform = deps.platform ?? process.platform;
    const run = deps.run ?? runQuiet;
    try {
        if (platform === "win32") {
            const out = await run("powershell.exe", [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`,
            ]);
            return out.trim() || undefined;
        }
        if (platform === "linux") {
            const read = deps.readFile ?? ((path) => readFile(path, "utf8"));
            try {
                const fromProc = linuxStatStartTime(await read(`/proc/${pid}/stat`));
                if (fromProc)
                    return fromProc;
            }
            catch {
                // No /proc (a container without it): ask ps below.
            }
        }
        const out = await run("ps", ["-o", "lstart=", "-p", String(pid)]);
        return out.trim() || undefined;
    }
    catch {
        return undefined;
    }
}
/** When this machine last booted, in epoch milliseconds. */
export function bootTimeMs() {
    return Date.now() - uptime() * 1000;
}
