// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Stop the stack of an existing demo folder before the folder is deleted. Deleting the folder alone leaves its
 * containers running, and a standalone Traefik that stays up keeps port 80 for the next run.
 * Returns true when a Flisk project was found and its `flisk down` ran.
 */
export function stopDemoStack(
  projectDir: string,
  runDown: (dir: string) => void = runFliskDown,
): boolean {
  if (!existsSync(join(projectDir, ".flisk", "project.json"))) return false;
  runDown(projectDir);
  return true;
}

function runFliskDown(projectDir: string): void {
  execFileSync(process.execPath, [process.argv[1] ?? "flisk", "down", "--yes"], {
    cwd: projectDir,
    stdio: "inherit",
  });
}
