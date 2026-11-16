import type { CheckResult } from "../types/index.js";
import { checkDockerBuildCache } from "./docker-build-cache.js";
import { checkDockerFileSharing } from "./docker-file-sharing.js";
import type { DoctorCheckFn } from "./doctor-runner.js";
import { checkStarlarkLoadExports } from "./doctor-starlark.js";
import { checkBun, checkDockerVersions, checkTilt } from "./doctor-tools.js";
import { type ExecAsync } from "./exec-async.js";
import { type HostCommandCache } from "./host-command-cache.js";
import { checkPublicEnvSecrets } from "./public-env-secrets.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "./doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
export declare function isTimeout(err: unknown): boolean;
export declare function createExecCheck(name: string, command: string, successMessage: string, failureMessage: string, fixInstructions: string, timeoutMs?: number): DoctorCheckFn;
export declare function succeeds(command: string): Promise<boolean>;
/** Which Docker-compatible engine answers `docker` (Docker Desktop, Colima, OrbStack, Kiri, Podman, Docker Engine). */
export declare function checkContainerEngine(): Promise<CheckResult>;
/** The Colima VM behind Docker: a stopped VM or a colima CLI that cannot see it. */
export declare function checkColima(): Promise<CheckResult>;
export declare function checkDockerRuntime(commandCache?: HostCommandCache): Promise<CheckResult>;
export declare const checkDockerCompose: DoctorCheckFn;
export { checkBun, checkDockerVersions, checkTilt };
export declare function checkDockerOperatingSystem(exec?: ExecAsync): Promise<CheckResult>;
export declare namespace checkDockerOperatingSystem {
    var requiresContainerRuntime: boolean;
    var checkName: string;
}
