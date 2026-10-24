// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { join } from "node:path";

// Directories that make up the Flisk Tilt extension, next to the root Tiltfile.
export const EXTENSION_DIRS = ["engine", "discovery", "specs", "ext"] as const;

// Optional wrapper folder for a future layout that nests the extension directories.
const NESTED_RUNTIME_DIR = "runtime";

// Resolve one extension directory, preferring the nested layout and falling back to the
// current flat one, so callers keep working whichever layout a checkout or bundle uses.
export function resolveExtensionDir(sourceRoot: string, name: string): string {
  const nested = join(sourceRoot, NESTED_RUNTIME_DIR, name);
  return existsSync(nested) ? nested : join(sourceRoot, name);
}

export function hasExtensionLayout(sourceRoot: string): boolean {
  return (
    existsSync(join(sourceRoot, "Tiltfile")) &&
    existsSync(resolveExtensionDir(sourceRoot, "engine"))
  );
}
