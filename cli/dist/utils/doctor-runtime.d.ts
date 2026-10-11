import { execSync } from "node:child_process";
import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { type HealthProbe } from "./service-urls.js";
import type { SmokeResult } from "./smoke.js";
export declare const HOST_PORT_FIXES: {
    readonly port80: "Stop the process bound to port 80, or stop local nginx/caddy. Then: tdk doctor";
    readonly port5432: "Stop local Postgres or change the host port. Then: tdk doctor";
};
/**
 * Quote a value for a POSIX shell command line. JSON.stringify is not enough:
 * inside double quotes `$(...)`, backticks and `$VAR` are still expanded.
 */
export declare function shellQuote(value: string): string;
/** Host ports Traefik publishes for local ingress. Without these, app routes never come up. */
export declare const INGRESS_PORTS: readonly [80, 443];
export declare function toComposeProjectPrefix(projectName: string): string;
export interface PublishedPortHolder {
    name: string;
    ports: string;
    publishedPorts: number[];
}
/**
 * Parse `docker ps --format '{{.Names}}\t{{.Ports}}'` lines into containers that
 * publish specific host ports (e.g. 0.0.0.0:80->80/tcp).
 */
export declare function parsePublishedPortHolders(dockerPsOutput: string, ports: readonly number[]): PublishedPortHolder[];
export declare function isOwnIngressContainer(containerName: string, projectPrefix: string): boolean;
export declare function findForeignIngressHolders(holders: PublishedPortHolder[], projectPrefix: string): PublishedPortHolder[];
export interface TiltResourceFailure {
    name: string;
    updateStatus: string;
    runtimeStatus: string;
    error: string;
}
/**
 * Resource names with `sablier: {enable: true, deferStart: true}` in their
 * manifest (openspec/changes/prioritized-cold-start): these are expected to
 * sit at `runtimeStatus: none` until their first request, not a sign of
 * anything stuck. Best-effort — returns an empty set if discovery fails
 * (e.g. not run from inside a project), so callers degrade to today's
 * behavior rather than erroring.
 */
export declare function getDeferredResourceNames(): Set<string>;
/**
 * Extract failing UIResources from `tilt get uiresources -o json`.
 *
 * `deferredNames` (typically from getDeferredResourceNames()) separates a
 * `sablier.deferStart` resource's expected `none`/`pending` status into its
 * own count so it's never described as "blocked" or otherwise lumped in with
 * genuinely stuck resources.
 */
export declare function parseTiltResourceFailures(jsonText: string, deferredNames?: Set<string>): {
    failures: TiltResourceFailure[];
    pendingCount: number;
    deferredCount: number;
    okCount: number;
    total: number;
};
export declare function summarizeTiltBuildError(error: string): string;
export declare function isRegistryRelatedBuildError(error: string): boolean;
export declare function projectConfigEnablesVerdaccio(projectRoot?: string): boolean;
export declare function projectExpectsVerdaccio(projectRoot?: string): boolean;
/**
 * When the project uses a local Verdaccio registry, fail early with a clear
 * fix instead of only showing truncated ImageBuild exit codes later.
 */
export declare function checkPrivateNpmRegistry(exec?: typeof execSync, projectRoot?: string, registryUrl?: string, verdaccioLicensed?: boolean): CheckResult;
/**
 * Fail when another container already owns Traefik's host ports (80/443).
 * This is the exact failure mode that leaves apps never scheduled while doctor
 * previously reported "Environment ready".
 */
export declare function checkIngressPorts(exec?: typeof execSync, projectName?: string, ports?: readonly number[]): CheckResult;
/** Host ports the generated stack publishes: Traefik (80, 443) and Postgres (5432). */
export declare const HOST_PORTS: Record<number, string>;
type PortState = "free" | "in-use" | "unknown";
/**
 * Probes both the wildcard and loopback address: on macOS, a Homebrew Postgres
 * bound to 127.0.0.1 only is invisible to a wildcard-only bind. Sequential, not
 * concurrent: on Linux, binding 0.0.0.0 and 127.0.0.1 to the same port at the
 * same time makes the second bind fail with EADDRINUSE against *our own first
 * probe*, reporting every free port as taken. Binding 0.0.0.0 first and closing
 * it before trying 127.0.0.1 avoids that self-collision on every platform.
 */
export declare function probeHostPort(port: number): Promise<PortState>;
/**
 * Turns health-URL probes into a doctor result.
 *
 * "Nothing answered" (connection refused or timeout on every probe) means the
 * stack is down or Traefik never bound :80, so the check is skipped. Any HTTP
 * response counts as an answer, including a 404 or 502 from Traefik: that means
 * the ingress is up and the service behind it is not reachable, which is a
 * failure. Treating only 2xx as "responded" reported a running Traefik with no
 * route as "Traefik never bound :80" and skipped the check.
 */
export declare function summarizeServiceProbes(probes: HealthProbe[]): CheckResult;
/**
 * Summarizes the read-only smoke checks. A 404 here usually means the service never registered the route its service.json
 * names, which the health ping cannot see because /health answers regardless.
 */
export declare function summarizeSmokeResults(results: SmokeResult[]): CheckResult;
/**
 * Flags advertised links that answer 404. Only a 404 counts: a route that answers with any other status is reachable, and many APIs
 * have no root route, so this is a warning and never fails the run on its own.
 */
export declare function summarizeAdvertisedProbes(probes: HealthProbe[]): CheckResult;
/**
 * Catches host ports taken by something other than this project's containers,
 * most often a local Postgres on 5432 or a web server on 80. Docker-held 80/443
 * are reported by checkIngressPorts, so only 5432 is checked against other
 * containers here.
 */
export declare function checkHostPorts(exec?: typeof execSync, projectName?: string, probe?: (port: number) => Promise<PortState>): Promise<CheckResult>;
/**
 * When a Tilt session is active, surface resource update errors (Traefik port
 * binds, image builds, etc.) instead of claiming the environment is ready
 * while apps sit forever in pending/none.
 */
export declare function checkTiltResourceHealth(exec?: typeof execSync): CheckResult;
export declare function isInfraTiltFailure(name: string): boolean;
/** Critical infra first, then everything else — never drop failures. */
export declare function orderTiltFailures(failures: TiltResourceFailure[]): TiltResourceFailure[];
/**
 * Best-effort root cause for runtime crashes when buildHistory has no error.
 * Reads recent docker logs for the matching container name.
 */
export declare function probeContainerRuntimeError(resourceName: string, exec?: typeof execSync, projectName?: string): string | null;
export declare function describeTiltFailure(failure: TiltResourceFailure, exec?: typeof execSync): string;
/**
 * The two paths a backend is probed on, resolved like the engine does:
 * the container healthcheck uses `healthCheckPath` (default /health), and
 * Traefik's load balancer uses `traefik.healthCheck`, defaulting to the
 * container's path.
 */
export declare function resolveHealthPaths(config: DiscoveredResource["config"]): {
    container: string;
    traefik: string;
};
export interface MissingHealthRoute {
    name: string;
    healthPath: string;
    /** Which probe hits this path, for the message. */
    usedBy: string;
}
/**
 * Backends whose source never mentions a path they are probed on as a string
 * literal ('/health', "/health" or `/health`). Covers Hono, Express, Elysia,
 * Fastify and hand-rolled `url.pathname === "/health"` checks. Services
 * without a src/ directory are skipped, since there is nothing to read.
 */
export declare function findMissingHealthRoutes(resources: DiscoveredResource[]): MissingHealthRoute[];
/**
 * A backend without its health route never passes the container healthcheck,
 * so Traefik never routes to it and every request gets a 404 - after a slow
 * image build, with nothing in `tdk up` saying why. Catch it before starting.
 */
export declare function checkHealthRoutes(projectRoot?: string): CheckResult;
export {};
