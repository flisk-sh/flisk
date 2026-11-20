// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON, PROJECT_LOCAL_JSON, PROJECT_NAME_ENV } from "./constants.js";
import { findProjectRoot } from "./paths.js";

export const DEFAULT_PROJECT_NAME = "flisk-project";

/**
 * Authoritative reader for `.flisk/project.json`.
 * Returns the parsed JSON object, or undefined if missing, unreadable, or malformed.
 */
export function readProjectJson(
  projectRoot: string | null = findProjectRoot(),
): Record<string, unknown> | undefined {
  if (!projectRoot) return undefined;
  try {
    const filePath = join(projectRoot, ".flisk", PROJECT_JSON);
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Lower-cases a name the way Docker Compose names projects, and ignores blank or non-string values. */
function normalizedName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function readNameFrom(root: string | null, fileName: string): string | undefined {
  if (!root) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(join(root, ".flisk", fileName), "utf-8")) as Record<
      string,
      unknown
    >;
    return normalizedName((parsed?.project as Record<string, unknown> | undefined)?.name);
  } catch {
    return undefined;
  }
}

/**
 * Reads the project name for one checkout, lower-cased as Docker Compose names it (#1519).
 *
 * The first source wins: `FLISK_PROJECT_NAME` for this process, the gitignored `.flisk/project.local.json`, then the
 * tracked `.flisk/project.json`. The first two are uncommitted, so a second git worktree can run `flisk up` without
 * editing the shared config (#4046). Pass an empty `env` when inspecting another checkout: a shell override belongs to
 * the current process, not to every folder on this machine.
 */
export function readProjectNameOrUndefined(
  projectRoot: string | null = findProjectRoot(),
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    normalizedName(env[PROJECT_NAME_ENV]) ??
    readNameFrom(projectRoot, PROJECT_LOCAL_JSON) ??
    readNameFrom(projectRoot, PROJECT_JSON)
  );
}

/**
 * Reads `project.name` with a fallback (default: "flisk-project"), honouring the checkout override.
 */
export function readProjectNameWithFallback(
  projectRoot: string | null = findProjectRoot(),
  fallback: string = DEFAULT_PROJECT_NAME,
): string {
  return readProjectNameOrUndefined(projectRoot) ?? fallback;
}
