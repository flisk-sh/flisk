// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ownedComposeProjects } from "./demo-reset.js";
import { projectNameAt, readProjectRecords } from "./project-registry.js";

/**
 * Docker names a project's containers, volumes and networks from the project name alone, and the name is the folder's
 * name. Two folders with the same name (two clones of one starter, git worktrees, `flisk demo` next to a copy of the
 * restaurant example) therefore share every Docker object: the second `flisk up` replaces the first one's containers,
 * both use one database volume, and `flisk down --purge` in either deletes it (#3961). The checks here find the other
 * folder, so `up` and `down --purge` can stop before they touch what it owns.
 */

/** Runs `docker <args>` and returns stdout. */
export type DockerRun = (args: string[]) => string;

const defaultDocker: DockerRun = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

/** Another folder that holds a project of the same name, and the Docker containers on record for it. */
export interface ForeignOwner {
  root: string;
  containers: string[];
}

function canonical(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function isSameFolder(a: string, b: string): boolean {
  return canonical(a) === canonical(b);
}

/** The nearest folder at or above `directory` that holds `.flisk/project.json`, or undefined. */
function projectRootOf(directory: string): string | undefined {
  let current = resolve(directory);
  for (;;) {
    if (existsSync(join(current, ".flisk", "project.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/**
 * The other folders whose containers carry this project's Compose project names. Compose labels every container with the
 * folder it was started from (`com.docker.compose.project.working_dir`), so this needs no state of its own. A folder that
 * is gone, or that no longer names this project, is not an owner: its containers are leftovers that a new run may replace.
 */
export function findForeignContainerOwners(
  name: string,
  stacks: readonly string[],
  projectRoot: string,
  docker: DockerRun = defaultDocker,
): ForeignOwner[] {
  let output: string;
  try {
    output = docker([
      "ps",
      "-a",
      "--format",
      '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}',
    ]);
  } catch {
    return [];
  }
  const composeProjects = ownedComposeProjects(name, [...stacks]);
  const byRoot = new Map<string, string[]>();
  for (const line of output.split(/\r?\n/)) {
    const [container = "", composeProject = "", workingDir = ""] = line.trim().split("\t");
    if (!container || !workingDir.trim() || !composeProjects.has(composeProject)) continue;
    const root = projectRootOf(workingDir);
    if (!root || isSameFolder(root, projectRoot) || projectNameAt(root) !== name) continue;
    byRoot.set(root, [...(byRoot.get(root) ?? []), container]);
  }
  return [...byRoot].map(([root, containers]) => ({ root, containers }));
}

/**
 * Other existing folders that were started under this project name, from the record in ~/.flisk/projects. The volume of a
 * stopped project has no container to read a folder from and carries no folder label, so the record is what tells that
 * another folder still uses it.
 */
export function findOtherRecordedFolders(
  name: string,
  projectRoot: string,
  readRecords: typeof readProjectRecords = readProjectRecords,
): string[] {
  const record = readRecords().find((candidate) => candidate.name === name);
  if (!record) return [];
  return record.roots.filter(
    (root) => !isSameFolder(root, projectRoot) && projectNameAt(root) === name,
  );
}

export interface OwnerRefusal {
  message: string;
  suggestions: string[];
}

const RENAME_HINT =
  'Give this project its own name: change "project.name" in .flisk/project.json, then run flisk config regenerate.';

/** The refusal `flisk up` shows when another folder's containers carry this project's name; undefined when there are none. */
export function upOwnerRefusal(
  name: string,
  owners: readonly ForeignOwner[],
): OwnerRefusal | undefined {
  if (owners.length === 0) return undefined;
  const folders = owners.map((owner) => owner.root);
  const containers = owners.flatMap((owner) => owner.containers);
  return {
    message: `Project "${name}" already has Docker containers from another folder: ${folders.join(", ")} (${containers.join(", ")}). Starting here would replace them, and both folders would use one database volume.`,
    suggestions: [
      RENAME_HINT,
      ...folders.map((folder) => `Or stop the other one first: cd ${folder} && flisk down`),
    ],
  };
}

/** The refusal `flisk down --purge` shows when another folder uses the objects it would delete; undefined when none does. */
export function purgeOwnerRefusal(
  name: string,
  owners: readonly ForeignOwner[],
  recordedFolders: readonly string[],
): OwnerRefusal | undefined {
  const folders = [...new Set([...owners.map((owner) => owner.root), ...recordedFolders])];
  if (folders.length === 0) return undefined;
  return {
    message: `flisk down --purge would delete the database volume, networks and images of "${name}", which ${folders.join(", ")} also use${folders.length === 1 ? "s" : ""}. Nothing was removed.`,
    suggestions: [
      RENAME_HINT,
      "Or delete the other folder first, or run the purge from the folder whose data should go, once the others have their own names.",
    ],
  };
}
