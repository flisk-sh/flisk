// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { Command } from "commander";
import { addYesOption } from "../utils/command-helpers.js";
import { getPackageVersion } from "../utils/paths.js";
/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `flisk import` does. Move the pin
 * when a new importer is published. `TDK_IMPORT_PACKAGE` overrides the package spec.
 */
export const IMPORT_PACKAGE = "flisk-import@0.2.2";
/** Minimum Flisk core release supporting buildContext required by flisk import (#634). */
export const MIN_CORE_VERSION = "1.3.104";
/** Recommended core version with automatic Tiltfile bootstrapping for imported stacks (#1018). */
export const RECOMMENDED_CORE_VERSION = "1.3.145";
/** Parses a semver version string, extracting major, minor, patch, and prerelease identifiers. */
export function parseSemver(raw) {
    const cleaned = raw.trim().replace(/^v/, "").split("+")[0];
    const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
    if (!match)
        return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3] ?? 0);
    const prereleaseRaw = match[4];
    const prerelease = prereleaseRaw
        ? prereleaseRaw.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
        : [];
    return { major, minor, patch, prerelease };
}
/**
 * Compares two semver version strings per the SemVer 2.0.0 specification:
 * Returns 1 if a > b, -1 if a < b, 0 if a === b, or null if either is unparseable.
 */
export function compareSemver(aStr, bStr) {
    const a = parseSemver(aStr);
    const b = parseSemver(bStr);
    if (!a || !b)
        return null;
    if (a.major !== b.major)
        return a.major > b.major ? 1 : -1;
    if (a.minor !== b.minor)
        return a.minor > b.minor ? 1 : -1;
    if (a.patch !== b.patch)
        return a.patch > b.patch ? 1 : -1;
    const aHasPre = a.prerelease.length > 0;
    const bHasPre = b.prerelease.length > 0;
    // A normal version has greater precedence than a prerelease of the same major.minor.patch
    if (aHasPre && !bHasPre)
        return -1;
    if (!aHasPre && bHasPre)
        return 1;
    if (!aHasPre && !bHasPre)
        return 0;
    const len = Math.max(a.prerelease.length, b.prerelease.length);
    for (let i = 0; i < len; i++) {
        const pA = a.prerelease[i];
        const pB = b.prerelease[i];
        if (pA === undefined)
            return -1;
        if (pB === undefined)
            return 1;
        if (pA === pB)
            continue;
        const numA = typeof pA === "number";
        const numB = typeof pB === "number";
        if (numA && !numB)
            return -1;
        if (!numA && numB)
            return 1;
        if (numA && numB) {
            return pA > pB ? 1 : -1;
        }
        return pA.localeCompare(pB) > 0 ? 1 : -1;
    }
    return 0;
}
/** Compares two semver version strings. Returns true if current >= minimum. */
export function isVersionAtLeast(current, minimum) {
    const cmp = compareSemver(current, minimum);
    if (cmp === null)
        return false;
    return cmp >= 0;
}
/**
 * Checks whether the running Flisk CLI meets the minimum version required to adopt Compose repos.
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
            message: `flisk import: installed Flisk core (${currentVersion}) is older than the required ${MIN_CORE_VERSION} (buildContext release). Upgrade with: flisk upgrade`,
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
/** Runs flisk-import with the caller's terminal and resolves to its exit code. */
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
            console.error(`flisk import: could not run npx (${err.message}). Install Node.js/npm and retry.`);
            resolve(127);
        });
        child.on("close", (code) => resolve(code ?? 1));
    });
}
export function buildForwardedImportArgs(args, options = {}) {
    let yes = Boolean(options.yes);
    let force = Boolean(options.force);
    const filtered = [];
    for (const arg of args) {
        if (arg === "--yes" || arg === "-y") {
            yes = true;
        }
        else if (arg === "--force" || arg === "-f") {
            force = true;
        }
        else {
            filtered.push(arg);
        }
    }
    if (yes) {
        filtered.push("--yes");
    }
    if (force) {
        filtered.push("--force");
    }
    return filtered;
}
export const importCommand = addYesOption(new Command("import"))
    .description("Import the services in a directory's root docker-compose.yml (runs flisk-import)")
    .argument("[args...]", "Passed to flisk-import: [dir] --dry-run --yes --force")
    .option("-f, --force", "Overwrite an existing service.json", false)
    .allowUnknownOption()
    .helpOption(false)
    .action(async (args, options) => {
    const forwardedArgs = buildForwardedImportArgs(args, options);
    process.exitCode = await runImport(forwardedArgs);
});
