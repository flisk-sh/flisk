import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  npxInvocation,
  safePackageSpec
} from "./chunk-V7DIUOBI.js";
import {
  nativeWindowsImportNotice
} from "./chunk-5L7YRPQH.js";
import {
  JsonCommandError,
  runJsonCommand
} from "./chunk-FU6O43SU.js";
import {
  clearDiscoveryCache
} from "./chunk-4EDXFYDP.js";
import {
  addYesOption
} from "./chunk-MJGDAK6E.js";
import {
  getPackageVersion
} from "./chunk-73W4Y4TI.js";

// dist/commands/import.js
import { spawn } from "node:child_process";
import fs from "node:fs";
import { Command } from "commander";
var IMPORT_PACKAGE = "flisk-import@0.18.3";
var TILTFILE_IMPORTER = "tiltfile";
var MIN_CORE_VERSION = "1.3.104";
var RECOMMENDED_CORE_VERSION = "1.4.11";
function parseSemver(raw) {
  const cleaned = raw.trim().replace(/^v/, "").split("+")[0];
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match)
    return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  const prereleaseRaw = match[4];
  const prerelease = prereleaseRaw ? prereleaseRaw.split(".").map((part) => /^\d+$/.test(part) ? Number(part) : part) : [];
  return { major, minor, patch, prerelease };
}
function compareSemver(aStr, bStr) {
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
    if (pA === void 0)
      return -1;
    if (pB === void 0)
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
function isVersionAtLeast(current, minimum) {
  const cmp = compareSemver(current, minimum);
  if (cmp === null)
    return false;
  return cmp >= 0;
}
function checkCoreVersion(currentVersion = getPackageVersion(), args = []) {
  const isWriting = !args.includes("--dry-run") && !args.includes("--help") && !args.includes("-h");
  if (!isWriting) {
    return { ok: true };
  }
  if (!isVersionAtLeast(currentVersion, MIN_CORE_VERSION)) {
    return {
      ok: false,
      message: `flisk import: installed Flisk core (${currentVersion}) is older than the required ${MIN_CORE_VERSION} (buildContext release). Upgrade with: flisk upgrade`
    };
  }
  return { ok: true };
}
function importInvocation(args, env = process.env, platform = process.platform, runtime = {}) {
  const pkg = safePackageSpec(env.FLISK_IMPORT_PACKAGE, IMPORT_PACKAGE);
  return { ...npxInvocation(["--yes", pkg, ...args], { ...runtime, platform }), pkg };
}
function runImport(args, spawnFn = spawn, getVersionFn = getPackageVersion) {
  const check = checkCoreVersion(getVersionFn(), args);
  if (!check.ok) {
    console.error(check.message);
    return Promise.resolve(1);
  }
  const invocation = importInvocation(args);
  return new Promise((resolve) => {
    const child = spawnFn(invocation.command, invocation.args, {
      stdio: "inherit",
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    child.on("error", (err) => {
      console.error(`flisk import: could not run npx (${err.message}). Install Node.js 22.12 or later, which provides npx, and retry.`);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}
function runImportCaptured(args, spawnFn = spawn, getVersionFn = getPackageVersion) {
  const check = checkCoreVersion(getVersionFn(), args);
  if (!check.ok) {
    return Promise.resolve({ exitCode: 1, stdout: "", stderr: check.message ?? "" });
  }
  const invocation = importInvocation(args);
  return new Promise((resolve) => {
    const child = spawnFn(invocation.command, invocation.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({
        exitCode: 127,
        stdout,
        stderr: `flisk import: could not run npx (${err.message}). Install Node.js 22.12 or later, which provides npx, and retry.`
      });
    });
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}
function buildForwardedImportArgs(args, options = {}) {
  let yes = Boolean(options.yes);
  let force = Boolean(options.force);
  const filtered = [];
  let strippedCompose = args[0] === TILTFILE_IMPORTER;
  for (const arg of args) {
    if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (!strippedCompose && arg === "compose") {
      strippedCompose = true;
    } else {
      filtered.push(arg);
    }
  }
  if (options.dryRun && !filtered.includes("--dry-run")) {
    filtered.push("--dry-run");
  }
  if (yes) {
    filtered.push("--yes");
  }
  if (force) {
    filtered.push("--force");
  }
  return filtered;
}
function importReport(forwardedArgs, run) {
  const isTiltfile = forwardedArgs[0] === TILTFILE_IMPORTER;
  const positional = (isTiltfile ? forwardedArgs.slice(1) : forwardedArgs).find((arg) => !arg.startsWith("-"));
  const common = {
    dryRun: forwardedArgs.includes("--dry-run"),
    force: forwardedArgs.includes("--force"),
    written: [...run.stdout.matchAll(/^\s+wrote (.+)$/gm)].map((match) => match[1].trim()),
    output: run.stdout.trim()
  };
  return isTiltfile ? { path: positional ?? "Tiltfile", ...common } : { dir: positional ?? ".", ...common };
}
function importFailure(run, commandName = "flisk import") {
  const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);
  const errLines = lines(run.stderr);
  const hints = errLines.filter((line) => line.startsWith("->")).map((line) => line.slice(2).trim());
  const errorLine = errLines.find((line) => line.startsWith("Error:"));
  const message = errorLine?.replace(/^Error:\s*/, "") ?? (errLines.filter((line) => !line.startsWith("->")).join(" ") || lines(run.stdout).pop() || `flisk-import exited with code ${run.exitCode}`);
  const fallback = run.exitCode === 127 ? "Install Node.js 22.12 or later, which provides npx, then run the command again" : `Run \`${commandName} --dry-run\` to see the plan without writing anything`;
  const suggestions = hints.length > 0 ? hints : [fallback];
  return new JsonCommandError("IMPORT_FAILED", message, suggestions, run.exitCode);
}
function resolveImportOptions(options = {}, cmd) {
  const parentOpts = cmd?.parent?.opts() ?? {};
  const cmdOpts = cmd?.opts() ?? {};
  return {
    yes: Boolean(options.yes || cmdOpts.yes || parentOpts.yes),
    force: Boolean(options.force || cmdOpts.force || parentOpts.force),
    dryRun: Boolean(options.dryRun || cmdOpts.dryRun || parentOpts.dryRun),
    json: Boolean(options.json || cmdOpts.json || parentOpts.json)
  };
}
function carryOverBuildCommand(manifest, command) {
  const rawCommand = command ?? manifest.command;
  if (!rawCommand)
    return manifest;
  const commandList = Array.isArray(rawCommand) ? rawCommand.map(String) : typeof rawCommand === "string" && rawCommand.trim() !== "" ? (rawCommand.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []).map((token) => token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'") ? token.slice(1, -1) : token) : void 0;
  if (!commandList || commandList.length === 0)
    return manifest;
  const hasBuild = manifest.build !== void 0 || manifest.buildContext !== void 0 || manifest.dockerfile !== void 0;
  if (hasBuild || manifest.image) {
    const existingContainer = manifest.container && typeof manifest.container === "object" && !Array.isArray(manifest.container) ? manifest.container : {};
    const updated = {
      ...manifest,
      container: {
        ...existingContainer,
        command: commandList
      }
    };
    if ("command" in updated) {
      delete updated.command;
    }
    return updated;
  }
  return manifest;
}
function syncImportedManifestCommands(writtenPaths) {
  for (const relativePath of writtenPaths) {
    try {
      if (!relativePath.endsWith("service.json"))
        continue;
      if (!fs.existsSync(relativePath))
        continue;
      const content = fs.readFileSync(relativePath, "utf-8");
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        const updated = carryOverBuildCommand(parsed);
        if (JSON.stringify(updated) !== JSON.stringify(parsed)) {
          fs.writeFileSync(relativePath, `${JSON.stringify(updated, null, 2)}
`, "utf-8");
        }
      }
    } catch {
    }
  }
}
async function executeImport(args, options = {}, commandName = "flisk import") {
  const windowsNotice = nativeWindowsImportNotice(process.platform, process.env.FLISK_ALLOW_NATIVE_WINDOWS);
  if (windowsNotice)
    console.error(windowsNotice);
  if (options.json) {
    await runJsonCommand("IMPORT_FAILED", commandName, async () => {
      const forwardedArgs2 = buildForwardedImportArgs(args, { ...options, yes: true });
      const run = await runImportCaptured(forwardedArgs2);
      clearDiscoveryCache();
      if (run.stdout.trim())
        console.log(run.stdout.trimEnd());
      if (run.stderr.trim())
        console.error(run.stderr.trimEnd());
      if (run.exitCode !== 0)
        throw importFailure(run, commandName);
      const report = importReport(forwardedArgs2, run);
      syncImportedManifestCommands(report.written);
      return { data: report };
    });
    return;
  }
  const forwardedArgs = buildForwardedImportArgs(args, options);
  const refusal = nonInteractiveRefusal(forwardedArgs, commandName);
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
    return;
  }
  process.exitCode = await runImport(forwardedArgs);
  clearDiscoveryCache();
}
function nonInteractiveRefusal(forwardedArgs, commandName = "flisk import", isTTY = Boolean(process.stdin.isTTY)) {
  if (isTTY)
    return null;
  const answersItself = ["--yes", "--dry-run", "--help", "-h"].some((flag) => forwardedArgs.includes(flag));
  if (answersItself)
    return null;
  return [
    `${commandName}: no terminal to confirm the import, so nothing was written.`,
    `-> Preview first: ${commandName} --dry-run`,
    `-> Then write without a prompt: ${commandName} --yes (or --json)`
  ].join("\n");
}
var composeCommand = addYesOption(new Command("compose")).description("Import a directory's root docker-compose.yml, same as flisk import (runs flisk-import)").argument("[args...]", "Passed to flisk-import: [dir] --dry-run --yes --force").option("-f, --force", "Overwrite an existing service.json", false).option("--dry-run", "Print the plan and write nothing", false).option("--json", "Print one JSON envelope on stdout with the importer's output; implies --yes", false).allowUnknownOption().helpOption(false).action(async (args, options, cmd) => {
  const resolved = resolveImportOptions(options, cmd);
  await executeImport(args, resolved, "flisk import compose");
});
var tiltfileCommand = addYesOption(new Command("tiltfile")).description("Register an existing Tiltfile so flisk up runs it unchanged (writes .flisk/project.json)").argument("[args...]", "Passed to flisk-import tiltfile: [path] --dry-run --yes --force").option("-f, --force", "Overwrite existing orchestration configuration", false).option("--dry-run", "Print the plan and write nothing", false).option("--json", "Print one JSON envelope on stdout with the importer's output; implies --yes", false).allowUnknownOption().helpOption(false).action(async (args, options, cmd) => {
  const resolved = resolveImportOptions(options, cmd);
  await executeImport([TILTFILE_IMPORTER, ...args], resolved, "flisk import tiltfile");
});
var importCommand = addYesOption(new Command("import")).description("Import the services in a directory's root docker-compose.yml (runs flisk-import)").argument("[args...]", "Passed to flisk-import: [dir] --dry-run --yes --force").option("-f, --force", "Overwrite an existing service.json", false).option("--dry-run", "Print the plan and write nothing", false).option("--json", "Print one JSON envelope on stdout with the importer's output; implies --yes", false).allowUnknownOption().helpOption(false).addCommand(composeCommand).addCommand(tiltfileCommand).action(async (args, options, cmd) => {
  const resolved = resolveImportOptions(options, cmd);
  await executeImport(args, resolved, "flisk import");
});

export {
  IMPORT_PACKAGE,
  TILTFILE_IMPORTER,
  MIN_CORE_VERSION,
  RECOMMENDED_CORE_VERSION,
  parseSemver,
  compareSemver,
  isVersionAtLeast,
  checkCoreVersion,
  importInvocation,
  runImport,
  runImportCaptured,
  buildForwardedImportArgs,
  importReport,
  importFailure,
  resolveImportOptions,
  carryOverBuildCommand,
  syncImportedManifestCommands,
  executeImport,
  nonInteractiveRefusal,
  composeCommand,
  tiltfileCommand,
  importCommand
};
