/** The Docker-compatible engines Flisk can tell apart. Every one of them speaks the Docker Engine API. */
export type EngineId = "kiri" | "colima" | "orbstack" | "docker-desktop" | "podman" | "docker-engine" | "unknown";
export type Engine = {
    id: EngineId;
    /** The name to show a person, such as "Kiri 0.2.1". */
    label: string;
    /** Whether the engine runs Linux containers in a VM that this Mac or PC hosts. */
    vm: boolean;
};
/** The fields of `docker info --format '{{json .}}'` that tell engines apart. */
export type DockerInfo = {
    Name?: string;
    OperatingSystem?: string;
    ServerVersion?: string;
    KernelVersion?: string;
};
/**
 * Which engine answers `docker`, from what the daemon says about itself and the endpoint in use.
 * The daemon's own answer wins over the environment, because a wrapper or `DOCKER_HOST` can point
 * `docker` at a different daemon than the active context names.
 */
export declare function detectEngine(info: DockerInfo, env?: NodeJS.ProcessEnv): Engine;
/** Parses the JSON `docker info` prints; an unreadable answer is an unknown engine. */
export declare function parseDockerInfo(raw: string): DockerInfo;
/** The Docker CLI's active context, read from its config file without starting a process. */
export declare function currentDockerContext(home: string, read: (path: string) => string): string | undefined;
/**
 * Kiri has no BuildKit of its own. `docker build` there starts a BuildKit container that rejects
 * `--network host` and cannot see local images, which breaks every golden-image build. Kiri's classic
 * builder (`DOCKER_BUILDKIT=0`) accepts both, so Flisk and every command it starts use it unless the
 * caller already chose.
 */
export declare function kiriBuildEnv(env: NodeJS.ProcessEnv, context: string | undefined): Record<string, string>;
/**
 * The Docker socket path containers mount to reach the daemon. Containers get `/var/run/docker.sock`, which is
 * Kiri's inside its Mac VM but is the host's own Docker on Linux, where Kiri runs without a VM and listens on
 * `/run/kiri/docker.sock`. Without this Traefik watches the wrong daemon and routes nothing. A value the caller
 * set is kept.
 */
export declare function kiriSocketEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, context: string | undefined): Record<string, string>;
