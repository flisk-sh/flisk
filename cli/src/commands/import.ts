// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnOptions, spawn } from "node:child_process";
import { Command } from "commander";
import { addYesOption } from "../utils/command-helpers.js";
import { getPackageVersion } from "../utils/paths.js";

/**
 * The importer lives in its own repo so it can ship without a CLI release, and is run from npm at a
 * pinned version so a push to its main branch cannot change what `tdk import` does. Move the pin
 * when a new importer is published. `TDK_IMPORT_PACKAGE` overrides the package spec.
 */
export const IMPORT_PACKAGE = "@tdk-landscape/tdk-import@0.2.1";

/** Minimum TDK core release supporting buildContext required by tdk import (#634). */
export const MIN_CORE_VERSION = "1.3.104";

/** Recommended core version with automatic Tiltfile bootstrapping for imported stacks (#1018). */
export const RECOMMENDED_CORE_VERSION = "1.3.145";

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
 * Checks whether the running TDK CLI meets the minimum version required to adopt Compose repos.
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
      message: `tdk import: installed TDK core (${currentVersion}) is older than the required ${MIN_CORE_VERSION} (buildContext release). Upgrade with: tdk upgrade`,
    };
  }
  return { ok: true };
}

export function importInvocation(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; shell: boolean } {
  const pkg = env.TDK_IMPORT_PACKAGE || IMPORT_PACKAGE;
  return {
    command: platform === "win32" ? "npx.cmd" : "npx",
    args: ["--yes", pkg, ...args],
    shell: platform === "win32",
  };
}

/** Runs tdk-import with the caller's terminal and resolves to its exit code. */
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
        `tdk import: could not run npx (${err.message}). Install Node.js/npm and retry.`,
      );
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function buildForwardedImportArgs(
  args: string[],
  options: { yes?: boolean; force?: boolean } = {},
): string[] {
  let yes = Boolean(options.yes);
  let force = Boolean(options.force);

  const filtered: string[] = [];
  for (const arg of args) {
    if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else {
      filtered.push(arg);
    }
  }

  if (yes) {
    filtered.push("--yes");
  }
  if (force) {
    filtered.push("--force");
  }
  return filtered;
}

export const importCommand = addYesOption(new Command("import"))
  .description("Import the services in a directory's root docker-compose.yml (runs tdk-import)")
  .argument("[args...]", "Passed to tdk-import: [dir] --dry-run --yes --force")
  .option("-f, --force", "Overwrite an existing service.json", false)
  .allowUnknownOption()
  .helpOption(false)
  .action(async (args: string[], options: { yes?: boolean; force?: boolean }) => {
    const forwardedArgs = buildForwardedImportArgs(args, options);
    process.exitCode = await runImport(forwardedArgs);
  });
