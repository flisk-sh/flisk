// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const FLISK_BIN = process.env.FLISK_BIN ?? join(REPO_ROOT, "cli/bin/flisk.js");

/** Run this repository's CLI with the runtime running the bench. */
export function flisk(cwd: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [FLISK_BIN, ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
}

/** A directory with a `flisk` command that runs this repository's CLI, to put first on a player's PATH. */
export function fliskShim(root: string): string {
  const dir = join(root, "bin");
  mkdirSync(dir, { recursive: true });
  const shim = join(dir, "flisk");
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${FLISK_BIN}" "$@"\n`);
  chmodSync(shim, 0o755);
  return dir;
}
