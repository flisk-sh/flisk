// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
/**
 * The command that writes package-lock.json without installing anything. `--workspaces=false`: a Flisk project root can declare
 * `workspaces`, and npm then writes the lockfile at that root instead of next to the resource. Shown to the user when it cannot be run for them. */
export const LOCKFILE_COMMAND = "npm install --package-lock-only --ignore-scripts --no-audit --no-fund --legacy-peer-deps --workspaces=false";
/**
 * Writes package-lock.json for the package in `dir`. The generated Next.js image runs `npm ci`, which needs a lockfile, so a new
 * Next.js resource gets one here. Nothing is installed (`--package-lock-only`) and no scripts run. A missing npm or no network
 * is reported, not thrown: the resource is still created and the user is told the command to run.
 */
export function generateNpmLockfile(dir) {
    if (existsSync(join(dir, "package-lock.json")))
        return { ok: true, reason: "" };
    const [command, ...args] = LOCKFILE_COMMAND.split(" ");
    const result = spawnSync(command, args, {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
    });
    if (result.error) {
        const missing = result.error.code === "ENOENT";
        return { ok: false, reason: missing ? "npm is not installed" : result.error.message };
    }
    if (result.status !== 0) {
        const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`
            .trim()
            .split("\n")
            .slice(-2)
            .join(" ");
        return { ok: false, reason: tail || `npm exited with ${result.status}` };
    }
    return existsSync(join(dir, "package-lock.json"))
        ? { ok: true, reason: "" }
        : { ok: false, reason: "npm wrote no package-lock.json" };
}
