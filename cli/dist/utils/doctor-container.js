// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { checkColima as checkColimaState } from "./colima.js";
import { CONTAINER_RUNTIME_CHECK } from "./constants.js";
import { detectEngine, parseDockerInfo } from "./container-engine.js";
import { checkDockerBuildCache } from "./docker-build-cache.js";
import { checkDockerFileSharing } from "./docker-file-sharing.js";
import { dockerDesktopStuck } from "./doctor-host.js";
import { checkStarlarkLoadExports } from "./doctor-starlark.js";
import { COMPOSE_TIMEOUT_MS, checkBun, checkDockerVersions, checkTilt, DOCKER_COMPOSE_VERSION_COMMAND, EXEC_TIMEOUT_MS, } from "./doctor-tools.js";
import { execAsync, isExecTimeout } from "./exec-async.js";
import { hasSharedDockerPsOutput } from "./host-command-cache.js";
import { checkPublicEnvSecrets } from "./public-env-secrets.js";
import { findOnPath } from "./which.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "./doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
export function isTimeout(err) {
    return isExecTimeout(err);
}
export function createExecCheck(name, command, successMessage, failureMessage, fixInstructions, timeoutMs = EXEC_TIMEOUT_MS) {
    return async (exec = execAsync) => {
        try {
            await exec(command, timeoutMs);
            return {
                name,
                didPass: true,
                message: successMessage,
            };
        }
        catch (err) {
            // A timeout means the command exists but did not answer in time, which is not the same as missing.
            if (isTimeout(err)) {
                return {
                    name,
                    didPass: false,
                    message: `${name} did not respond within ${timeoutMs / 1000}s`,
                    fix: fixInstructions,
                };
            }
            return {
                name,
                didPass: false,
                message: failureMessage,
                fix: fixInstructions,
            };
        }
    };
}
export async function succeeds(command) {
    try {
        await execAsync(command, EXEC_TIMEOUT_MS);
        return true;
    }
    catch {
        return false;
    }
}
/** Which Docker-compatible engine answers `docker` (Docker Desktop, Colima, OrbStack, Kiri, Podman, Docker Engine). */
export async function checkContainerEngine() {
    let raw = "";
    try {
        raw = String(await execAsync("docker info --format '{{json .}}'", EXEC_TIMEOUT_MS));
    }
    catch {
        return { name: "Container Engine", didPass: true, message: "No Docker daemon answered" };
    }
    const engine = detectEngine(parseDockerInfo(raw));
    if (engine.id === "kiri") {
        return {
            name: "Container Engine",
            didPass: true,
            message: `${engine.label}. Flisk builds with the classic builder here (DOCKER_BUILDKIT=0), one golden image at a time. Experimental: see docs/troubleshooting.md#kiri`,
        };
    }
    return { name: "Container Engine", didPass: true, message: engine.label };
}
/** The Colima VM behind Docker: a stopped VM or a colima CLI that cannot see it. */
export async function checkColima() {
    const status = checkColimaState();
    if (!status.isColima) {
        return { name: "Colima", didPass: true, message: "Docker does not run on Colima" };
    }
    if (status.running && !status.problem) {
        return {
            name: "Colima",
            didPass: true,
            message: `Colima VM is running${status.arch ? ` (${status.arch})` : ""}`,
        };
    }
    return {
        name: "Colima",
        didPass: false,
        message: status.problem ?? "The Colima VM is not running",
        fix: status.fix ??
            "Start Colima: colima start\n  Verify: colima status\n  Docs: https://github.com/abiosoft/colima",
    };
}
export async function checkDockerRuntime(commandCache) {
    // The port plan already listed containers with `docker ps`; a success there means the daemon is up.
    const daemonAlreadyListed = hasSharedDockerPsOutput(commandCache);
    if (process.platform === "win32") {
        try {
            if (!daemonAlreadyListed)
                await execAsync("docker ps", EXEC_TIMEOUT_MS);
            return {
                name: CONTAINER_RUNTIME_CHECK,
                didPass: true,
                message: "Docker Desktop Linux container engine is running",
            };
        }
        catch {
            return {
                name: CONTAINER_RUNTIME_CHECK,
                didPass: false,
                message: "Docker is not running",
                fix: "Start Docker Desktop, enable WSL2 integration, then retry: flisk doctor\n  Verify: docker ps\n  Docs: https://docs.docker.com/desktop/wsl/",
            };
        }
    }
    const hasDockerCli = Boolean(findOnPath("docker"));
    try {
        if (!daemonAlreadyListed)
            await execAsync("docker ps", EXEC_TIMEOUT_MS);
        return {
            name: CONTAINER_RUNTIME_CHECK,
            didPass: true,
            message: "Docker daemon is running",
        };
    }
    catch (err) {
        if (isTimeout(err)) {
            return {
                name: CONTAINER_RUNTIME_CHECK,
                didPass: false,
                message: "Docker daemon is not responding (timeout)",
                fix: "Restart Docker daemon: systemctl restart docker (Linux) or restart Docker Desktop/Colima/Kiri\n  Verify: docker ps\n  Docs: https://docs.docker.com/config/daemon/",
            };
        }
    }
    // Docker Desktop open but its engine down or stuck: say so instead of "not running".
    const stuck = dockerDesktopStuck(await succeeds("pgrep -f com.docker.backend"));
    if (stuck)
        return stuck;
    // Docker not running: check for Colima, then Podman
    if (await succeeds("colima status")) {
        return {
            name: CONTAINER_RUNTIME_CHECK,
            didPass: true,
            message: "Colima (Docker runtime) is running",
        };
    }
    if (findOnPath("colima")) {
        return {
            name: CONTAINER_RUNTIME_CHECK,
            didPass: false,
            message: "Colima is installed but not running",
            fix: "Start Colima: colima start\n  Verify: colima status\n  Docs: https://github.com/abiosoft/colima",
        };
    }
    if (await succeeds("podman ps")) {
        return {
            name: CONTAINER_RUNTIME_CHECK,
            didPass: true,
            message: "Podman is running",
        };
    }
    if (hasDockerCli) {
        return {
            name: CONTAINER_RUNTIME_CHECK,
            didPass: false,
            message: "Docker daemon is not running",
            fix: "Start Docker daemon: systemctl start docker (Linux) or start Docker Desktop\n  Verify: docker ps\n  Docs: https://docs.docker.com/engine/daemon/",
        };
    }
    return {
        name: CONTAINER_RUNTIME_CHECK,
        didPass: false,
        message: "Docker is not installed",
        fix: "Install Docker: https://docs.docker.com/get-docker/\n  Verify: docker --version\n  After install, start Docker and retry: flisk doctor",
    };
}
export const checkDockerCompose = createExecCheck("Docker Compose", DOCKER_COMPOSE_VERSION_COMMAND, "Docker Compose plugin available", "Docker Compose plugin not found", "Install Docker Compose: https://docs.docker.com/compose/install/", COMPOSE_TIMEOUT_MS);
checkDockerCompose.requiresContainerRuntime = true;
checkDockerCompose.checkName = "Docker Compose";
// Host tool version checks live in utils/doctor-tools.ts; re-exported for existing importers.
export { checkBun, checkDockerVersions, checkTilt };
export async function checkDockerOperatingSystem(exec = execAsync) {
    let osType;
    try {
        osType = String(await exec("docker info --format '{{.OSType}}'", EXEC_TIMEOUT_MS))
            .trim()
            .toLowerCase();
    }
    catch {
        return {
            name: "Docker OS",
            didPass: true,
            isSkipped: true,
            message: "Docker OS unavailable - daemon failure reported separately",
        };
    }
    if (osType !== "linux") {
        return {
            name: "Docker OS",
            didPass: false,
            message: `Docker is using the ${osType || "unknown"} engine; Flisk requires Linux containers`,
            fix: "Switch Docker Desktop to Linux containers: Settings > General > Use the WSL 2 based engine\n  Or on Windows: docker context use default (if using WSL2 backend)\n  Verify: docker info --format '{{.OSType}}'\n  Docs: https://docs.docker.com/desktop/wsl/",
        };
    }
    return { name: "Docker OS", didPass: true, message: "Docker is using Linux containers" };
}
checkDockerOperatingSystem.requiresContainerRuntime = true;
checkDockerOperatingSystem.checkName = "Docker OS";
