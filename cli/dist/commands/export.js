// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk export render|wrangler`: runs the pinned @flisk-sh/flisk-export, which writes render.yaml or wrangler.toml
 * from service.json and stops there. It never deploys, never creates DNS records and never calls a cloud API (the
 * export scope agreed in AGENTS.md, "Local-only by default").
 */
import { spawn } from "node:child_process";
import { Command } from "commander";
/**
 * The generators live in their own repo (flisk-sh/flisk-export) so they can ship without a CLI release, and are run
 * from npm at a pinned version so a push to its main branch cannot change what `flisk export` does. Move the pin
 * when a new version is published. `FLISK_EXPORT_PACKAGE` overrides the package spec.
 */
export const EXPORT_PACKAGE = "@flisk-sh/flisk-export@0.1.0";
export function exportInvocation(args, env = process.env, platform = process.platform) {
    const pkg = env.FLISK_EXPORT_PACKAGE || EXPORT_PACKAGE;
    return {
        command: platform === "win32" ? "npx.cmd" : "npx",
        args: ["--yes", pkg, ...args],
        shell: platform === "win32",
        pkg,
    };
}
/** The extra line printed when the exporter exits non-zero, in case npx could not fetch it at all. */
export function unavailableHint(pkg, exitCode) {
    return `flisk export: ${pkg} exited with code ${exitCode}. If npx could not download it, check your network access (the first run fetches it from npm) or set FLISK_EXPORT_PACKAGE.`;
}
/** Runs flisk-export with the caller's terminal and resolves to its exit code. */
export function runExport(args, spawnFn = spawn, env = process.env) {
    const invocation = exportInvocation(args, env);
    return new Promise((resolve) => {
        const child = spawnFn(invocation.command, invocation.args, {
            stdio: "inherit",
            shell: invocation.shell,
        });
        child.on("error", (err) => {
            console.error(`flisk export: could not run npx (${err.message}). Install Node.js 22.12 or later, which provides npx, and retry.`);
            resolve(127);
        });
        child.on("close", (code) => {
            const exitCode = code ?? 1;
            if (exitCode !== 0)
                console.error(unavailableHint(invocation.pkg, exitCode));
            resolve(exitCode);
        });
    });
}
/** Every argument goes to flisk-export as given; --dry-run is declared here so it shows in help and is put back. */
export function buildForwardedExportArgs(args, options = {}) {
    const forwarded = [...args];
    if (options.dryRun && !forwarded.includes("--dry-run"))
        forwarded.push("--dry-run");
    return forwarded;
}
export const exportCommand = new Command("export")
    .description("Write render.yaml or wrangler.toml from service.json; never deploys or calls a cloud API (runs flisk-export)")
    .argument("[args...]", "Passed to flisk-export: render [dir] [--resource <name>] [--out <dir>] [--force] | wrangler [dir] --resource <name> [--route <host>] [--out <dir>] [--allow-non-worker] [--force]")
    .option("--dry-run", "Print the file and write nothing", false)
    .allowUnknownOption()
    .helpOption(false)
    .action(async (args, options) => {
    process.exitCode = await runExport(buildForwardedExportArgs(args, options));
});
