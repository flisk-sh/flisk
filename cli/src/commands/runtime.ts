// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { findCliAssetRoot, loadTemplate } from "../generator/template-engine.js";

const REQUIRED_ASSET_PATHS = [
  { path: "Tiltfile", directory: false },
  { path: "engine", directory: true },
  { path: "discovery", directory: true },
  { path: "specs", directory: true },
  { path: "ext", directory: true },
  { path: "cli/templates", directory: true },
  { path: "shared-platform-engineering/docker-templates", directory: true },
] as const;

const REQUIRED_TEMPLATES = [
  ".tiltignore.hbs",
  "TILT_RESOURCE_DEFAULTS.star.hbs",
  "TILT_TECH_STACK.star.hbs",
  "Tiltfile.hbs",
  "spec.master.hbs",
] as const;

export const runtimeCommand = new Command("runtime")
  .description("Inspect the packaged Flisk runtime assets")
  .option("--check-assets", "Check bundled engine and template assets")
  .option("--json", "Print the check result as JSON")
  .action((options: { checkAssets?: boolean; json?: boolean }) => {
    if (!options.checkAssets) {
      runtimeCommand.outputHelp();
      process.exitCode = 2;
      return;
    }

    const candidate = findCliAssetRoot();
    const assetRoot = candidate ? resolve(candidate) : null;
    const missing = assetRoot
      ? REQUIRED_ASSET_PATHS.filter(({ path, directory }) => {
          try {
            const stats = statSync(join(assetRoot, path));
            return directory ? !stats.isDirectory() : !stats.isFile();
          } catch {
            return true;
          }
        }).map(({ path }) => path)
      : REQUIRED_ASSET_PATHS.map(({ path }) => path);
    const templateErrors: string[] = [];

    if (assetRoot && missing.length === 0) {
      for (const template of REQUIRED_TEMPLATES) {
        try {
          loadTemplate(template);
        } catch (error) {
          templateErrors.push(
            error instanceof Error ? error.message : `Failed to load template ${template}`,
          );
        }
      }
    }

    const ok = Boolean(assetRoot) && missing.length === 0 && templateErrors.length === 0;
    if (options.json) {
      console.log(JSON.stringify({ ok, assetRoot, missing, templateErrors }));
    } else if (ok) {
      console.log(`Flisk runtime assets found at ${assetRoot}`);
    } else {
      console.error(
        [
          assetRoot
            ? `Incomplete Flisk runtime assets at ${assetRoot}`
            : "Flisk runtime assets not found",
          ...missing.map((path) => `Missing: ${path}`),
          ...templateErrors,
        ].join("\n"),
      );
    }

    if (!ok) process.exitCode = 1;
  });
