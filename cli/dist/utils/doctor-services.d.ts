import type { CheckResult } from "../types/index.js";
import { checkDockerBuildCache } from "./docker-build-cache.js";
import { checkDockerFileSharing } from "./docker-file-sharing.js";
import { type DockerRun } from "./doctor-crashloop.js";
import type { DoctorCheckFn } from "./doctor-runner.js";
import { checkStarlarkLoadExports } from "./doctor-starlark.js";
import { checkPublicEnvSecrets } from "./public-env-secrets.js";
export { checkIngressPorts, checkPrivateNpmRegistry, checkTiltResourceHealth, summarizeServiceProbes, summarizeTiltBuildError, } from "./doctor-runtime.js";
export { checkDockerBuildCache, checkDockerFileSharing, checkPublicEnvSecrets, checkStarlarkLoadExports, };
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
export declare const DEFAULT_PING_TIMEOUT_MS = 5000;
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
/**
 * Requests the URL each routable service advertises, the same one `flisk networks` and the Flisk App show, and warns on a 404.
 * Like the other runtime checks, it only runs once services answer. A stopped stack is skipped, not reported.
 */
export declare function checkAdvertisedEndpoints(timeoutMs: number, ingressPort?: number): Promise<CheckResult>;
