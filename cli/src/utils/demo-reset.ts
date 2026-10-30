// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

/** Docker calls behind {@link removeStaleProjectVolumes}, injectable so the logic is testable without Docker. */
export interface VolumeRunner {
  /** One entry per volume: its name and the Compose project that created it (empty when it has none). */
  list: () => Array<{ name: string; composeProject: string }>;
  remove: (name: string) => void;
}

const dockerVolumes: VolumeRunner = {
  list: () =>
    execFileSync(
      "docker",
      ["volume", "ls", "--format", '{{.Name}}\t{{.Label "com.docker.compose.project"}}'],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name = "", composeProject = ""] = line.split("\t");
        return { name, composeProject };
      }),
  remove: (name) => {
    execFileSync("docker", ["volume", "rm", name], { stdio: "ignore" });
  },
};

/**
 * Remove the Docker volumes an earlier run of this project left behind. A fresh demo clone generates a new random
 * DB_PASSWORD, but Postgres keeps the password of the data directory it was first started with and ignores
 * POSTGRES_PASSWORD afterwards, so the second `flisk demo` failed at the migrator with Prisma P1000.
 * A volume still mounted by a running container cannot be removed and is skipped. Returns the names removed.
 */
export function removeStaleProjectVolumes(
  projectName: string,
  docker: VolumeRunner = dockerVolumes,
): string[] {
  const removed: string[] = [];
  let volumes: Array<{ name: string; composeProject: string }>;
  try {
    volumes = docker.list();
  } catch {
    return removed;
  }
  for (const volume of volumes) {
    if (!volume.composeProject.startsWith(`${projectName}-`)) continue;
    try {
      docker.remove(volume.name);
      removed.push(volume.name);
    } catch {
      // In use by a container that is still up: leave it, the stack itself reports the problem.
    }
  }
  return removed;
}

/** The `project.name` of a Flisk project folder, or undefined when it has none. */
export function readProjectName(projectDir: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(projectDir, ".flisk", "project.json"), "utf8")) as {
      project?: { name?: unknown };
    };
    return typeof parsed.project?.name === "string" ? parsed.project.name : undefined;
  } catch {
    return undefined;
  }
}
