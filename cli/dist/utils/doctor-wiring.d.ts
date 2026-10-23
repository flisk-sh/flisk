import { execSync } from "node:child_process";
import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { type ExecAsync } from "./exec-async.js";
/** Enforces the Prisma 7 project contract before `flisk up` can run. */
export declare function checkPrismaConsistency(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
export declare function checkResourcePackageJson(projectRoot?: string): CheckResult;
/**
 * Two resources with one appName share a Compose service name and Traefik router and service names
 * (all built from the name, none from the directory), so one of them is lost or misrouted.
 */
export declare function checkDuplicateResourceNames(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * Two routed resources on one `port`. This is a warning, not a failure: the engine publishes no service
 * port on the host and gives each resource its own container, which Traefik reaches as <container>:<port>,
 * so two containers can listen on 4000 at once. The pair still confuses the checks and URLs that identify
 * a backend by its port, and usually means a copied service.json.
 */
export declare function checkDuplicateResourcePorts(projectRoot?: string): CheckResult;
export declare function checkServiceUrlPorts(projectRoot?: string): CheckResult;
/**
 * Two API backends in one stack used to share the stack-scoped Traefik routers (`/api/<stack>-management`), so the same rule
 * matched both and Traefik chose between them arbitrarily. The engine now counts the routable backends of a stack inside one
 * service directory (the same grouping as here: resources in one directory that name the same stack). When there are two or more,
 * it drops the stack routers for all of them. A backend that sets its own `traefik.host` / `traefik.pathPrefix` keeps a router
 * for just that route; the others are left with `/api/<name>` only. This check warns about the backends that lose the stack path
 * and about two backends that set the same explicit route.
 */
export declare function checkSharedStackRoutes(projectRoot?: string): CheckResult;
export declare function checkFrontendBackendUrls(projectRoot?: string): CheckResult;
/**
 * A backend or worker that applies migrations from its own start-up (a `start` script, a Dockerfile CMD,
 * an entrypoint script or its source) races its siblings and runs again on every restart. Flisk has a
 * `migrator` app type for this: it runs once, before the services that depend on it. This is a warning,
 * not a failure: such services work, and the opt-in Infisical entrypoint is one of them.
 */
export declare function checkMigrationsInApi(projectRoot?: string): CheckResult;
export declare function checkNatsBroker(projectRoot?: string): CheckResult;
/**
 * Shared platform Postgres will-start reporting.
 *
 * Uses the same evaluateSharedPlatformPostgres predicate as `flisk config verify`,
 * which reads project.json **and** the generated Tiltfile/spec.master when present.
 * Resource set is the project discovery set those commands already inspect —
 * not a `flisk up` filter. A resource that depends on Postgres while you bring up
 * a different one still makes this report will-start; the engine start path is
 * selection-bounded and may not start Postgres for that run. Unknown dependsOn
 * names (typos like `postgress`) stay errors. Does NOT report
 * postgres/database-management as missing services and does NOT claim Prisma
 * will start.
 *
 * Preflight loop: edit service.json → `flisk config regenerate` → `flisk doctor`.
 * Doctor is the gate; one real `flisk up` after doctor is green confirms the run.
 */
export declare function checkSharedPlatformPostgres(projectRoot?: string): CheckResult;
interface TiltProcess {
    pid: number;
    root: string;
}
export declare function parseTiltProcesses(psOutput: string): TiltProcess[];
export declare function checkTiltInstances(projectRoot?: string, exec?: typeof execSync): CheckResult;
export declare function checkDockerNetworkCapacity(exec?: ExecAsync): Promise<CheckResult>;
export {};
