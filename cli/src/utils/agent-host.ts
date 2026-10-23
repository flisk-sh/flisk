// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync } from "node:fs";

export type HostKind =
  | "webcontainer"
  | "codespaces"
  | "devcontainer"
  | "wsl2"
  | "native-windows"
  | "local";

export interface HostProbeInputs {
  env: NodeJS.ProcessEnv;
  versions: NodeJS.ProcessVersions;
  platform: NodeJS.Platform;
  fileExists: (path: string) => boolean;
}

export interface HostInfo {
  kind: HostKind;
  /** False when `flisk up` cannot work on this host regardless of Docker state. */
  canUp: boolean;
}

export const WEBCONTAINER_DOCS = "docs/agent-hosts.md";

export const WEBCONTAINER_UP_MESSAGE = `WebContainers cannot run Flisk: there is no Docker daemon or Tilt. Run \`flisk up\` on a machine with Docker. See ${WEBCONTAINER_DOCS}.`;

export const DEVCONTAINER_DOCKER_FIX = `Docker is not reachable from this Dev Container. Mount the host Docker socket (-v /var/run/docker.sock:/var/run/docker.sock) or add the docker-outside-of-docker feature to devcontainer.json, then retry. Docker-in-docker is not supported. See ${WEBCONTAINER_DOCS}.`;

function defaultInputs(): HostProbeInputs {
  return {
    env: process.env,
    versions: process.versions,
    platform: process.platform,
    fileExists: existsSync,
  };
}

/** Classify where the CLI is running. Informational: Docker reachability is still decided by the runtime checks. */
export function detectHost(inputs: HostProbeInputs = defaultInputs()): HostInfo {
  const { env, versions, platform, fileExists } = inputs;
  if ((versions as Record<string, string | undefined>).webcontainer) {
    return { kind: "webcontainer", canUp: false };
  }
  if (env.CODESPACES === "true") return { kind: "codespaces", canUp: true };
  if (env.REMOTE_CONTAINERS || (fileExists("/.dockerenv") && env.DEVCONTAINER)) {
    return { kind: "devcontainer", canUp: true };
  }
  // Mirrors nativeWindowsUpRefusal in commands/up.ts: native Windows is inspect-only unless explicitly overridden.
  if (platform === "win32") {
    return { kind: "native-windows", canUp: env.TDK_ALLOW_NATIVE_WINDOWS === "1" };
  }
  if (platform === "linux" && env.WSL_DISTRO_NAME) return { kind: "wsl2", canUp: true };
  return { kind: "local", canUp: true };
}

export function isContainerHost(kind: HostKind): boolean {
  return kind === "devcontainer" || kind === "codespaces";
}
