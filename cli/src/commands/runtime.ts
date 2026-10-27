// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Command } from "commander";
import { findCliAssetRoot, loadTemplate } from "../generator/template-engine.js";
import {
  describeLayoutProblems,
  EXTENSION_DIRS,
  inspectExtensionLayout,
  resolveExtensionDir,
  resolveSharedPlatformDir,
  resolveTiltfile,
} from "../utils/runtime-layout.js";

const SHARED_PLATFORM_TEMPLATES = "shared-platform-engineering/docker-templates";

const REQUIRED_ASSET_PATHS = [
  { path: "Tiltfile", directory: false },
  { path: "engine", directory: true },
  { path: "discovery", directory: true },
  { path: "specs", directory: true },
  { path: "ext", directory: true },
  { path: "cli/templates", directory: true },
  { path: SHARED_PLATFORM_TEMPLATES, directory: true },
] as const;

const EXTENSION_NAMES: ReadonlySet<string> = new Set(EXTENSION_DIRS);
const PACKAGE_CLI_DIR = "cli";

/**
 * Turn the directory `findCliAssetRoot` found into the root the asset paths are relative to.
 *
 * The packaged CLI ships `cli/shared-platform-engineering/docker-templates`, so the upward search stops at
 * `cli/`. The Tiltfile, the extension directories and `cli/templates` sit one level up (the package root,
 * or the repository root in a source checkout). When the found directory is `cli/` and holds none of the
 * extension entries, check from its parent instead.
 */
function resolveAssetRoot(candidate: string): string {
  if (basename(candidate) !== PACKAGE_CLI_DIR) return candidate;
  const layout = inspectExtensionLayout(candidate);
  const hasNoExtensionEntries =
    layout.kind === "incomplete" && layout.missing.length === EXTENSION_DIRS.length + 1;
  return hasNoExtensionEntries ? dirname(candidate) : candidate;
}

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
    const assetRoot = candidate ? resolveAssetRoot(resolve(candidate)) : null;
    const missing = assetRoot
      ? REQUIRED_ASSET_PATHS.filter(({ path, directory }) => {
          try {
            const stats = statSync(
              EXTENSION_NAMES.has(path)
                ? resolveExtensionDir(assetRoot, path)
                : path === "Tiltfile"
                  ? resolveTiltfile(assetRoot)
                  : path === SHARED_PLATFORM_TEMPLATES
                    ? join(resolveSharedPlatformDir(assetRoot), "docker-templates")
                    : join(assetRoot, path),
            );
            return directory ? !stats.isDirectory() : !stats.isFile();
          } catch {
            return true;
          }
        }).map(({ path }) => path)
      : REQUIRED_ASSET_PATHS.map(({ path }) => path);
    const layout = assetRoot ? inspectExtensionLayout(assetRoot) : null;
    const layoutErrors =
      assetRoot && layout?.kind === "mixed" ? [describeLayoutProblems(assetRoot, layout)] : [];
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

    const ok =
      Boolean(assetRoot) &&
      missing.length === 0 &&
      layoutErrors.length === 0 &&
      templateErrors.length === 0;
    if (options.json) {
      console.log(JSON.stringify({ ok, assetRoot, missing, layoutErrors, templateErrors }));
    } else if (ok) {
      console.log(`Flisk runtime assets found at ${assetRoot}`);
    } else {
      console.error(
        [
          assetRoot
            ? `Incomplete Flisk runtime assets at ${assetRoot}`
            : "Flisk runtime assets not found",
          ...missing.map((path) => `Missing: ${path}`),
          ...layoutErrors,
          ...templateErrors,
        ].join("\n"),
      );
    }

    if (!ok) process.exitCode = 1;
  });
