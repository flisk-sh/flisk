// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const flisk = path.join(repoRoot, "cli", "bin", "flisk.js");
export const EXTENSION_DIRS = ["engine", "discovery", "specs", "ext"] as const;

export const sha256 = (file: string): string =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
    );

/** Relative path to sha256 for every file under `dir`, sorted, so two trees compare with one toEqual. */
export function fingerprint(dir: string): Record<string, string> {
  return Object.fromEntries(
    walk(dir)
      .map((file) => [path.relative(dir, file).split(path.sep).join("/"), sha256(file)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** The extension as a flat bundle tree: Tiltfile and the four directories at the root. */
export function extensionFingerprint(
  root: string,
  layout: "nested" | "flat",
): Record<string, string> {
  const base = layout === "nested" ? path.join(root, "runtime") : root;
  const out: Record<string, string> = { Tiltfile: sha256(path.join(base, "Tiltfile")) };
  for (const dir of EXTENSION_DIRS) {
    for (const [file, hash] of Object.entries(fingerprint(path.join(base, dir)))) {
      out[`${dir}/${file}`] = hash;
    }
  }
  return out;
}

/** Environment for child processes: no TDK_* leftovers from the developer's shell, no deprecation noise. */
export function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FLISK_QUIET_DEPRECATIONS: "1", ...extra };
  for (const key of Object.keys(env)) if (key.startsWith("TDK_")) delete env[key];
  return env;
}

export function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = cleanEnv(),
) {
  return spawnSync(command, args, { cwd, env, encoding: "utf-8", timeout: 120_000 });
}

/**
 * Every relative load("./x.star") or load("../x.star") in the extension tree, resolved. A target that does not exist
 * means the bundle ships a file that cannot load, which only shows up when Tilt reaches it. Paths are relative to
 * `root` and list `Tiltfile` plus the four directories, so a source `runtime/` and a flat bundle compare equal.
 */
export function danglingLoads(root: string): string[] {
  const dangling: string[] = [];
  const loadPattern = /\bload\(\s*["'](\.{1,2}\/[^"']+)["']/g;
  const files = [
    path.join(root, "Tiltfile"),
    ...EXTENSION_DIRS.flatMap((dir) => walk(path.join(root, dir))),
  ];
  for (const file of files) {
    if (!file.endsWith(".star") && path.basename(file) !== "Tiltfile") continue;
    const text = fs.readFileSync(file, "utf-8");
    for (const match of text.matchAll(loadPattern)) {
      const target = path.resolve(path.dirname(file), match[1] as string);
      if (!fs.existsSync(target)) dangling.push(`${path.relative(root, file)} -> ${match[1]}`);
    }
  }
  return dangling.sort();
}

/**
 * Loads that already pointed at nothing before the move (dead modules and stale paths on main). The move must not
 * add to this list; delete an entry when the file is fixed or removed.
 */
export const KNOWN_DANGLING_LOADS = [
  "discovery/manifest/constants.star -> ./manifest/constants.star",
  "engine/paths.star -> ./discovery/resource_registry.star",
  "engine/topologies/platform/docker/layers/infisical/index.star -> ./infisical/index.star",
  "engine/topologies/tilt/generators/infisical/index.star -> ./infisical/index.star",
  "engine/topologies/tilt/generators/infisical/machine_identity.star -> ./infisical/machine_identity.star",
  "engine/topologies/tilt/generators/infisical/organization.star -> ./infisical/organization.star",
  "engine/topologies/tilt/generators/infisical/path_manager.star -> ./infisical/path_manager.star",
  "engine/topologies/tilt/generators/infisical/secrets_generator.star -> ./infisical/secrets_generator.star",
  "engine/where-things-live.star -> ./discovery/resource_registry.star",
];
