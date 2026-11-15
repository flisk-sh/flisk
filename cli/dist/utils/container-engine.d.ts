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
