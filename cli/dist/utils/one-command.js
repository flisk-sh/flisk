// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
/** The marker the stack prints before the frontend URLs. */
const FRONTEND_MARKER = "Frontend URLs";
/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export function findFrontendUrl(output) {
    const lines = output.split("\n");
    const markerIndex = lines.findIndex((line) => line.includes(FRONTEND_MARKER));
    if (markerIndex === -1)
        return undefined;
    for (const line of lines.slice(markerIndex + 1)) {
        const match = line.match(/^\s*-\s+\S+:\s+(https?:\/\/\S+)/);
        if (match)
            return match[1];
        if (line.trim() === "" || line.includes("URLs:"))
            break;
    }
    return undefined;
}
/**
 * Initializes a cloned project.
 *
 * A starter repository holds services and a Tiltfile, but no project configuration, and
 * `flisk up` refuses to run without one. So the one-command flow initializes the folder it
 * just cloned before it starts the stack.
 *
 * Nothing is inherited: a child that writes straight to the terminal corrupts the frame the
 * caller is painting. Both streams are captured, and `--quiet` keeps the setup from printing
 * its full configuration report at all.
 */
export function initializeProject(binPath, cwd, env = process.env, spawnFn = spawn) {
    return new Promise((resolve) => {
        const child = spawnFn(process.execPath, [binPath, "project", "--yes", "--quiet"], {
            cwd,
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout?.on("data", (chunk) => {
            output += String(chunk);
        });
        child.stderr?.on("data", (chunk) => {
            output += String(chunk);
        });
        child.on("error", (error) => resolve({ ok: false, error: error.message, output }));
        child.on("close", (code) => {
            if (code === 0) {
                resolve({ ok: true, output });
                return;
            }
            const last = output
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .pop();
            resolve({ ok: false, error: last ?? `the project setup failed (code ${code})`, output });
        });
    });
}
/** Reads the `{schemaVersion, data, errors}` envelope `flisk up --json` prints when it is done. */
export function parseStackEnvelope(output) {
    for (const line of output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{"))
            continue;
        try {
            const parsed = JSON.parse(trimmed);
            const data = parsed.data ?? {};
            const ok = data.ok === true;
            return {
                ok,
                data: (parsed.data ?? {}),
                error: ok ? undefined : (parsed.errors?.[0]?.message ?? "the stack did not come up"),
                raw: output,
            };
        }
        catch {
            // Not the envelope; keep looking.
        }
    }
    return undefined;
}
/**
 * Starts the stack quietly and reports when it is ready.
 *
 * `flisk up --json` prints one JSON object when the stack is up (or has failed) and keeps
 * Tilt's own build logs out of the way, so the caller can show a progress line instead of
 * thousands of Docker and Traefik lines. The stack keeps running in the background.
 */
export function runStackQuiet(binPath, cwd, env = process.env, spawnFn = spawn) {
    return new Promise((resolve) => {
        const child = spawnFn(process.execPath, [binPath, "up", "--json"], {
            cwd,
            env,
            stdio: ["inherit", "pipe", "pipe"],
        });
        let output = "";
        let settled = false;
        const settle = (outcome) => {
            if (settled)
                return;
            settled = true;
            // The stack outlives this command: let the child run on its own.
            child.unref?.();
            resolve(outcome);
        };
        child.stdout?.on("data", (chunk) => {
            output += String(chunk);
            const envelope = parseStackEnvelope(output);
            if (envelope)
                settle(envelope);
        });
        child.stderr?.on("data", (chunk) => {
            output += String(chunk);
        });
        child.on("error", (error) => settle({ ok: false, error: error.message, raw: output }));
        child.on("close", (code) => settle({
            ok: false,
            error: `the stack stopped before it was ready (code ${code})`,
            raw: output,
        }));
    });
}
/**
 * A free directory for the project. A second demo in the same folder gets its own directory
 * (`name-2`, `name-3`, ...) instead of failing because the first one is still there.
 */
export function nextAvailableProjectDir(base, isTaken) {
    if (!isTaken(base))
        return base;
    for (let suffix = 2; suffix < 1000; suffix += 1) {
        const candidate = `${base}-${suffix}`;
        if (!isTaken(candidate))
            return candidate;
    }
    return base;
}
/** The service folders of a project that have their own package.json. */
export function findServiceDirs(projectRoot, maxDepth = 4) {
    const dirs = [];
    const walk = (dir, depth) => {
        if (depth > maxDepth)
            return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true }).map((entry) => entry.name);
        }
        catch {
            return;
        }
        if (entries.includes("package.json"))
            dirs.push(dir);
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === "node_modules" || entry.name.startsWith("."))
                continue;
            walk(join(dir, entry.name), depth + 1);
        }
    };
    walk(projectRoot, 0);
    return dirs;
}
/**
 * Installs the host dependencies of the services. The stack typechecks the services on the
 * host, so a fresh clone needs its dependencies before it can come up.
 */
export async function installServiceDependencies(projectRoot, run = defaultRun) {
    const results = [];
    for (const dir of findServiceDirs(projectRoot)) {
        const code = await run("bun", ["install"], dir);
        results.push({ dir, ok: code === 0 });
    }
    return results;
}
/** Runs a command and resolves with its exit code. */
function defaultRun(command, args, cwd) {
    return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, stdio: "ignore" });
        child.on("error", () => resolve(1));
        child.on("close", (code) => resolve(code ?? 1));
    });
}
