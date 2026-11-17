import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/agent-host.js
import { existsSync } from "node:fs";
var WEBCONTAINER_DOCS = "docs/agent-hosts.md";
var WEBCONTAINER_UP_MESSAGE = `WebContainers cannot run Flisk: there is no Docker daemon or Tilt. Run \`flisk up\` on a machine with Docker. See ${WEBCONTAINER_DOCS}.`;
var DEVCONTAINER_DOCKER_FIX = `Docker is not reachable from this Dev Container. Mount the host Docker socket (-v /var/run/docker.sock:/var/run/docker.sock) or add the docker-outside-of-docker feature to devcontainer.json, then retry. Docker-in-docker is not supported. See ${WEBCONTAINER_DOCS}.`;
function defaultInputs() {
  return {
    env: process.env,
    versions: process.versions,
    platform: process.platform,
    fileExists: existsSync
  };
}
function detectHost(inputs = defaultInputs()) {
  const { env, versions, platform, fileExists } = inputs;
  if (versions.webcontainer) {
    return { kind: "webcontainer", canUp: false };
  }
  if (env.CODESPACES === "true")
    return { kind: "codespaces", canUp: true };
  if (env.REMOTE_CONTAINERS || fileExists("/.dockerenv") && env.DEVCONTAINER) {
    return { kind: "devcontainer", canUp: true };
  }
  if (platform === "win32") {
    return { kind: "native-windows", canUp: env.FLISK_ALLOW_NATIVE_WINDOWS === "1" };
  }
  if (platform === "linux" && env.WSL_DISTRO_NAME)
    return { kind: "wsl2", canUp: true };
  return { kind: "local", canUp: true };
}
function isContainerHost(kind) {
  return kind === "devcontainer" || kind === "codespaces";
}

export {
  WEBCONTAINER_DOCS,
  WEBCONTAINER_UP_MESSAGE,
  DEVCONTAINER_DOCKER_FIX,
  detectHost,
  isContainerHost
};
