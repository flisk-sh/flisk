// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";
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

/**
 * Reads `project.name` from `.flisk/project.json`, lower-cased.
 * Returns the string name, or undefined if missing or malformed.
 *
 * Docker Compose project names (and the container, network and volume names built from them) must be lowercase, so
 * `"name": "Lychee"` is read as `lychee` here, as the engine reads it (PROJECT_NAME in platform/docker/constants.star) (#1519).
 */
export function readProjectNameOrUndefined(
  projectRoot: string | null = findProjectRoot(),
): string | undefined {
  const json = readProjectJson(projectRoot);
  const name = (json?.project as Record<string, unknown> | undefined)?.name;
  return typeof name === "string" && name.trim().length > 0 ? name.toLowerCase() : undefined;
}

/**
 * Reads `project.name` with a fallback (default: "flisk-project").
 */
export function readProjectNameWithFallback(
  projectRoot: string | null = findProjectRoot(),
  fallback: string = DEFAULT_PROJECT_NAME,
): string {
  return readProjectNameOrUndefined(projectRoot) ?? fallback;
}
