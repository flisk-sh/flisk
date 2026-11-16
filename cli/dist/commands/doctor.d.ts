import { Command } from "commander";
import type { CheckResult } from "../types/index.js";
import { checkDockerBuildCache } from "../utils/docker-build-cache.js";
import { checkDockerFileSharing } from "../utils/docker-file-sharing.js";
import { checkColima, checkContainerEngine, checkDockerCompose, checkDockerOperatingSystem, checkDockerRuntime } from "../utils/doctor-container.js";
import { checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkResourceDiscovery, checkTypeScriptTypeDependencies } from "../utils/doctor-project.js";
import { renderDoctorOutput } from "../utils/doctor-render.js";
import { CONTAINER_CHECK_NAMES_MAP, CONTAINER_DEPENDENT_CHECK_NAMES, type DoctorCheckFn, formatDoctorSummary, getDoctorOutcomeMessage, isContainerDependentCheck, orderDoctorResults, requiresContainerRuntime, runChecks } from "../utils/doctor-runner.js";
import { checkContainerResourceHealth, checkContainerResourceHealthFor, checkServiceHealth, checkServiceSmoke } from "../utils/doctor-services.js";
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
export { checkContainerResourceHealth, checkContainerResourceHealthFor, checkFrontendDockerPreflight, checkGeneratedFiles, checkGeneratedProjectRuntimeAssets, checkResourceDiscovery, checkServiceHealth, checkServiceSmoke, checkTypeScriptTypeDependencies, renderDoctorOutput, };
export declare const doctorCommand: Command;
