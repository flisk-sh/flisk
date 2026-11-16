import { Command } from "commander";
import type { CheckResult } from "../types/index.js";
import { checkDockerBuildCache } from "../utils/docker-build-cache.js";
import { checkDockerFileSharing } from "../utils/docker-file-sharing.js";
import { checkColima, checkContainerEngine, checkDockerCompose, checkDockerOperatingSystem, checkDockerRuntime } from "../utils/doctor-container.js";
import { type DockerRun } from "../utils/doctor-crashloop.js";
import { checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkResourceDiscovery, checkTypeScriptTypeDependencies } from "../utils/doctor-project.js";
import { CONTAINER_CHECK_NAMES_MAP, CONTAINER_DEPENDENT_CHECK_NAMES, type DoctorCheckFn, formatDoctorSummary, getDoctorOutcomeMessage, isContainerDependentCheck, orderDoctorResults, requiresContainerRuntime, runChecks } from "../utils/doctor-runner.js";
import { checkStarlarkLoadExports } from "../utils/doctor-starlark.js";
import { checkBun, checkDockerVersions, checkTilt } from "../utils/doctor-tools.js";
import { checkPublicEnvSecrets } from "../utils/public-env-secrets.js";
import { MIN_BUN_VERSION, MIN_TILT_VERSION, versionMeetsMinimum } from "../utils/tool-versions.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "../utils/doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
export declare const DOCTOR_FIXES: {
    readonly dockerMissing: "See https://docs.docker.com/get-docker/";
    readonly dockerDaemonDown: "Start Docker Desktop, OrbStack, Colima, or Kiri, then retry: flisk doctor";
    readonly tiltMissing: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash";
    readonly bunMissing: "curl -fsSL https://bun.sh/install | bash";
    readonly port80: "Stop the process bound to port 80, or stop local nginx/caddy. Then: flisk doctor";
    readonly port5432: "Stop local Postgres or change the host port. Then: flisk doctor";
    readonly notProject: "flisk project --yes";
};
export declare const WSL2_DOCTOR_MESSAGE = "WSL2 detected. Use Docker Desktop WSL integration. Guide: docs/wsl2.md";
export declare const NATIVE_WINDOWS_DOCTOR_MESSAGE = "Native Windows cannot boot a Docker stack; services that declare a command run as local processes. For a Docker stack use WSL2 Ubuntu with Docker Desktop integration. Guide: docs/start-here-on-windows.md (reference: docs/wsl2.md)";
export { MIN_BUN_VERSION, MIN_TILT_VERSION, versionMeetsMinimum };
export declare function checkWslProjectLocation(projectPath: string, strict: boolean, isWsl?: boolean): CheckResult;
/**
 * Dev ports (Traefik, Postgres) bind to 127.0.0.1 by default. FLISK_BIND_ADDRESS
 * opts in to another address; a wildcard exposes them to every machine on the
 * network (GHSA-3hj3-f39v-j2x5).
 */
export declare function checkPublishedBindAddress(env?: NodeJS.ProcessEnv, strict?: boolean): CheckResult;
export { CONTAINER_CHECK_NAMES_MAP, CONTAINER_DEPENDENT_CHECK_NAMES, checkBun, checkColima, checkContainerEngine, checkDockerCompose, checkDockerOperatingSystem, checkDockerRuntime, checkDockerVersions, checkTilt, type DoctorCheckFn, formatDoctorSummary, getDoctorOutcomeMessage, isContainerDependentCheck, orderDoctorResults, requiresContainerRuntime, runChecks, };
/**
 * Checks the project's minimum and exact pinned CLI version.
 * Shared with `flisk up` so both commands report the same message and fix.
 */
export declare function checkFliskVersion(currentVersion?: string): CheckResult;
/** A CLI older than the latest release is a warning, never a failure; an unreachable registry is skipped (#4119). */
export declare function checkLatestFliskVersion(currentVersion?: string, lookup?: () => Promise<string | null>): Promise<CheckResult>;
export { checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkResourceDiscovery, checkTypeScriptTypeDependencies, };
/**
 * Flags containers pinned near their memory limit while also burning CPU --
 * the signature of a boot-time process stuck in a retry/fetch loop, not a
 * genuine crash (which would just exit, not sit at ~100% resource usage).
 *
 * Caught in this workspace: a backend runtime image missing the local Prisma
 * CLI fell back to `bunx prisma`, which re-fetched prisma@latest from npm on
 * every container start. That pinned a 512MB container at ~100% memory and
 * 100%+ CPU indefinitely, and it never became healthy. Neither `docker ps`
 * (just shows "unhealthy") nor the healthcheck's own retry loop surfaces
 * *why* -- only live resource stats catch this pattern before it's mistaken
 * for a slow migration or a flaky healthcheck.
 */
export declare function checkContainerResourceHealthFor(projectName: string, run?: DockerRun): Promise<CheckResult>;
export declare const checkContainerResourceHealth: DoctorCheckFn;
/**
 * Pings every routable service on the same /health URLs `flisk up` advertises.
 *
 * This is a runtime check, not an environment one: before `flisk up` there is
 * nothing to ping, so a stopped stack is reported as skipped and doctor still
 * passes. Once services are up, an unreachable endpoint is a real failure --
 * it catches the case where a container is running but Traefik never routed
 * to it, which `docker ps` alone will not show.
 */
export declare function checkServiceHealth(timeoutMs: number, ingressPort?: number): Promise<CheckResult>;
/**
 * Runs the GET steps of each service's "smoke" block through its public URL. These are the checks `flisk up` already runs, minus the
 * writes, so a service with an empty /health but a missing list route is caught before anyone clicks a dead link.
 *
 * Like the health ping, this only runs once services answer. A stopped stack is skipped, not failed.
 */
export declare function checkServiceSmoke(timeoutMs: number, ingressPort?: number, options?: {
    gateway?: boolean;
}): Promise<CheckResult>;
export declare function renderDoctorOutput(machineResults: CheckResult[], projectResults: CheckResult[], inProject: boolean, options?: {
    all?: boolean;
}, allResults?: CheckResult[]): void;
export declare const doctorCommand: Command;
