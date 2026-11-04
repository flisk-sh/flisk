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

/**
 * What Docker prints when it refuses the bind mount before the probe starts. A bare "permission denied" is not here: before
 * the container starts it is usually the daemon socket, which says nothing about file sharing.
 */
const MOUNT_DENIED =
  /mounts? denied|not shared from the host|file sharing|invalid mount|bind source path|error while creating mount/i;

/** `docker run` exits 125 when the daemon fails it, 126/127 when the command cannot run: the probe never started. */
const DOCKER_RUN_PRE_START_CODES = new Set([125, 126, 127]);

/**
 * What the docker CLI or daemon prints when no container was started. The CLI exits 1 (not 125) when it cannot reach the
 * daemon, so the exit code alone would read that as the probe's own write failing.
 */
const DOCKER_PRE_START =
  /cannot connect to the docker daemon|error during connect|error response from daemon|unable to find image|pull access denied|while trying to connect to the docker daemon/i;

/** True when the probe container started and its write into the mount failed (a read-only or denied mount). */
function probeStartedAndFailed(error: unknown, detail: string): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "number" &&
    code !== 0 &&
    !DOCKER_RUN_PRE_START_CODES.has(code) &&
    !DOCKER_PRE_START.test(detail)
  );
}

function probeErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  const { stderr, message } = error as { stderr?: unknown; message?: unknown };
  return [stderr, message].filter((part) => typeof part === "string" && part).join("\n");
}

/** The non-empty lines of a Docker error on one line, so the cause after "Unable to find image" is not lost. */
function summarizeLines(text: string): string {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].join(" / ");
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
    } catch (error) {
      // If docker run fails (e.g. Docker explicitly denies the mount), check if the file was created
      if (!existsSync(probeHostPath)) {
        const detail = probeErrorText(error);
        if (!probeStartedAndFailed(error, detail) && !MOUNT_DENIED.test(detail)) {
          // The probe container never ran (the image could not be pulled, the engine refused it, it timed out), so this
          // says nothing about file sharing. Reporting it as a sharing failure sent WSL2 users to a setting that does not
          // apply to them while their bind mounts worked.
          return {
            name: DOCKER_FILE_SHARING_CHECK,
            didPass: true,
            isSkipped: true,
            message: `Could not run the file sharing probe (${summarizeLines(detail) || "docker run failed"}); file sharing was not tested`,
          };
        }
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
