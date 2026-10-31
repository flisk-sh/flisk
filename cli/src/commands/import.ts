// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnOptions, spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { cwd } from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import { wrappedTiltfilePath } from "../generator/template-engine.js";
import type { ProjectConfig } from "../types/index.js";
import { addYesOption } from "../utils/command-helpers.js";
import { PROJECT_JSON } from "../utils/constants.js";
import { runCommand } from "../utils/errors.js";
import { ensureDirectory, writeJsonFile } from "../utils/file-helpers.js";
import { JsonCommandError, runJsonCommand } from "../utils/json-command.js";
import { findProjectRoot, getPackageVersion } from "../utils/paths.js";
import { createDefaultProjectConfig } from "./project.js";

/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `flisk import` does. Move the pin
 * when a new importer is published. `FLISK_IMPORT_PACKAGE` overrides the package spec.
 */
export const IMPORT_PACKAGE = "flisk-import@0.3.0";

/** Minimum Flisk core release supporting buildContext required by flisk import (#634). */
export const MIN_CORE_VERSION = "1.3.104";

/**
 * Recommended core for imported stacks: 1.4.11 (#2646) runs a bring-your-own port outside 4000-5999 and two-letter
 * names, which flisk-import 0.3.0 writes. The pin ships in the CLI itself, so a CLI that runs 0.3.0 is already newer.
 */
export const RECOMMENDED_CORE_VERSION = "1.4.11";

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>;

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
}

/** Parses a semver version string, extracting major, minor, patch, and prerelease identifiers. */
export function parseSemver(raw: string): ParsedSemver | null {
  const cleaned = raw.trim().replace(/^v/, "").split("+")[0];
  const match = cleaned.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3] ?? 0);
  const prereleaseRaw = match[4];

  const prerelease: (string | number)[] = prereleaseRaw
    ? prereleaseRaw.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];

  return { major, minor, patch, prerelease };
}

/**
 * Compares two semver version strings per the SemVer 2.0.0 specification:
 * Returns 1 if a > b, -1 if a < b, 0 if a === b, or null if either is unparseable.
 */
export function compareSemver(aStr: string, bStr: string): number | null {
  const a = parseSemver(aStr);
  const b = parseSemver(bStr);
  if (!a || !b) return null;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  const aHasPre = a.prerelease.length > 0;
  const bHasPre = b.prerelease.length > 0;

  // A normal version has greater precedence than a prerelease of the same major.minor.patch
  if (aHasPre && !bHasPre) return -1;
  if (!aHasPre && bHasPre) return 1;
  if (!aHasPre && !bHasPre) return 0;

  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const pA = a.prerelease[i];
    const pB = b.prerelease[i];

    if (pA === undefined) return -1;
    if (pB === undefined) return 1;
    if (pA === pB) continue;

    const numA = typeof pA === "number";
    const numB = typeof pB === "number";

    if (numA && !numB) return -1;
    if (!numA && numB) return 1;

    if (numA && numB) {
      return (pA as number) > (pB as number) ? 1 : -1;
    }

    return (pA as string).localeCompare(pB as string) > 0 ? 1 : -1;
  }

  return 0;
}

/** Compares two semver version strings. Returns true if current >= minimum. */
export function isVersionAtLeast(current: string, minimum: string): boolean {
  const cmp = compareSemver(current, minimum);
  if (cmp === null) return false;
  return cmp >= 0;
}

/**
 * Checks whether the running Flisk CLI meets the minimum version required to adopt Compose repos.
 * If the installed core is older than the buildContext release (1.3.104), exit before writing
 * and print the upgrade command.
 */
export function checkCoreVersion(
  currentVersion: string = getPackageVersion(),
  args: string[] = [],
): { ok: boolean; message?: string } {
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

export function importInvocation(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; shell: boolean } {
  const pkg = env.FLISK_IMPORT_PACKAGE || IMPORT_PACKAGE;
  return {
    command: platform === "win32" ? "npx.cmd" : "npx",
    args: ["--yes", pkg, ...args],
    shell: platform === "win32",
  };
}

/** Runs flisk-import with the caller's terminal and resolves to its exit code. */
export function runImport(
  args: string[],
  spawnFn: SpawnFn = spawn,
  getVersionFn: () => string = getPackageVersion,
): Promise<number> {
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
      console.error(
        `flisk import: could not run npx (${err.message}). Install Node.js/npm and retry.`,
      );
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** What flisk-import printed and how it exited, for `flisk import --json`. */
export interface ImportRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs flisk-import with its output piped instead of the caller's terminal and no stdin, so it can never prompt, and
 * resolves to what it printed and its exit code. A refusal of the core version gate or a missing npx is a run too.
 */
export function runImportCaptured(
  args: string[],
  spawnFn: SpawnFn = spawn,
  getVersionFn: () => string = getPackageVersion,
): Promise<ImportRun> {
  const check = checkCoreVersion(getVersionFn(), args);
  if (!check.ok) {
    return Promise.resolve({ exitCode: 1, stdout: "", stderr: check.message ?? "" });
  }
  const invocation = importInvocation(args);
  return new Promise((resolve) => {
    const child = spawnFn(invocation.command, invocation.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: invocation.shell,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({
        exitCode: 127,
        stdout,
        stderr: `flisk import: could not run npx (${err.message}). Install Node.js/npm and retry.`,
      });
    });
    child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

export function buildForwardedImportArgs(
  args: string[],
  options: { yes?: boolean; force?: boolean; dryRun?: boolean } = {},
): string[] {
  let yes = Boolean(options.yes);
  let force = Boolean(options.force);

  const filtered: string[] = [];
  let strippedCompose = false;
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

/** What `flisk import --json` reports. `written` lists the service.json files the importer says it wrote. */
export interface ImportReport {
  dir: string;
  dryRun: boolean;
  force: boolean;
  written: string[];
  output: string;
}

/** The report of a successful run, read from the forwarded arguments and the importer's "  wrote <path>" lines. */
export function importReport(forwardedArgs: string[], run: ImportRun): ImportReport {
  return {
    dir: forwardedArgs.find((arg) => !arg.startsWith("-")) ?? ".",
    dryRun: forwardedArgs.includes("--dry-run"),
    force: forwardedArgs.includes("--force"),
    written: [...run.stdout.matchAll(/^\s+wrote (.+)$/gm)].map((match) => match[1].trim()),
    output: run.stdout.trim(),
  };
}

/**
 * The error of a failed run: the importer's "Error: ..." line (or whatever it printed last) and its "-> ..." hints. The
 * importer prints "Nothing to import: ..." on stdout, so stdout is read when stderr says nothing.
 */
export function importFailure(run: ImportRun): JsonCommandError {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const errLines = lines(run.stderr);
  const hints = errLines
    .filter((line) => line.startsWith("->"))
    .map((line) => line.slice(2).trim());
  const errorLine = errLines.find((line) => line.startsWith("Error:"));
  const message =
    errorLine?.replace(/^Error:\s*/, "") ??
    (errLines.filter((line) => !line.startsWith("->")).join(" ") ||
      lines(run.stdout).pop() ||
      `flisk-import exited with code ${run.exitCode}`);
  const fallback =
    run.exitCode === 127
      ? "Install Node.js 22.12 or later, which provides npx, then run the command again"
      : "Run `flisk import --dry-run` to see the plan without writing anything";
  const suggestions = hints.length > 0 ? hints : [fallback];
  return new JsonCommandError("IMPORT_FAILED", message, suggestions, run.exitCode);
}

export interface ImportOptions {
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export function resolveImportOptions(options: ImportOptions = {}, cmd?: Command): ImportOptions {
  const parentOpts = (cmd?.parent?.opts() ?? {}) as ImportOptions;
  const cmdOpts = (cmd?.opts() ?? {}) as ImportOptions;
  return {
    yes: Boolean(options.yes || cmdOpts.yes || parentOpts.yes),
    force: Boolean(options.force || cmdOpts.force || parentOpts.force),
    dryRun: Boolean(options.dryRun || cmdOpts.dryRun || parentOpts.dryRun),
    json: Boolean(options.json || cmdOpts.json || parentOpts.json),
  };
}

export async function executeImport(
  args: string[],
  options: ImportOptions = {},
  commandName = "flisk import",
): Promise<void> {
  if (options.json) {
    await runJsonCommand("IMPORT_FAILED", commandName, async () => {
      // Without a terminal the importer cannot ask, so --json writes without a prompt, like --yes.
      const forwardedArgs = buildForwardedImportArgs(args, { ...options, yes: true });
      const run = await runImportCaptured(forwardedArgs);
      // The importer's own text is for a person; stdout carries only the envelope.
      if (run.stdout.trim()) console.log(run.stdout.trimEnd());
      if (run.stderr.trim()) console.error(run.stderr.trimEnd());
      if (run.exitCode !== 0) throw importFailure(run);
      return { data: importReport(forwardedArgs, run) };
    });
    return;
  }
  const forwardedArgs = buildForwardedImportArgs(args, options);
  process.exitCode = await runImport(forwardedArgs);
}

export const composeCommand = addYesOption(new Command("compose"))
  .description(
    "Import a directory's root docker-compose.yml, same as flisk import (runs flisk-import)",
  )
  .argument("[args...]", "Passed to flisk-import: [dir] --dry-run --yes --force")
  .option("-f, --force", "Overwrite an existing service.json", false)
  .option("--dry-run", "Print the plan and write nothing", false)
  .option(
    "--json",
    "Print one JSON envelope on stdout with the importer's output; implies --yes",
    false,
  )
  .allowUnknownOption()
  .helpOption(false)
  .action(async (args: string[], options: ImportOptions, cmd: Command) => {
    const resolved = resolveImportOptions(options, cmd);
    await executeImport(args, resolved, "flisk import compose");
  });

export const importCommand = addYesOption(new Command("import"))
  .description("Import the services in a directory's root docker-compose.yml (runs flisk-import)")
  .argument("[args...]", "Passed to flisk-import: [dir] --dry-run --yes --force")
  .option("-f, --force", "Overwrite an existing service.json", false)
  .option("--dry-run", "Print the plan and write nothing", false)
  .option(
    "--json",
    "Print one JSON envelope on stdout with the importer's output; implies --yes",
    false,
  )
  .allowUnknownOption()
  .helpOption(false)
  .addCommand(composeCommand)
  .action(async (args: string[], options: ImportOptions, cmd: Command) => {
    const resolved = resolveImportOptions(options, cmd);
    await executeImport(args, resolved, "flisk import");
  });

export interface ImportTiltfileOptions {
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
  cwd?: string;
}

export interface ImportTiltfileReport {
  tiltfile: string;
  projectRoot: string;
  projectJson: string;
  orchestration: {
    source: "tiltfile";
    path: string;
  };
  dryRun: boolean;
  force: boolean;
  action: "created" | "updated";
  written: string[];
}

export async function importTiltfile(
  pathArg?: string,
  options: ImportTiltfileOptions = {},
): Promise<ImportTiltfileReport> {
  const workingDir = options.cwd ?? cwd();
  const targetPath = pathArg ?? "Tiltfile";
  let resolvedTiltfilePath = isAbsolute(targetPath) ? targetPath : resolve(workingDir, targetPath);

  if (existsSync(resolvedTiltfilePath) && statSync(resolvedTiltfilePath).isDirectory()) {
    const candidate = join(resolvedTiltfilePath, "Tiltfile");
    if (existsSync(candidate)) {
      resolvedTiltfilePath = candidate;
    }
  }

  if (!existsSync(resolvedTiltfilePath) || statSync(resolvedTiltfilePath).isDirectory()) {
    throw new JsonCommandError("IMPORT_FAILED", `Tiltfile not found at ${targetPath}`, [
      "Specify a path to an existing Tiltfile",
      "Run `flisk import tiltfile <path>`",
    ]);
  }

  let projectRoot = findProjectRoot(workingDir);
  if (!projectRoot) {
    projectRoot = findProjectRoot(dirname(resolvedTiltfilePath)) ?? workingDir;
  }

  const projectJsonPath = join(projectRoot, ".flisk", PROJECT_JSON);
  const fliskDir = join(projectRoot, ".flisk");
  const exists = existsSync(projectJsonPath);

  let tiltfileRelPath = relative(projectRoot, resolvedTiltfilePath).replace(/\\/g, "/");
  if (!tiltfileRelPath || tiltfileRelPath === ".") {
    tiltfileRelPath = "Tiltfile";
  }
  try {
    // The same check `flisk up` makes before wrapping it, so a Tiltfile it would refuse is refused here instead.
    wrappedTiltfilePath({ source: "tiltfile", path: tiltfileRelPath });
  } catch (error) {
    throw new JsonCommandError("IMPORT_FAILED", (error as Error).message, [
      "Import your own Tiltfile, not the one Flisk generates in .flisk/.flisk-out/",
    ]);
  }

  let projectConfig: ProjectConfig;
  if (exists) {
    try {
      const raw = readFileSync(projectJsonPath, "utf-8");
      projectConfig = JSON.parse(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new JsonCommandError(
        "IMPORT_FAILED",
        `Could not read project.json at ${projectJsonPath}: ${reason}`,
      );
    }

    if (projectConfig.orchestration && !options.force) {
      throw new JsonCommandError(
        "IMPORT_FAILED",
        `Orchestration source is already configured in .flisk/project.json (${projectConfig.orchestration.source}: ${projectConfig.orchestration.path ?? "default"}). Use --force to overwrite.`,
        ["Pass --force to overwrite the existing orchestration configuration"],
      );
    }
  } else {
    projectConfig = createDefaultProjectConfig(projectRoot);
  }

  projectConfig.orchestration = {
    source: "tiltfile",
    path: tiltfileRelPath,
  };

  const written: string[] = [];
  if (!options.dryRun) {
    ensureDirectory(fliskDir);
    writeJsonFile(projectJsonPath, projectConfig);
    written.push(join(".flisk", PROJECT_JSON).replace(/\\/g, "/"));
  }

  return {
    tiltfile: tiltfileRelPath,
    projectRoot,
    projectJson: projectJsonPath,
    orchestration: {
      source: "tiltfile",
      path: tiltfileRelPath,
    },
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    action: exists ? "updated" : "created",
    written,
  };
}

importCommand
  .command("tiltfile [path]")
  .description(
    "Register an existing Tiltfile so flisk up runs it unchanged (writes .flisk/project.json)",
  )
  .helpOption("-h, --help", "display help for command")
  .option("-f, --force", "Overwrite existing orchestration configuration", false)
  .option("--dry-run", "Print the plan and write nothing", false)
  .option("--json", "Print one JSON envelope on stdout", false)
  .action(
    async (
      pathArg: string | undefined,
      options: { force?: boolean; dryRun?: boolean; json?: boolean },
    ) => {
      const force = Boolean(options.force || importCommand.opts().force);
      const dryRun = Boolean(options.dryRun || importCommand.opts().dryRun);
      const json = Boolean(options.json || importCommand.opts().json);

      if (json) {
        await runJsonCommand("IMPORT_FAILED", "flisk import tiltfile", async () => {
          const report = await importTiltfile(pathArg, { force, dryRun, json: true });
          return { data: report };
        });
        return;
      }

      await runCommand(async () => {
        const report = await importTiltfile(pathArg, { force, dryRun, json: false });
        if (dryRun) {
          console.log(
            chalk.yellow(
              `[dry-run] Would register ${report.orchestration.path} as orchestration source in .flisk/project.json`,
            ),
          );
        } else {
          console.log(
            chalk.green(
              `Registered ${report.orchestration.path} as orchestration source in .flisk/project.json; flisk up now runs it unchanged`,
            ),
          );
        }
      });
    },
  );
