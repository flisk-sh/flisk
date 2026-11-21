// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk distribute`: how an app gets to its users. Reads service.json files and distribution.json,
 * and writes local files only. It never submits a listing, calls a marketplace or cloud API, or deploys.
 */
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { buildBoard, buildKit, buildStatusGrid, createInitialDistribution, DISTRIBUTION_FILE, distributionWarnings, formatBoard, formatStatusGrid, mergeDistribution, readDistributionFile, writeKit, } from "../utils/distribution.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { formatCount } from "../utils/formatting.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResourcesFromRoot } from "../utils/services.js";
function projectRootOrThrow() {
    const root = findProjectRoot();
    if (!root)
        throw errorFactories.notInProject();
    return root;
}
/** Reads distribution.json and prints its warnings on stderr, so --json output stays clean. */
function readDistribution(root) {
    const dist = readDistributionFile(root);
    for (const warning of distributionWarnings(dist))
        console.warn(`⚠️  ${warning}`);
    return dist;
}
async function run(isJson, action) {
    if (isJson) {
        try {
            await action();
        }
        catch (err) {
            writeMachineError(err);
        }
        return;
    }
    await runCommand(action);
}
const boardCommand = new Command("board")
    .description("Print the Zachman board: six perspectives (Planner to User) by six questions, each cell read from service.json or distribution.json")
    .option("--json", "Output the board as a versioned JSON envelope", false)
    .action(async (options) => {
    await run(Boolean(options.json), async () => {
        const root = projectRootOrThrow();
        const board = buildBoard(discoverResourcesFromRoot(root), readDistribution(root));
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({ board })));
            return;
        }
        console.log(formatBoard(board));
    });
});
const kitCommand = new Command("kit")
    .description("Write a listing kit for one resource (plugin.json, .mcp.json, server.json, listing.md)")
    .argument("<resource>", "Resource name")
    .option("--out <dir>", "Folder to write the kit to (default: distribution/<resource>)")
    .option("--dry-run", "Print the kit and write nothing", false)
    .option("--force", "Overwrite an existing kit", false)
    .option("--json", "Output one JSON envelope with the kit result", false)
    .action(async (resourceName, options) => {
    await run(Boolean(options.json), async () => {
        const root = projectRootOrThrow();
        const resources = discoverResourcesFromRoot(root);
        const resource = resources.find((r) => r.name === resourceName);
        if (!resource) {
            throw new FliskError(`No resource named ${resourceName}`, [
                `Resources: ${resources
                    .map((r) => r.name)
                    .sort()
                    .join(", ") || "none"}`,
            ]);
        }
        const kit = buildKit(resource, readDistribution(root));
        const outDir = path.resolve(options.out ?? path.join(root, "distribution", resource.name));
        const didExist = kit.files.some((file) => fs.existsSync(path.join(outDir, file.path)));
        if (options.json) {
            if (options.dryRun) {
                console.log(JSON.stringify(createMachineEnvelope({
                    resource: resource.name,
                    outDir: path.relative(root, outDir) || outDir,
                    didExist,
                    writtenFiles: [],
                    plannedFiles: kit.files.map((file) => ({
                        path: path.relative(root, path.join(outDir, file.path)) || file.path,
                        content: file.content,
                    })),
                    warnings: kit.warnings,
                })));
            }
            else {
                const written = writeKit(kit, outDir, Boolean(options.force));
                console.log(JSON.stringify(createMachineEnvelope({
                    resource: resource.name,
                    outDir: path.relative(root, outDir) || outDir,
                    didExist,
                    writtenFiles: written.map((file) => path.relative(root, file) || file),
                    plannedFiles: [],
                    warnings: kit.warnings,
                })));
            }
            return;
        }
        if (options.dryRun) {
            console.log(`Dry run - would write ${formatCount(kit.files.length, "file")} to ${outDir}:`);
            for (const file of kit.files) {
                console.log(`\n--- ${file.path} ---\n${file.content}`);
            }
        }
        else {
            const written = writeKit(kit, outDir, Boolean(options.force));
            console.log(`Wrote the listing kit for ${resource.name}:`);
            for (const file of written)
                console.log(`  ${path.relative(root, file) || file}`);
            console.log("Nothing was submitted. Fill in the REPLACE-ME parts, then submit each listing by hand.");
        }
        for (const warning of kit.warnings)
            console.log(`⚠️  ${warning}`);
    });
})
    .addHelpText("after", "\nExamples:\n  flisk distribute kit my-resource --dry-run\n  flisk distribute kit my-resource --out ./listing\n  flisk distribute kit my-resource --force\n  flisk distribute kit my-resource --json");
function describeAdditions(baseline, next) {
    const lines = [];
    const oldApps = baseline?.apps ?? {};
    for (const [name, app] of Object.entries(next.apps)) {
        const old = oldApps[name];
        if (!old) {
            lines.push(`add app: ${name}`);
        }
        const oldChannels = old?.channels ?? {};
        for (const channel of Object.keys(app.channels ?? {})) {
            if (!(channel in oldChannels))
                lines.push(`add channel: ${name}/${channel}`);
        }
    }
    return lines;
}
const statusSubcommand = new Command("status")
    .description(`Print the channel grid from ${DISTRIBUTION_FILE}`)
    .option("--json", "Output the grid as a versioned JSON envelope", false)
    .option("--init", `Write an empty ${DISTRIBUTION_FILE} for the project's resources`, false)
    .option("--merge", `With --init, add missing apps and channels to an existing ${DISTRIBUTION_FILE}, keeping its entries`, false)
    .option("--reset", `With --init, replace an existing ${DISTRIBUTION_FILE} with fresh entries`, false)
    .option("--force", "Alias for --merge; use --reset to replace existing entries", false)
    .option("--dry-run", "With --init, print the apps and channels it would write and change nothing", false)
    .action(async (options) => {
    await run(Boolean(options.json), async () => {
        if (!options.init && (options.merge || options.reset || options.force || options.dryRun)) {
            throw new FliskError("Use --merge, --reset, --force and --dry-run only with --init", ["Run flisk distribute status --init --merge (or --reset, --force, --dry-run)"], 2);
        }
        const root = projectRootOrThrow();
        const file = path.join(root, DISTRIBUTION_FILE);
        if (options.init) {
            const merging = Boolean(options.merge || options.force);
            const resetting = Boolean(options.reset);
            if (merging && resetting) {
                throw new FliskError("Choose one of --merge and --reset", [
                    "--merge keeps existing entries",
                    "--reset replaces them with fresh entries",
                ]);
            }
            const exists = fs.existsSync(file);
            if (exists && !merging && !resetting) {
                throw new FliskError(`${DISTRIBUTION_FILE} already exists`, [
                    "Edit it by hand, or run again with --merge to add missing apps and channels",
                    "Or run with --reset to replace it with fresh entries",
                ]);
            }
            if (options.force && exists) {
                console.warn("Hint: --force now merges like --merge; use --reset to replace existing entries.");
            }
            const resources = discoverResourcesFromRoot(root);
            const existing = exists && !resetting ? readDistribution(root) : null;
            const initial = resetting || !existing
                ? createInitialDistribution(resources)
                : mergeDistribution(existing, resources);
            if (options.dryRun) {
                if (options.json) {
                    console.log(JSON.stringify(createMachineEnvelope({
                        dryRun: true,
                        path: file,
                        distribution: initial,
                    })));
                    return;
                }
                console.log(`Dry run - would ${resetting ? "reset" : exists ? "update" : "write"} ${DISTRIBUTION_FILE} (nothing written):`);
                const additions = describeAdditions(resetting ? null : existing, initial);
                if (additions.length === 0)
                    console.log("  No additions.");
                else
                    for (const line of additions)
                        console.log(`  ${line}`);
                return;
            }
            fs.writeFileSync(file, `${JSON.stringify(initial, null, 2)}\n`);
            if (options.json) {
                console.log(JSON.stringify(createMachineEnvelope({ path: file, distribution: initial })));
            }
            else {
                console.log(resetting
                    ? `Reset ${DISTRIBUTION_FILE} with ${Object.keys(initial.apps).length} apps.`
                    : existing
                        ? `Updated ${DISTRIBUTION_FILE}: ${Object.keys(initial.apps).length} apps, existing entries kept.`
                        : `Wrote ${DISTRIBUTION_FILE} with ${Object.keys(initial.apps).length} apps.`);
            }
            return;
        }
        const dist = readDistribution(root);
        if (!dist) {
            throw new FliskError(`No ${DISTRIBUTION_FILE} in ${root}`, [
                "Run flisk distribute status --init to create one",
            ]);
        }
        const grid = buildStatusGrid(dist);
        if (options.json) {
            console.log(JSON.stringify(createMachineEnvelope({ grid })));
            return;
        }
        console.log(formatStatusGrid(grid));
    });
})
    .addHelpText("after", `\nExamples:\n  flisk distribute status --init --dry-run\n  flisk distribute status --init --merge\n  flisk distribute status --init --reset`);
export const distributeCommand = new Command("distribute")
    .description("How an app gets to its users: board, listing kit and channel status (local files only)")
    .addCommand(boardCommand)
    .addCommand(kitCommand)
    .addCommand(statusSubcommand);
