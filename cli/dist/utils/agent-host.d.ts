export type HostKind = "webcontainer" | "codespaces" | "devcontainer" | "wsl2" | "native-windows" | "local";
export interface HostProbeInputs {
    env: NodeJS.ProcessEnv;
    versions: NodeJS.ProcessVersions;
    platform: NodeJS.Platform;
    fileExists: (path: string) => boolean;
}
export interface HostInfo {
    kind: HostKind;
    /** False when `flisk up` cannot work on this host regardless of Docker state. */
    canUp: boolean;
}
export declare const WEBCONTAINER_DOCS = "docs/agent-hosts.md";
export declare const WEBCONTAINER_UP_MESSAGE = "WebContainers cannot run Flisk: there is no Docker daemon or Tilt. Run `flisk up` on a machine with Docker. See docs/agent-hosts.md.";
export declare const DEVCONTAINER_DOCKER_FIX = "Docker is not reachable from this Dev Container. Mount the host Docker socket (-v /var/run/docker.sock:/var/run/docker.sock) or add the docker-outside-of-docker feature to devcontainer.json, then retry. Docker-in-docker is not supported. See docs/agent-hosts.md.";
/** Classify where the CLI is running. Informational: Docker reachability is still decided by the runtime checks. */
export declare function detectHost(inputs?: HostProbeInputs): HostInfo;
export declare function isContainerHost(kind: HostKind): boolean;
