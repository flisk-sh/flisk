// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk distribute`: how an app gets to its users. Reads service.json files and distribution.json,
 * and writes local files only. It never submits a listing, calls a marketplace or cloud API, or deploys.
 */
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import {
  buildBoard,
  buildKit,
  buildStatusGrid,
  createInitialDistribution,
  DISTRIBUTION_FILE,
  type DistributionFile,
  distributionWarnings,
  formatBoard,
  formatStatusGrid,
  mergeDistribution,
  readDistributionFile,
  writeKit,
} from "../utils/distribution.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { createMachineEnvelope, writeMachineError } from "../utils/machine-output.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResourcesFromRoot } from "../utils/services.js";

function projectRootOrThrow(): string {
  const root = findProjectRoot();
  if (!root) throw errorFactories.notInProject();
  return root;
}

/** Reads distribution.json and prints its warnings on stderr, so --json output stays clean. */
function readDistribution(root: string): DistributionFile | null {
  const dist = readDistributionFile(root);
  for (const warning of distributionWarnings(dist)) console.warn(`⚠️  ${warning}`);
  return dist;
}

async function run(isJson: boolean, action: () => Promise<void>): Promise<void> {
  if (isJson) {
    try {
      await action();
    } catch (err) {
      writeMachineError(err);
    }
    return;
  }
  await runCommand(action);
}

const boardCommand = new Command("board")
  .description(
    "Print the Zachman board: six perspectives (Planner to User) by six questions, each cell read from service.json or distribution.json",
  )
  .option("--json", "Output the board as a versioned JSON envelope", false)
  .action(async (options: { json?: boolean }) => {
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
  .description(
    "Write a listing kit for one resource (plugin.json, .mcp.json, server.json, listing.md)",
  )
  .argument("<resource>", "Resource name")
  .option("--out <dir>", "Folder to write the kit to (default: distribution/<resource>)")
  .option("--dry-run", "Print the kit and write nothing", false)
  .option("--force", "Overwrite an existing kit", false)
  .action(
    async (resourceName: string, options: { out?: string; dryRun?: boolean; force?: boolean }) => {
      await run(false, async () => {
        const root = projectRootOrThrow();
        const resources = discoverResourcesFromRoot(root);
        const resource = resources.find((r) => r.name === resourceName);
        if (!resource) {
          throw new FliskError(`No resource named ${resourceName}`, [
            `Resources: ${
              resources
                .map((r) => r.name)
                .sort()
                .join(", ") || "none"
            }`,
          ]);
        }
        const kit = buildKit(resource, readDistribution(root));
        const outDir = path.resolve(options.out ?? path.join(root, "distribution", resource.name));
        if (options.dryRun) {
          console.log(`Dry run - would write ${kit.files.length} files to ${outDir}:`);
          for (const file of kit.files) {
            console.log(`\n--- ${file.path} ---\n${file.content}`);
          }
        } else {
          const written = writeKit(kit, outDir, Boolean(options.force));
          console.log(`Wrote the listing kit for ${resource.name}:`);
          for (const file of written) console.log(`  ${path.relative(root, file) || file}`);
          console.log(
            "Nothing was submitted. Fill in the REPLACE-ME parts, then submit each listing by hand.",
          );
        }
        for (const warning of kit.warnings) console.log(`⚠️  ${warning}`);
      });
    },
  );

const statusSubcommand = new Command("status")
  .description(`Print the channel grid from ${DISTRIBUTION_FILE}`)
  .option("--json", "Output the grid as a versioned JSON envelope", false)
  .option("--init", `Write an empty ${DISTRIBUTION_FILE} for the project's resources`, false)
  .option(
    "--force",
    `With --init, add missing apps and channels to an existing ${DISTRIBUTION_FILE}, keeping its entries`,
    false,
  )
  .action(async (options: { json?: boolean; init?: boolean; force?: boolean }) => {
    await run(Boolean(options.json), async () => {
      const root = projectRootOrThrow();
      const file = path.join(root, DISTRIBUTION_FILE);
      if (options.init) {
        if (fs.existsSync(file) && !options.force) {
          throw new FliskError(`${DISTRIBUTION_FILE} already exists`, [
            "Edit it by hand, or run again with --force to add missing apps and channels",
          ]);
        }
        const resources = discoverResourcesFromRoot(root);
        const existing = fs.existsSync(file) ? readDistribution(root) : null;
        const initial = existing
          ? mergeDistribution(existing, resources)
          : createInitialDistribution(resources);
        fs.writeFileSync(file, `${JSON.stringify(initial, null, 2)}\n`);
        if (options.json) {
          console.log(JSON.stringify(createMachineEnvelope({ path: file, distribution: initial })));
        } else {
          console.log(
            existing
              ? `Updated ${DISTRIBUTION_FILE}: ${Object.keys(initial.apps).length} apps, existing entries kept.`
              : `Wrote ${DISTRIBUTION_FILE} with ${Object.keys(initial.apps).length} apps.`,
          );
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
  });

export const distributeCommand = new Command("distribute")
  .description(
    "How an app gets to its users: board, listing kit and channel status (local files only)",
  )
  .addCommand(boardCommand)
  .addCommand(kitCommand)
  .addCommand(statusSubcommand);
