import { Command } from "commander";
import type { CheckResult } from "../types/index.js";
import { checkStarlarkLoadExports } from "../utils/doctor-starlark.js";
import { type ExecAsync } from "../utils/exec-async.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "../utils/doctor-runtime.js";
export { checkStarlarkLoadExports };
export declare const DOCTOR_FIXES: {
    readonly dockerMissing: "See https://docs.docker.com/get-docker/";
    readonly dockerDaemonDown: "Start Docker Desktop, OrbStack, or Colima, then retry: flisk doctor";
    readonly tiltMissing: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash";
    readonly bunMissing: "curl -fsSL https://bun.sh/install | bash";
    readonly port80: "Stop the process bound to port 80, or stop local nginx/caddy. Then: flisk doctor";
    readonly port5432: "Stop local Postgres or change the host port. Then: flisk doctor";
    readonly notProject: "flisk project --yes";
};
export declare const WSL2_DOCTOR_MESSAGE = "WSL2 detected. Use Docker Desktop WSL integration. Guide: docs/wsl2.md";
export declare const NATIVE_WINDOWS_DOCTOR_MESSAGE = "Native Windows landscape boot is unsupported. Use WSL2 Ubuntu with Docker Desktop integration. Guide: docs/wsl2.md";
export declare const MIN_TILT_VERSION: readonly [0, 25, 0];
export declare const MIN_BUN_VERSION: readonly [1, 2, 0];
export declare function versionMeetsMinimum(raw: string, minimum: readonly number[]): boolean;
export declare function checkWslProjectLocation(projectPath: string, strict: boolean, isWsl?: boolean): CheckResult;
/**
 * Dev ports (Traefik, Postgres) bind to 127.0.0.1 by default. TDK_BIND_ADDRESS
 * opts in to another address; a wildcard exposes them to every machine on the
 * network (GHSA-3hj3-f39v-j2x5).
 */
export declare function checkPublishedBindAddress(env?: NodeJS.ProcessEnv, strict?: boolean): CheckResult;
/** Failures are shown before passing statuses, with a 5432 conflict first. */
export declare function orderDoctorResults(results: CheckResult[]): CheckResult[];
export declare function getDoctorOutcomeMessage(inProject: boolean, allPassed: boolean): string;
export type DoctorCheckFn = ((exec?: ExecAsync) => CheckResult | Promise<CheckResult>) & {
    requiresContainerRuntime?: boolean;
    checkName?: string;
};
export declare const CONTAINER_CHECK_NAMES_MAP: Record<string, string>;
export declare const CONTAINER_DEPENDENT_CHECK_NAMES: Set<string>;
export declare function isContainerDependentCheck(check: DoctorCheckFn): boolean;
export declare function requiresContainerRuntime(checkName: string, check: () => CheckResult | Promise<CheckResult>): DoctorCheckFn;
export declare function runChecks(checks: DoctorCheckFn[], options?: {
    all?: boolean;
    containerRuntimeFailed?: boolean;
}): Promise<CheckResult[]>;
export declare function formatDoctorSummary(results: CheckResult[]): string;
export declare function checkDockerRuntime(): Promise<CheckResult>;
export declare const checkDockerCompose: DoctorCheckFn;
export declare function checkDockerVersions(exec?: ExecAsync): Promise<CheckResult>;
export declare namespace checkDockerVersions {
    var _a: boolean;
    export { _a as requiresContainerRuntime };
    export var checkName: string;
}
export declare function checkTilt(exec?: ExecAsync): Promise<CheckResult>;
export declare function checkDockerOperatingSystem(exec?: ExecAsync): Promise<CheckResult>;
export declare namespace checkDockerOperatingSystem {
    var _b: boolean;
    export { _b as requiresContainerRuntime };
    export var checkName: string;
}
export declare function checkBun(exec?: ExecAsync): Promise<CheckResult>;
/**
 * A repo can pin the oldest CLI it works with: `"minTdkVersion": "1.3.80"` in
 * .tdk/project.json. An older `flisk` fails here, so a team sees one clear line
 * instead of a half-working `flisk up`.
 */
export declare function checkTdkVersion(currentVersion?: string): CheckResult;
/**
 * Tilt only builds resources under `discovery.paths`, but the CLI finds every service.json,
 * so a resource outside them is listed and given a URL by `flisk up` yet never started.
 */
export declare function checkResourceDiscovery(): CheckResult;
export declare function checkGeneratedProjectRuntimeAssets(): CheckResult;
export declare function checkTypeScriptTypeDependencies(): CheckResult;
export declare function checkFrontendDockerPreflight(): CheckResult;
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
export declare const checkContainerResourceHealth: DoctorCheckFn;
export declare function renderDoctorOutput(machineResults: CheckResult[], projectResults: CheckResult[], inProject: boolean, options?: {
    all?: boolean;
}, allResults?: CheckResult[]): void;
export declare const doctorCommand: Command;
