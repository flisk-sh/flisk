// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";

/**
 * Removes presentation-only paths from a cloned starter, along with the README links that point at
 * them. Templates live in their own repositories and are copied whole (#4285, #4301); this keeps
 * sales decks and demo media out of a user's first commit without pinning every template to a new
 * release. Paths are relative to the template root and may name a file or a directory.
 *
 * Returns the paths that were actually removed, so callers can log or test what happened.
 */
export function stripTemplateExtras(root: string, omitted: readonly string[]): string[] {
  const targets = new Set(omitted.map(normalizeTarget).filter(Boolean));
  const removed: string[] = [];
  for (const target of targets) {
    const parts = target.split("/");
    if (parts.includes("..") || posix.isAbsolute(target)) continue;
    const full = join(root, ...parts);
    if (!existsSync(full)) continue;
    rmSync(full, { recursive: true, force: true });
    removed.push(target);
  }
  if (removed.length === 0) return removed;

  for (const name of ["README.md", "readme.md"]) {
    const readme = join(root, name);
    if (!existsSync(readme)) continue;
    const before = readFileSync(readme, "utf8");
    const after = dropReferences(before, removed);
    if (after !== before) writeFileSync(readme, after);
  }
  return removed;
}

function normalizeTarget(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "").toLowerCase();
}

/** Drops Markdown images/links, HTML hrefs and tree lines whose target is one of the removed paths. */
function dropReferences(text: string, removed: readonly string[]): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const targets = new Set(removed.map(normalizeTarget));
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!referencesTarget(line, targets)) {
      kept.push(line);
      continue;
    }
    // A bullet that wraps onto a following plain line owns that line too: keep no orphan prose.
    const next = lines[i + 1] ?? "";
    if (/^\s*[-*+]\s/.test(line) && next.trim() && !/^\s*(?:[-*+>#|<[\]]|---)/.test(next)) i++;
  }
  return kept.join(eol);
}

function referencesTarget(line: string, targets: ReadonlySet<string>): boolean {
  const links = [/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, /href\s*=\s*["']([^"']+)["']/gi];
  for (const pattern of links) {
    for (const match of line.matchAll(pattern)) {
      const target = (match[1] ?? "").split(/[?#]/)[0]?.replace(/^\.\//, "").toLowerCase() ?? "";
      if (targets.has(target)) return true;
    }
  }
  const tree = /^[│\s]*[├└]──\s+(\S+)/.exec(line);
  return tree ? targets.has((tree[1] ?? "").toLowerCase()) : false;
}
