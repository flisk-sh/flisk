// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * The npx arguments of a spawned npx call, from `--yes` on, whatever runs npx on the host: `npx` itself, or
 * `node npx-cli.js` on Windows (#4004). Lets a test assert what reaches npx without depending on the platform.
 */
export function npxArgs(spawnArgs: readonly string[] | undefined): string[] {
  const args = [...(spawnArgs ?? [])];
  const start = args.indexOf("--yes");
  return start === -1 ? args : args.slice(start);
}
