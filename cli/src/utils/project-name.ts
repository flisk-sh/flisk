// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { win32 } from "node:path";

const FALLBACK_PROJECT_NAME = "my-project";

// Matches the identifier pattern used by the engine schemas: letters, digits,
// dots, underscores and hyphens, starting with a letter or digit.
const VALID_PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/**
 * Derives the default `project.name` from a project root on any host.
 *
 * `node:path.basename` uses the host OS's separator: on POSIX it does not split
 * `C:\Users\me\work\shop`, so the whole path became the Docker project name.
 * Normalizing separators and parsing with the win32 rules accepts both `/` and
 * `\`, strips trailing separators, and recognizes drive and UNC roots on any
 * host.
 */
export function deriveProjectName(projectRoot: string): string {
  const normalized = projectRoot.replace(/\\/g, "/");
  const { root, base } = win32.parse(normalized);
  if (!base || root === normalized) return FALLBACK_PROJECT_NAME;
  if (VALID_PROJECT_NAME.test(base)) return base;

  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || FALLBACK_PROJECT_NAME;
}
