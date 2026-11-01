// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { FliskError } from "./errors.js";

/** Standard subfolder under `.flisk/` where migrator outputs are stored. */
export const MIGRATOR_OUTPUTS_DIR_NAME = "outputs";

/** Maximum permitted size of a migrator output file in bytes (64 KB). */
export const MAX_MIGRATOR_OUTPUT_BYTES = 64 * 1024;

/** Regular expression for valid migrator resource names. */
const VALID_MIGRATOR_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/** Strict regular expression for environment variable keys produced by migrators. */
const VALID_ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Pattern matching `${migrator:KEY}` or `${migrator:KEY:-fallback}` references. */
export const MIGRATOR_OUTPUT_REF_REGEX =
  /\$\{([a-zA-Z0-9_-]+):([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;

/** Returns the path to the migrator outputs directory under the project's .flisk folder. */
export function migratorOutputsDir(projectRoot: string): string {
  return join(projectRoot, ".flisk", MIGRATOR_OUTPUTS_DIR_NAME);
}

/**
 * Returns the absolute path to a specific migrator's output file (.flisk/outputs/<name>.env).
 * Validates the migrator name against path traversal, symlink escape, and invalid characters.
 */
export function getMigratorOutputPath(projectRoot: string, migratorName: string): string {
  if (!migratorName || !VALID_MIGRATOR_NAME_REGEX.test(migratorName)) {
    throw new FliskError(`Invalid migrator name "${migratorName}" for output path`, [
      "Use alphanumeric characters, dashes, and underscores in service names",
    ]);
  }
  const dir = migratorOutputsDir(projectRoot);
  const target = resolve(dir, `${migratorName}.env`);
  const rel = relative(dir, target);
  if (rel.startsWith("..") || isAbsolute(rel) || rel.includes("/")) {
    throw new FliskError(`Illegal migrator output path traversal: "${migratorName}"`);
  }
  return target;
}

/**
 * Ensures the outputs directory exists with restricted permissions (0o700)
 * and purges any pre-existing output file for this migrator so stale credentials cannot be reused.
 */
export function prepareMigratorOutputFile(projectRoot: string, migratorName: string): string {
  const dir = migratorOutputsDir(projectRoot);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Best effort on platforms that support chmod
    }
  }

  const outputPath = getMigratorOutputPath(projectRoot, migratorName);
  if (existsSync(outputPath)) {
    try {
      unlinkSync(outputPath);
    } catch {
      // Ignore if already deleted
    }
  }
  return outputPath;
}

/** Cleans up migrator output files (all or for a specific migrator). */
export function clearMigratorOutputs(projectRoot: string, migratorName?: string): void {
  const dir = migratorOutputsDir(projectRoot);
  if (!existsSync(dir)) return;
  if (migratorName) {
    try {
      const p = getMigratorOutputPath(projectRoot, migratorName);
      if (existsSync(p)) unlinkSync(p);
    } catch {
      // Best effort
    }
  } else {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}

/**
 * Parses a migrator output file (.flisk/outputs/<name>.env).
 * Strict KEY=value contract:
 * - Rejects symbolic links pointing outside project or unreadable states
 * - Rejects files exceeding 64KB
 * - Rejects malformed lines (missing '=')
 * - Rejects invalid key names
 * - Values are treated as sensitive secrets: never logged or evaluated as shell code
 * - Enforces 0o600 file permissions where supported
 */
export function parseMigratorOutputFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const lstat = lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    throw new FliskError(
      `Migrator output file "${basename(filePath)}" must not be a symbolic link`,
      ["Ensure the migrator writes directly to a regular file"],
    );
  }

  const stat = statSync(filePath);
  if (stat.size > MAX_MIGRATOR_OUTPUT_BYTES) {
    throw new FliskError(
      `Migrator output file exceeds maximum allowed size of ${MAX_MIGRATOR_OUTPUT_BYTES} bytes (${stat.size} bytes)`,
      ["Limit migrator outputs to essential tokens and connection parameters"],
    );
  }

  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best effort on non-POSIX filesystems
  }

  const content = readFileSync(filePath, "utf-8");
  const outputs: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) continue;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIdx = rawLine.indexOf("=");
    if (eqIdx === -1) {
      throw new FliskError(
        `Malformed line ${i + 1} in migrator output "${basename(filePath)}": missing '=' separator`,
        ["Output must follow the KEY=value format, one per line"],
      );
    }

    const key = rawLine.slice(0, eqIdx).trim();
    if (!VALID_ENV_KEY_REGEX.test(key)) {
      throw new FliskError(
        `Invalid key name "${key}" on line ${i + 1} of migrator output "${basename(filePath)}"`,
        ["Environment variable names must match ^[A-Za-z_][A-Za-z0-9_]*$"],
      );
    }

    const value = rawLine.slice(eqIdx + 1);
    outputs[key] = value;
  }

  return outputs;
}

/**
 * Validates that any `${migrator:KEY}` references in a service's env map
 * only refer to migrators declared directly in `dependsOn`.
 * Throws FliskError naming the unauthorized migrator if unauthorized.
 */
export function validateMigratorOutputReferences(
  serviceName: string,
  rawEnv: Record<string, string | undefined> | undefined,
  dependsOn: readonly string[],
): void {
  if (!rawEnv) return;
  const authorized = new Set(dependsOn);

  for (const [envKey, rawVal] of Object.entries(rawEnv)) {
    if (typeof rawVal !== "string") continue;
    const matches = rawVal.matchAll(MIGRATOR_OUTPUT_REF_REGEX);
    for (const match of matches) {
      const migratorName = match[1];
      if (migratorName && !authorized.has(migratorName)) {
        throw new FliskError(
          `Service "${serviceName}" references unauthorized output from "${migratorName}" in ${envKey} (not in dependsOn)`,
          [
            `Add "${migratorName}" to dependsOn in ${serviceName}'s service.json to authorize output consumption`,
          ],
        );
      }
    }
  }
}

/**
 * Resolves `${migrator:KEY}` and `${migrator:KEY:-fallback}` references in an environment map
 * from the outputs produced by completed migrators.
 * Throws FliskError if an authorized migrator did not produce the expected key and no fallback was specified.
 * Does NOT leak any secret values in error messages.
 */
export function resolveMigratorOutputsInEnv(
  serviceName: string,
  rawEnv: Record<string, string | undefined> | undefined,
  dependsOn: readonly string[],
  outputsByMigrator: Readonly<Record<string, Record<string, string>>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawEnv) return result;
  const authorized = new Set(dependsOn);

  for (const [envKey, rawVal] of Object.entries(rawEnv)) {
    if (rawVal === undefined) continue;
    const strVal = String(rawVal);
    result[envKey] = strVal.replace(
      MIGRATOR_OUTPUT_REF_REGEX,
      (_fullMatch, migratorName: string, keyName: string, fallback?: string) => {
        if (!authorized.has(migratorName)) {
          throw new FliskError(
            `Service "${serviceName}" references unauthorized output from "${migratorName}" in ${envKey} (not in dependsOn)`,
            [`Add "${migratorName}" to dependsOn in ${serviceName}'s service.json`],
          );
        }

        const migratorOutputs = outputsByMigrator[migratorName];
        const val = migratorOutputs?.[keyName];
        if (val !== undefined) {
          return val;
        }

        if (fallback !== undefined) {
          return fallback;
        }

        throw new FliskError(
          `Migrator "${migratorName}" did not produce expected output "${keyName}" for service "${serviceName}"`,
          [`Ensure ${migratorName} writes "${keyName}=..." to $FLISK_OUTPUT`],
        );
      },
    );
  }

  return result;
}
