// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../types/index.js";
import { type DockerRunner, defaultDockerRunner } from "./docker-build-cache.js";
import { findProjectRoot } from "./paths.js";
import { findOnPath } from "./which.js";

export const DOCKER_FILE_SHARING_CHECK = "Docker File Sharing";

export interface DockerFileSharingOptions {
  projectRoot?: string;
  runner?: DockerRunner;
  hasDocker?: boolean;
  image?: string;
}

export function formatDockerFileSharingFix(projectFolder: string): string {
  return [
    `Share ${projectFolder} with Docker so bind mounts reach the host:`,
    `  • Docker Desktop: Settings → Resources → File sharing (add ${projectFolder} or its parent)`,
    `  • Colima: start with --mount (e.g. colima start --mount ${projectFolder})`,
    "  • Remote engine: run Flisk directly on that host",
  ].join("\n");
}

/**
 * Verifies that Docker can see files in the project folder through a bind mount.
 * When the folder is not shared (Docker Desktop file sharing disabled, Colima without --mount,
 * or remote Docker engine), a container writing into a bind mount silently writes inside
 * the VM while the host folder remains empty.
 */
export async function checkDockerFileSharing(
  options: DockerFileSharingOptions = {},
): Promise<CheckResult> {
  const hasDocker = options.hasDocker ?? Boolean(findOnPath("docker"));
  if (!hasDocker) {
    return {
      name: DOCKER_FILE_SHARING_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Docker CLI not found - skipped file sharing check",
    };
  }

  const projectFolder = options.projectRoot ?? findProjectRoot() ?? process.cwd();
  const runner = options.runner ?? defaultDockerRunner;
  const image = options.image ?? "alpine";

  const probeName = `.flisk-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const probeHostPath = join(projectFolder, probeName);

  try {
    try {
      await runner([
        "run",
        "--rm",
        "-v",
        `${projectFolder}:/flisk-probe`,
        image,
        "sh",
        "-c",
        `echo 1 > /flisk-probe/${probeName}`,
      ]);
    } catch {
      // If docker run fails (e.g. Docker explicitly denies the mount), check if the file was created
      if (!existsSync(probeHostPath)) {
        return {
          name: DOCKER_FILE_SHARING_CHECK,
          didPass: false,
          message: `Docker cannot access the project folder: ${projectFolder}`,
          fix: formatDockerFileSharingFix(projectFolder),
        };
      }
    }

    if (!existsSync(probeHostPath)) {
      return {
        name: DOCKER_FILE_SHARING_CHECK,
        didPass: false,
        message: `Docker cannot see the project folder: ${projectFolder} (bind mounts silently stay inside the VM)`,
        fix: formatDockerFileSharingFix(projectFolder),
      };
    }

    return {
      name: DOCKER_FILE_SHARING_CHECK,
      didPass: true,
      message: `Docker can access the project folder (${projectFolder})`,
    };
  } finally {
    if (existsSync(probeHostPath)) {
      try {
        unlinkSync(probeHostPath);
      } catch {
        // Probe file cleanup is best-effort
      }
    }
  }
}
