// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * `flisk export render|wrangler`: writes a deploy file from service.json and stops there. It never deploys, never
 * creates DNS records and never calls a cloud API (the export scope agreed in AGENTS.md, "Local-only by default").
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import type { DiscoveredResource } from "../types/index.js";
import {
  assertExportable,
  buildRenderBlueprint,
  buildWranglerToml,
  EXPORTABLE_TYPES,
} from "../utils/deploy-export.js";
import { errorFactories, FliskError, runCommand } from "../utils/errors.js";
import { findProjectRoot } from "../utils/paths.js";
import { discoverResourcesFromRoot } from "../utils/services.js";

const NOTHING_DEPLOYED =
  "Nothing was deployed, no DNS record was created and no cloud API was called.";

interface ExportOptions {
  resource?: string;
  out?: string;
  dryRun?: boolean;
  force?: boolean;
}

function requireProjectRoot(): string {
  const root = findProjectRoot();
  if (!root) throw errorFactories.notInProject();
  return root;
}

function findResource(resources: readonly DiscoveredResource[], name: string): DiscoveredResource {
  const resource = resources.find((candidate) => candidate.name === name);
  if (!resource) throw errorFactories.resourceNotFound(name);
  return resource;
}

/** Prints the file in a dry run, otherwise writes it, refusing to replace an existing file without --force. */
function emit(filePath: string, content: string, options: ExportOptions): void {
  const shown = relative(process.cwd(), filePath) || filePath;
  if (options.dryRun) {
    console.log(`Dry run - would write ${shown} (nothing written, nothing deployed):`);
    console.log("");
    process.stdout.write(content);
    return;
  }
  if (existsSync(filePath) && !options.force) {
    throw new FliskError(`${shown} already exists and was left unchanged`, [
      "Pass --force to replace it",
      "Pass --dry-run to see what would be written",
      "Pass --out <dir> to write it somewhere else",
    ]);
  }
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, content, "utf-8");
  console.log(chalk.green(`Wrote ${shown}.`));
  console.log(NOTHING_DEPLOYED);
}

const renderCommand = new Command("render")
  .description("Write a Render Blueprint (render.yaml) from service.json; never deploys")
  .option(
    "--resource <name>",
    "Export only this resource (default: every resource that serves HTTP)",
  )
  .option("--out <dir>", "Directory to write render.yaml in (default: the project root)")
  .option("--dry-run", "Print render.yaml instead of writing it", false)
  .option("--force", "Replace an existing render.yaml", false)
  .action(async (options: ExportOptions) => {
    await runCommand(async () => {
      const root = requireProjectRoot();
      const all = discoverResourcesFromRoot(root);
      let resources: DiscoveredResource[];
      if (options.resource) {
        resources = [findResource(all, options.resource)];
      } else {
        resources = all
          .filter((resource) =>
            EXPORTABLE_TYPES.includes(resource.config?.appType ?? resource.type ?? ""),
          )
          .sort((a, b) => a.name.localeCompare(b.name));
        if (resources.length === 0) {
          throw new FliskError("No resource that serves HTTP was found to export", [
            `Exported types: ${EXPORTABLE_TYPES.join(", ")}`,
            "flisk resources",
          ]);
        }
      }
      const outDir = resolve(options.out ?? root);
      emit(join(outDir, "render.yaml"), buildRenderBlueprint(root, resources), options);
    });
  });

const wranglerCommand = new Command("wrangler")
  .description("Write a Cloudflare wrangler.toml for one resource from service.json; never deploys")
  .requiredOption("--resource <name>", "The resource to export")
  .option("--route <host>", "Custom domain for the Worker (routes with custom_domain = true)")
  .option("--out <dir>", "Directory to write wrangler.toml in (default: the resource directory)")
  .option("--dry-run", "Print wrangler.toml instead of writing it", false)
  .option("--force", "Replace an existing wrangler.toml", false)
  .action(async (options: ExportOptions & { resource: string; route?: string }) => {
    await runCommand(async () => {
      const root = requireProjectRoot();
      const resource = findResource(discoverResourcesFromRoot(root), options.resource);
      assertExportable(resource);
      const outDir = resolve(options.out ?? resource.path);
      const content = buildWranglerToml(resource, outDir, { route: options.route });
      emit(join(outDir, "wrangler.toml"), content, options);
    });
  });

export const exportCommand = new Command("export")
  .description(
    "Write deploy files (render.yaml, wrangler.toml) from service.json; never deploys or calls a cloud API",
  )
  .addCommand(renderCommand)
  .addCommand(wranglerCommand);
