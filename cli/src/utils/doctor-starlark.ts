// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type { CheckResult } from "../types/index.js";
import { formatCount } from "./formatting.js";
import { findProjectRoot } from "./paths.js";

export function findPrivateStarlarkLoadExports(content: string): string[] {
  const privateExports = new Set<string>();
  const loadCallPattern = /^load\s*\(([\s\S]*?)\)/gm;

  for (const loadMatch of content.matchAll(loadCallPattern)) {
    const args = loadMatch[1] ?? "";
    const quotedValuePattern = /["']([^"']+)["']/g;
    const quotedValues = Array.from(args.matchAll(quotedValuePattern), (match) => match[1]);

    // First quoted arg is the module path. Later quoted args are exported names
    // or alias targets, and Starlark refuses to export names beginning with "_".
    for (const value of quotedValues.slice(1)) {
      if (value.startsWith("_")) {
        privateExports.add(value);
      }
    }
  }

  return Array.from(privateExports).sort();
}

export function resolveStarlarkLoadTarget(
  file: string,
  modulePath: string,
  projectRoot: string,
): string | null {
  if (modulePath === "ext://flisk" || modulePath === "ext://tdk-cli") {
    return join(projectRoot, ".tdk", ".tdk-out", "tdk-cli-ext", "Tiltfile");
  }

  if (modulePath.startsWith(".") || (!modulePath.includes("://") && !modulePath.startsWith("@"))) {
    return normalize(join(dirname(file), modulePath));
  }

  return null;
}

export function findMissingRelativeStarlarkLoads(
  file: string,
  content: string,
  projectRoot: string,
): string[] {
  const missing: string[] = [];
  const loadCallPattern = /^load\s*\(([\s\S]*?)\)/gm;

  for (const loadMatch of content.matchAll(loadCallPattern)) {
    const args = loadMatch[1] ?? "";
    const moduleMatch = args.match(/["']([^"']+)["']/);
    const modulePath = moduleMatch?.[1];

    if (!modulePath) {
      continue;
    }

    const resolved = resolveStarlarkLoadTarget(file, modulePath, projectRoot);
    if (!resolved) {
      continue;
    }

    if (!existsSync(resolved)) {
      missing.push(`${file}: ${modulePath} -> ${resolved}`);
    }
  }

  return missing;
}

export function findRelativeStarlarkLoadTargets(
  file: string,
  content: string,
  projectRoot: string,
): string[] {
  const targets: string[] = [];
  const loadCallPattern = /^load\s*\(([\s\S]*?)\)/gm;

  for (const loadMatch of content.matchAll(loadCallPattern)) {
    const args = loadMatch[1] ?? "";
    const moduleMatch = args.match(/["']([^"']+)["']/);
    const modulePath = moduleMatch?.[1];

    if (modulePath) {
      const target = resolveStarlarkLoadTarget(file, modulePath, projectRoot);
      if (target) {
        targets.push(target);
      }
    }
  }

  return targets;
}

export function collectReachableStarlarkFiles(entryFile: string, projectRoot: string): string[] {
  const visited = new Set<string>();
  const pending = [entryFile];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file) || !existsSync(file)) {
      continue;
    }

    visited.add(file);
    const content = readFileSync(file, "utf-8");
    for (const target of findRelativeStarlarkLoadTargets(file, content, projectRoot)) {
      if (!visited.has(target)) {
        pending.push(target);
      }
    }
  }

  return Array.from(visited).sort();
}

export function checkStarlarkLoadExports(): CheckResult {
  const projectRoot = findProjectRoot() ?? process.cwd();
  const entryFile = join(projectRoot, ".tdk", ".tdk-out", "Tiltfile");

  if (!existsSync(entryFile)) {
    return {
      name: "Starlark Load Exports",
      didPass: true,
      isSkipped: true,
      message: "No generated Tiltfile to check",
    };
  }

  const privateExportProblems: string[] = [];
  const missingLoadProblems: string[] = [];
  const reachableFiles = collectReachableStarlarkFiles(entryFile, projectRoot);

  for (const file of reachableFiles) {
    const content = readFileSync(file, "utf-8");
    const privateExports = findPrivateStarlarkLoadExports(content);
    if (privateExports.length > 0) {
      privateExportProblems.push(`${file}: ${privateExports.join(", ")}`);
    }

    for (const missingLoad of findMissingRelativeStarlarkLoads(file, content, projectRoot)) {
      missingLoadProblems.push(missingLoad);
    }
  }

  if (privateExportProblems.length === 0 && missingLoadProblems.length === 0) {
    const fileCount = formatCount(reachableFiles.length, "reachable Starlark file");
    return {
      name: "Starlark Load Exports",
      didPass: true,
      message: `${fileCount} ${reachableFiles.length === 1 ? "has" : "have"} valid load exports and paths`,
    };
  }

  const sections: string[] = [];
  if (privateExportProblems.length > 0) {
    sections.push(`Private exported symbols:\n    ${privateExportProblems.join("\n    ")}`);
  }
  if (missingLoadProblems.length > 0) {
    sections.push(`Missing relative load targets:\n    ${missingLoadProblems.join("\n    ")}`);
  }

  return {
    name: "Starlark Load Exports",
    didPass: false,
    message: `Starlark load() issues will stop Tilt before services start:\n    ${sections.join("\n\n    ")}`,
    fix: "Regenerate with a current Flisk (`flisk config regenerate`). If the issue remains, rename loaded symbols without leading underscores and update stale load paths.",
  };
}
