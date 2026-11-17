import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  EXTENSION_DIRS,
  describeLayoutProblems,
  findCliAssetRoot,
  inspectExtensionLayout,
  loadTemplate,
  resolveExtensionDir,
  resolveSharedPlatformDir,
  resolveTiltfile
} from "./chunk-RYTYYP36.js";
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";

// dist/commands/runtime.js
import { statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Command } from "commander";
var SHARED_PLATFORM_TEMPLATES = "shared-platform-engineering/docker-templates";
var REQUIRED_ASSET_PATHS = [
  { path: "Tiltfile", directory: false },
  { path: "engine", directory: true },
  { path: "discovery", directory: true },
  { path: "specs", directory: true },
  { path: "ext", directory: true },
  { path: "cli/templates", directory: true },
  { path: SHARED_PLATFORM_TEMPLATES, directory: true }
];
var EXTENSION_NAMES = new Set(EXTENSION_DIRS);
var PACKAGE_CLI_DIR = "cli";
function resolveAssetRoot(candidate) {
  if (basename(candidate) !== PACKAGE_CLI_DIR)
    return candidate;
  const layout = inspectExtensionLayout(candidate);
  const hasNoExtensionEntries = layout.kind === "incomplete" && layout.missing.length === EXTENSION_DIRS.length + 1;
  return hasNoExtensionEntries ? dirname(candidate) : candidate;
}
var REQUIRED_TEMPLATES = [
  ".tiltignore.hbs",
  "TILT_RESOURCE_DEFAULTS.star.hbs",
  "TILT_TECH_STACK.star.hbs",
  "Tiltfile.hbs",
  "spec.master.hbs"
];
var runtimeCommand = new Command("runtime").description("Inspect the packaged Flisk runtime assets").option("--check-assets", "Check bundled engine and template assets").option("--json", "Print the check result as JSON").action((options) => {
  if (!options.checkAssets) {
    runtimeCommand.outputHelp();
    process.exitCode = 2;
    return;
  }
  const candidate = findCliAssetRoot();
  const assetRoot = candidate ? resolveAssetRoot(resolve(candidate)) : null;
  const missing = assetRoot ? REQUIRED_ASSET_PATHS.filter(({ path, directory }) => {
    try {
      const stats = statSync(EXTENSION_NAMES.has(path) ? resolveExtensionDir(assetRoot, path) : path === "Tiltfile" ? resolveTiltfile(assetRoot) : path === SHARED_PLATFORM_TEMPLATES ? join(resolveSharedPlatformDir(assetRoot), "docker-templates") : join(assetRoot, path));
      return directory ? !stats.isDirectory() : !stats.isFile();
    } catch {
      return true;
    }
  }).map(({ path }) => path) : REQUIRED_ASSET_PATHS.map(({ path }) => path);
  const layout = assetRoot ? inspectExtensionLayout(assetRoot) : null;
  const layoutErrors = assetRoot && layout?.kind === "mixed" ? [describeLayoutProblems(assetRoot, layout)] : [];
  const templateErrors = [];
  if (assetRoot && missing.length === 0) {
    for (const template of REQUIRED_TEMPLATES) {
      try {
        loadTemplate(template);
      } catch (error) {
        templateErrors.push(error instanceof Error ? error.message : `Failed to load template ${template}`);
      }
    }
  }
  const ok = Boolean(assetRoot) && missing.length === 0 && layoutErrors.length === 0 && templateErrors.length === 0;
  if (options.json) {
    const errors = ok ? [] : [
      {
        code: "RUNTIME_CHECK_FAILED",
        message: [
          assetRoot ? `Incomplete Flisk runtime assets at ${assetRoot}` : "Flisk runtime assets not found",
          ...missing.map((path) => `Missing: ${path}`),
          ...layoutErrors,
          ...templateErrors
        ].join("; ")
      }
    ];
    console.log(JSON.stringify(createMachineEnvelope({ ok, assetRoot, missing, layoutErrors, templateErrors }, errors)));
  } else if (ok) {
    console.log(`Flisk runtime assets found at ${assetRoot}`);
  } else {
    console.error([
      assetRoot ? `Incomplete Flisk runtime assets at ${assetRoot}` : "Flisk runtime assets not found",
      ...missing.map((path) => `Missing: ${path}`),
      ...layoutErrors,
      ...templateErrors
    ].join("\n"));
  }
  if (!ok)
    process.exitCode = 1;
}).addHelpText("after", "\nExamples:\n  flisk runtime --check-assets\n  flisk runtime --check-assets --json");

export {
  runtimeCommand
};
