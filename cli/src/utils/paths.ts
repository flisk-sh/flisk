// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cwd } from "node:process";
import packageJson from "../../package.json" with { type: "json" };
import type { JsonObject, PackageInfo } from "../types/index.js";
import { PROJECT_JSON } from "./constants.js";

export function findProjectRoot(startDir: string = cwd()): string | null {
  let currentDir = resolve(startDir);
  const root = resolve("/");

  while (currentDir !== root) {
    if (existsSync(join(currentDir, ".tdk", PROJECT_JSON))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

let packageCache: PackageInfo | null = null;

function getPackageInfo(): PackageInfo {
  if (packageCache) {
    return packageCache;
  }

  // Imported JSON is bundled by Bun compile, unlike a runtime fs lookup from $bunfs.
  const parsed: unknown = packageJson;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid package.json: expected object");
  }

  const packageInfo = parsed as JsonObject;

  packageCache = {
    name: String(packageInfo.name ?? "flisk"),
    version: String(packageInfo.version ?? "0.0.0"),
    fullPackage: packageInfo,
  };

  return packageCache;
}

export function getPackageVersion(): string {
  return getPackageInfo().version;
}
