// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { hasNearbyServiceJson } from "./native-project.js";
import { findProjectRoot } from "./paths.js";

interface InferredNodeProject {
  kind: "service";
  service: DiscoveredResource;
  command: string;
  script: string;
}

/** Infer a Node project from package.json when no Flisk project exists. Returns null if not applicable. */
export function inferNodeProject(cwd: string): InferredNodeProject | null {
  // Only infer when no project root, no nearby service.json, no Compose file or Tiltfile
  if (findProjectRoot(cwd)) return null;
  if (hasNearbyServiceJson(cwd)) return null;
  if (existsSync(join(cwd, "docker-compose.yml")) || existsSync(join(cwd, "docker-compose.yaml")))
    return null;
  if (existsSync(join(cwd, "Tiltfile"))) return null;

  // Must have package.json with scripts.dev or scripts.start
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;

  let pkg: { name?: string; scripts?: Record<string, string>; workspaces?: unknown };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }

  // Monorepos with workspaces are out of scope
  if (pkg.workspaces) return null;

  const script = pkg.scripts?.dev || pkg.scripts?.start;
  if (!script) return null;

  // Determine package manager from lockfile
  const manager = detectPackageManager(cwd);
  const scriptKey = pkg.scripts?.dev ? "dev" : "start";
  const command = `${manager} run ${scriptKey}`;

  // Service name from package.json name, fallback to folder name
  const serviceName = sanitizeServiceName(pkg.name || basename(cwd));

  const service: DiscoveredResource = {
    name: serviceName,
    path: cwd,
    configPath: join(cwd, "package.json"),
    type: "backend",
    stack: undefined,
    config: {
      appName: serviceName,
      appType: "backend",
      command,
      port: extractPortFromScript(script),
    },
  };

  return { kind: "service", service, command, script: scriptKey };
}

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return "bun";
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  return "npm";
}

function extractPortFromScript(script: string): number | undefined {
  // Look for --port or -p flag with value
  const portMatch = script.match(/(?:--port|-p)\s+(\d+)/);
  if (portMatch) return parseInt(portMatch[1], 10);
  return undefined;
}

function sanitizeServiceName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .toLowerCase()
      .slice(0, 63) || "app"
  );
}

/** The home-based state root for an inferred project. */
export function inferredStateRoot(cwd: string): string {
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 8);
  const folderName = sanitizeServiceName(basename(cwd));
  return join(homedir(), ".flisk", "inferred", `${folderName}-${hash}`);
}
