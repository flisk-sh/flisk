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

// The extension entry point sits at runtime/Tiltfile in a source checkout and at the bundle
// root in a packaged or vendored layout.
export function resolveTiltfile(sourceRoot: string): string {
  const nested = join(sourceRoot, NESTED_RUNTIME_DIR, "Tiltfile");
  return existsSync(nested) ? nested : join(sourceRoot, "Tiltfile");
}

export type ExtensionLayoutKind = "nested" | "flat" | "mixed" | "incomplete";

export interface ExtensionLayoutReport {
  ok: boolean;
  kind: ExtensionLayoutKind;
  /** Entries (Tiltfile and the extension directories) the chosen layout is missing. */
  missing: string[];
  /** Entries that exist only in the other layout, so a resolver would combine two layouts. */
  mixed: string[];
}

// Checks that the Tiltfile and every extension directory come from one layout. The resolvers above pick each
// entry on its own, so a stale or half-migrated tree would otherwise combine nested and flat entries.
export function inspectExtensionLayout(sourceRoot: string): ExtensionLayoutReport {
  const entries = ["Tiltfile", ...EXTENSION_DIRS];
  const nested = entries.filter((name) => existsSync(join(sourceRoot, NESTED_RUNTIME_DIR, name)));
  const flat = entries.filter((name) => existsSync(join(sourceRoot, name)));
  if (nested.length === 0 && flat.length === 0) {
    return { ok: false, kind: "incomplete", missing: [...entries], mixed: [] };
  }
  if (nested.length === entries.length) return { ok: true, kind: "nested", missing: [], mixed: [] };
  if (nested.length === 0) {
    const missing = entries.filter((name) => !flat.includes(name));
    return missing.length === 0
      ? { ok: true, kind: "flat", missing, mixed: [] }
      : { ok: false, kind: "incomplete", missing, mixed: [] };
  }
  // Some entries are nested: the tree is meant to be nested, so a flat-only entry is a leftover.
  const missing = entries.filter((name) => !nested.includes(name));
  const mixed = missing.filter((name) => flat.includes(name));
  return { ok: false, kind: mixed.length > 0 ? "mixed" : "incomplete", missing, mixed };
}

// One line naming what is wrong, for warnings and `flisk runtime --check-assets`.
export function describeLayoutProblems(
  sourceRoot: string,
  report = inspectExtensionLayout(sourceRoot),
): string {
  if (report.ok) return `${sourceRoot}: ${report.kind} layout`;
  const parts: string[] = [];
  if (report.kind === "mixed") {
    parts.push(
      `mixes the nested ${NESTED_RUNTIME_DIR}/ layout with flat entries (${report.mixed.join(", ")} only at the root)`,
    );
  }
  const absent = report.missing.filter((name) => !report.mixed.includes(name));
  if (absent.length > 0) parts.push(`is missing ${absent.join(", ")}`);
  return `${sourceRoot} ${parts.join(" and ")}`;
}

export function hasExtensionLayout(sourceRoot: string): boolean {
  return inspectExtensionLayout(sourceRoot).ok;
}
