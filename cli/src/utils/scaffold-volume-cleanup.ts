// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import {
  readProjectName,
  removeProjectVolumes,
  tryListStaleProjectVolumes,
  type VolumeRunner,
} from "./demo-reset.js";
import { findForeignContainerOwners, findOtherRecordedFolders } from "./project-owner.js";
import type { ProjectRecord } from "./project-registry.js";
import { readProjectRecords } from "./project-registry.js";
import { discoverResourcesWithProblems, getAllStacks } from "./services.js";

/** Why a scaffold did not remove any volumes. */
export type StaleVolumeSkipReason =
  | "no-project"
  | "shared-folder"
  | "running-stack"
  | "docker-unreadable"
  | "none";

export interface ScaffoldVolumeCleanupOptions {
  /** Docker calls; injectable so tests need no daemon. */
  docker?: VolumeRunner;
  /** Compose stacks of the scaffold. Discovered from the folder when omitted. */
  stacks?: readonly string[];
  /** Project records to read. Defaults to `~/.flisk/projects`. */
  readRecords?: () => ProjectRecord[];
  /** Folders with running containers that use this project name. Defaults to a Docker `ps` lookup. */
  foreignOwners?: (
    projectName: string,
    stacks: readonly string[],
    projectDir: string,
  ) => readonly string[];
}

export interface ScaffoldVolumeCleanupResult {
  projectName?: string;
  /** The exact volumes the Docker listing saw for this project, or undefined when it failed. */
  candidates: string[] | undefined;
  removed: string[];
  skippedReason: StaleVolumeSkipReason;
  sharedFolders: string[];
  runningFolders: string[];
}

function stacksIn(projectDir: string): string[] {
  try {
    return getAllStacks(discoverResourcesWithProblems(projectDir).resources);
  } catch {
    return [];
  }
}

/**
 * Clears the Docker volumes that a previous checkout of this project left behind before the freshly
 * scaffolded folder writes a new random `DB_PASSWORD` (#3983). Postgres keeps the password of the
 * volume it was first started with, so a new password against the old data makes the migrator fail
 * with Prisma P1000.
 *
 * Volumes carry only their Compose project name, so the cleanup refuses to touch anything when
 * another folder still holds this project name or has running containers under it. That protects a
 * stopped project's data as well as a live stack; a deleted folder is not a sharer, which is the
 * repeated-scaffold path this fixes. Only the exact Compose projects of this checkout are listed,
 * so a similarly named project is never removed.
 */
export function cleanStaleVolumesForScaffold(
  projectDir: string,
  options: ScaffoldVolumeCleanupOptions = {},
): ScaffoldVolumeCleanupResult {
  const projectName = readProjectName(projectDir);
  if (!projectName) {
    return {
      candidates: undefined,
      removed: [],
      skippedReason: "no-project",
      sharedFolders: [],
      runningFolders: [],
    };
  }

  const stacks = options.stacks ? [...options.stacks] : stacksIn(projectDir);
  const readRecords = options.readRecords ?? readProjectRecords;
  const foreignOwners =
    options.foreignOwners ??
    ((name: string, ownedStacks: readonly string[], dir: string) =>
      findForeignContainerOwners(name, ownedStacks, dir).map((owner) => owner.root));

  const sharedFolders = [
    ...new Set(findOtherRecordedFolders(projectName, projectDir, readRecords)),
  ];
  const runningFolders = [...new Set(foreignOwners(projectName, stacks, projectDir))];

  if (sharedFolders.length > 0) {
    return {
      projectName,
      candidates: undefined,
      removed: [],
      skippedReason: "shared-folder",
      sharedFolders,
      runningFolders,
    };
  }
  if (runningFolders.length > 0) {
    return {
      projectName,
      candidates: undefined,
      removed: [],
      skippedReason: "running-stack",
      sharedFolders,
      runningFolders,
    };
  }

  // One listing decides both what is protected and what is removed, so a second listing cannot
  // reach a volume the checks did not see (#3963).
  const candidates = tryListStaleProjectVolumes(projectName, options.docker, stacks);
  if (candidates === undefined) {
    return {
      projectName,
      candidates,
      removed: [],
      skippedReason: "docker-unreadable",
      sharedFolders,
      runningFolders,
    };
  }

  const removed = removeProjectVolumes(candidates, options.docker);
  return {
    projectName,
    candidates,
    removed,
    skippedReason: "none",
    sharedFolders,
    runningFolders,
  };
}
