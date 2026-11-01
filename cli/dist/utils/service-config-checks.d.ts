import type { CheckResult, DiscoveredResource } from "../types/index.js";
/** A dependsOn that is not a list of service names cannot be followed, so say so instead of failing later. */
export declare function checkDependsOnShape(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/** Services that wait on each other can never both start. A dependsOn name that is not a service is left to the unknown-name check. */
export declare function checkCircularDependencies(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * Everything `flisk config verify` reports about one service.json's own fields (Docker-safe names, field types, line breaks,
 * route paths), applied before `flisk up` starts anything. Without it a bad value passed `flisk up` and stopped inside Tilt
 * ("repository name must be lowercase", "string has no .get field or method"). A missing schemaVersion or required field is
 * left out: old projects keep working without them, and `flisk config migrate` adds the version.
 */
export declare function checkServiceFields(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * A custom `dockerfile` (relative to the service, or to its `buildContext`) that does not exist stops the Tiltfile with
 * "CUSTOM DOCKERFILE NOT FOUND" (discovery/manifest/loading.star), after `flisk up` has said yes.
 */
export declare function checkCustomDockerfiles(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * A `sidecarOf` (#2908) becomes `network_mode: "service:<host>"` in the stack's Compose file, so the host must be a resource in
 * the same stack. Otherwise Compose stops with "service ... depends on undefined service", after `flisk up` has said yes.
 */
export declare function checkSidecars(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * A bind mount in `volumes` (#1748) is relative to its service directory, and one that climbs out of the project would hand a
 * container files Flisk was never asked to share. The generator refuses it too, after `flisk up` has said yes.
 */
export declare function checkVolumes(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/** The non-loopback host address (`0.0.0.0:80/tcp`) a running container publishes this host port on, or null. */
export declare function liveNetworkAddress(dockerPs: string, hostPort: number, containerPort: number, protocol: string): string | null;
/**
 * An `extraPorts` entry with `"bind": "0.0.0.0"` (#2935), or a `publish` that resolves to one (a bare port, 0.0.0.0 or any
 * non-loopback address), is reachable from every device on the network, unlike everything else Flisk publishes. Say so in
 * `flisk doctor`, as a warning, so it stays a visible choice. A `publish` variable is read from the shell and the project `.env`
 * the way Compose reads it; a value that is not a port or address:port is named, because Compose would refuse it.
 */
export declare function checkNetworkPorts(projectRoot?: string, resources?: DiscoveredResource[], dockerPorts?: () => string): CheckResult;
/**
 * A bring-your-own `container.gpus` reserves NVIDIA devices in the generated Compose file. `config verify` accepts it anywhere, so
 * on a host whose Docker has no NVIDIA runtime (a laptop, Docker Desktop on a Mac) the failure comes from Docker when the container
 * is created, after the build. Warn up front instead. A Docker that cannot be asked is not a finding (the Docker checks report it),
 * and a host using CDI may not list the runtime, so this is a warning, never a gate.
 */
export declare function checkGpuRuntime(projectRoot?: string, resources?: DiscoveredResource[], runtimes?: () => string[] | null): CheckResult;
/** A port outside 1-65535 can never be bound, and `flisk up` would otherwise find out only when Docker fails. */
export declare function checkServicePorts(projectRoot?: string, resources?: DiscoveredResource[]): CheckResult;
/**
 * A service.json with no schemaVersion is how every project began, so this is a warning: it keeps working, and only
 * `flisk config migrate` writes the field. A version this flisk does not know is reported the same way, with a different fix.
 */
export declare function checkSchemaVersions(projectRoot?: string, strict?: boolean, resources?: DiscoveredResource[]): CheckResult;
/** Prints the schemaVersion warning once. It never stops anything: the project keeps working as it is. */
export declare function warnSchemaVersions(projectRoot: string, resources?: DiscoveredResource[]): void;
/**
 * `secrets.required` names that neither the env file of the run nor the environment holds a value for. Compose refuses to
 * interpolate such a name, and that fails the whole Tiltfile, so every service stops, not only the one that needs the secret.
 * Not checked with FLISK_SECRET_PROVIDER=infisical, which leaves the names to Infisical.
 */
export declare function checkRequiredSecrets(projectRoot?: string, resources?: DiscoveredResource[], env?: NodeJS.ProcessEnv): CheckResult;
/** Prints each secret that a literal in `params` or `env` overrides. A warning: such a project still starts. */
export declare function warnSecretConflicts(projectRoot: string, resources?: DiscoveredResource[]): void;
/**
 * Runs before anything starts (also under --dry-run, like the drift gate): duplicate service names, circular
 * dependsOn and invalid ports exit with 1 and say which file, which field, and how to fix it.
 */
export declare function enforceServiceConfigGate(projectRoot: string, options?: {
    onInvalid?: (message: string) => void;
    resources?: DiscoveredResource[];
}, exit?: (code: number) => never): void;
