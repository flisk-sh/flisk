// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import type { CheckResult } from "../types/index.js";
import { isWsl } from "./platform.js";
import { findOnPath } from "./which.js";

export const DOCKER_WSL_INTEGRATION_CHECK = "Docker WSL integration";

export interface DockerWslIntegrationOptions {
  isWsl?: boolean;
  hasDocker?: boolean;
  /** Returns normally when the Docker daemon answers from this distribution, throws otherwise. */
  pingDaemon?: () => void;
}

const WSL_INTEGRATION_FIX =
  "Docker Desktop → Settings → Resources → WSL Integration → turn it on for Ubuntu → Apply & Restart\n  Verify: docker version\n  Docs: https://docs.docker.com/desktop/wsl/";

function defaultPing(): void {
  execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    stdio: "ignore",
    timeout: 10_000,
  });
}

/** Inside WSL2, checks that Docker Desktop's WSL integration reaches this distribution. Skipped elsewhere. */
export function checkDockerWslIntegration(options: DockerWslIntegrationOptions = {}): CheckResult {
  if (!(options.isWsl ?? isWsl())) {
    return {
      name: DOCKER_WSL_INTEGRATION_CHECK,
      didPass: true,
      isSkipped: true,
      message: "Not running in WSL2 - skipped Docker WSL integration check",
    };
  }
  const hasDocker = options.hasDocker ?? Boolean(findOnPath("docker"));
  if (!hasDocker) {
    return {
      name: DOCKER_WSL_INTEGRATION_CHECK,
      didPass: false,
      message: "The docker command is not available in this WSL2 distribution.",
      fix: WSL_INTEGRATION_FIX,
    };
  }
  try {
    (options.pingDaemon ?? defaultPing)();
  } catch {
    return {
      name: DOCKER_WSL_INTEGRATION_CHECK,
      didPass: false,
      message: "Docker does not answer from this WSL2 distribution.",
      fix: `Start Docker Desktop, then:\n  ${WSL_INTEGRATION_FIX}`,
    };
  }
  return {
    name: DOCKER_WSL_INTEGRATION_CHECK,
    didPass: true,
    message: "Docker Desktop WSL integration works in this distribution",
  };
}
