// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { Command } from "commander";
import { getPackageVersion } from "../utils/paths.js";
/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `tdk import` does. Move the pin
 * when a new importer is published. `TDK_IMPORT_PACKAGE` overrides the package spec.
 */
export const IMPORT_PACKAGE = "@tdk-landscape/tdk-import@0.2.1";
/** Minimum TDK core release supporting buildContext required by tdk import (#634). */
export const MIN_CORE_VERSION = "1.3.104";
/** Recommended core version with automatic Tiltfile bootstrapping for imported stacks (#1018). */
export const RECOMMENDED_CORE_VERSION = "1.3.145";
/** Compares two semver version strings (major.minor.patch). Returns true if current >= minimum. */
export function isVersionAtLeast(current, minimum) {
    const parse = (v) => {
        const match = v.trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!match)
            return null;
        return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
    };
    const cur = parse(current);
    const min = parse(minimum);
    if (!cur || !min)
        return false;
    for (let i = 0; i < 3; i++) {
        const c = cur[i] ?? 0;
        const m = min[i] ?? 0;
        if (c !== m)
            return c > m;
    }
    return true;
}
/**
 * Checks whether the running TDK CLI meets the minimum version required to adopt Compose repos.
 * If the installed core is older than the buildContext release (1.3.104), exit before writing
 * and print the upgrade command.
 */
export function checkCoreVersion(currentVersion = getPackageVersion(), args = []) {
    const isWriting = !args.includes("--dry-run") && !args.includes("--help") && !args.includes("-h");
    if (!isWriting) {
        return { ok: true };
    }
    if (!isVersionAtLeast(currentVersion, MIN_CORE_VERSION)) {
        return {
            ok: false,
            message: `tdk import: installed TDK core (${currentVersion}) is older than the required ${MIN_CORE_VERSION} (buildContext release). Upgrade with: tdk upgrade`,
        };
    }
    return { ok: true };
}
export function importInvocation(args, env = process.env, platform = process.platform) {
    const pkg = env.TDK_IMPORT_PACKAGE || IMPORT_PACKAGE;
    return {
        command: platform === "win32" ? "npx.cmd" : "npx",
        args: ["--yes", pkg, ...args],
        shell: platform === "win32",
    };
}
/** Runs tdk-import with the caller's terminal and resolves to its exit code. */
export function runImport(args, spawnFn = spawn, getVersionFn = getPackageVersion) {
    const check = checkCoreVersion(getVersionFn(), args);
    if (!check.ok) {
        console.error(check.message);
        return Promise.resolve(1);
    }
    const invocation = importInvocation(args);
    return new Promise((resolve) => {
        const child = spawnFn(invocation.command, invocation.args, {
            stdio: "inherit",
            shell: invocation.shell,
        });
        child.on("error", (err) => {
            console.error(`tdk import: could not run npx (${err.message}). Install Node.js/npm and retry.`);
            resolve(127);
        });
        child.on("close", (code) => resolve(code ?? 1));
    });
}
export const importCommand = new Command("import")
    .description("Import the services in a directory's root docker-compose.yml (runs tdk-import)")
    .argument("[args...]", "Passed to tdk-import: [dir] --dry-run --yes --force")
    .allowUnknownOption()
    .helpOption(false)
    .action(async (args) => {
    process.exitCode = await runImport(args);
});
