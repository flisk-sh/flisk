import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  npxInvocation,
  safePackageSpec
} from "./chunk-V7DIUOBI.js";

// dist/commands/export.js
import { spawn } from "node:child_process";
import { Command } from "commander";
var EXPORT_PACKAGE = "@flisk-sh/flisk-export@0.10.0";
function exportInvocation(args, env = process.env, platform = process.platform, runtime = {}) {
  const pkg = safePackageSpec(env.FLISK_EXPORT_PACKAGE, EXPORT_PACKAGE);
  return { ...npxInvocation(["--yes", pkg, ...args], { ...runtime, platform }), pkg };
}
function unavailableHint(pkg, exitCode) {
  return `flisk export: ${pkg} exited with code ${exitCode}. If npx could not download it, check your network access (the first run fetches it from npm) or set FLISK_EXPORT_PACKAGE.`;
}
function runExport(args, spawnFn = spawn, env = process.env) {
  const invocation = exportInvocation(args, env);
  return new Promise((resolve) => {
    let spawnFailed = false;
    const child = spawnFn(invocation.command, invocation.args, {
      stdio: "inherit",
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    child.on("error", (err) => {
      spawnFailed = true;
      console.error(`flisk export: could not run npx (${err.message}). Install Node.js 22.12 or later, which provides npx, and retry.`);
      resolve(127);
    });
    child.on("close", (code) => {
      if (spawnFailed)
        return;
      const exitCode = code ?? 1;
      if (exitCode !== 0)
        console.error(unavailableHint(invocation.pkg, exitCode));
      resolve(exitCode);
    });
  });
}
function buildForwardedExportArgs(args, options = {}) {
  const forwarded = [...args];
  if (options.dryRun && !forwarded.includes("--dry-run"))
    forwarded.push("--dry-run");
  return forwarded;
}
var exportCommand = new Command("export").description("Write render.yaml, wrangler.toml or a standalone docker-compose.yml from service.json; never deploys or calls a cloud API (runs flisk-export)").argument("[args...]", "Passed to flisk-export: render [dir] [--resource <name>] [--out <dir>] [--force] | wrangler [dir] --resource <name> [--route <host>] [--out <dir>] [--allow-non-worker] [--force] | compose [dir] [--out <dir>] [--force] [--check]").option("--dry-run", "Print the file and write nothing", false).allowUnknownOption().helpOption(false).action(async (args, options) => {
  process.exitCode = await runExport(buildForwardedExportArgs(args, options));
});

export {
  EXPORT_PACKAGE,
  exportInvocation,
  unavailableHint,
  runExport,
  buildForwardedExportArgs,
  exportCommand
};
