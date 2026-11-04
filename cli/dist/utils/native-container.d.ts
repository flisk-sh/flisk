import type { DiscoveredResource } from "../types/index.js";
/**
 * Containers in a local-process run (mixed runtime). A project whose app runs as local processes often keeps its database and
 * cache in Docker: Postgres and Redis from a Compose file, the API and the website with `npm run dev`. A service with an `image`
 * and no `command` joins such a run: `flisk up` starts it with `docker run` next to the local processes, in `dependsOn` order,
 * with no Tilt, no Traefik and no generated files. The supervisor treats the `docker run` line like any other command, so logs,
 * readiness, restarts and `flisk down` work the same way.
 *
 * The container is published on 127.0.0.1 at `port` (the port the container listens on), plus each `extraPorts` entry, so the
 * local processes reach it at localhost. A dependent never reaches it by service name: there is no shared Docker network.
 */
/** Label on every container a mixed run starts, so `flisk down` finds them even when the supervisor was killed. */
export declare const NATIVE_CONTAINER_LABEL = "sh.flisk.native-root";
/** True for a service a mixed run starts as a container: a ready-made `image`, no `command`, nothing to build. */
export declare function isNativeContainerService(resource: DiscoveredResource): boolean;
/** The container name for a service: one per project and service, so a second `flisk up` replaces the first. */
export declare function nativeContainerName(projectName: string, service: string): string;
/** Quotes one word for /bin/sh. */
export declare function shellQuote(word: string): string;
/**
 * The `docker run` arguments for one container service, without the program name. `env` keys are passed by name only
 * (`-e KEY`), so their values reach the container from the environment of the `docker` process and never show in `ps`.
 * Returns the errors that stop the run instead of guessing (a bind mount that leaves the project).
 */
export declare function dockerRunArgs(resource: DiscoveredResource, options: {
    projectName: string;
    projectRoot: string;
    envKeys: readonly string[];
}): {
    args: string[];
    errors: string[];
};
/**
 * The shell line the supervisor runs for a container service. A container left by a run that was killed is removed first, and
 * `exec` makes `docker run` the process the supervisor signals: it passes SIGTERM to the container and `--rm` removes it.
 */
export declare function dockerRunLine(args: readonly string[], containerName: string, platform?: NodeJS.Platform): string;
/** True when the Docker daemon answers. */
export declare function isDockerRunning(): boolean;
/** Removes every container a mixed run of this project started. Used by `flisk down` after the supervisor is gone. */
export declare function removeNativeContainers(projectRoot: string): string[];
