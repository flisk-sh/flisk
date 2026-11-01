// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import chalk from "chalk";
import type { CheckResult, DiscoveredResource } from "../types/index.js";
import { declaredDependsOn, dependencyEdges } from "./dependency-graph.js";
import { checkDuplicateResourceNames } from "./doctor-wiring.js";
import { PROJECT_ENV_FILE_VAR } from "./env-selection.js";
import { parseEnv } from "./env-validator.js";
import { projectEnvLookup } from "./extra-port-publish.js";
import { formatCount } from "./formatting.js";
import { findProjectRoot } from "./paths.js";
import {
  providersOf,
  SERVICE_MANIFEST_SCHEMA_VERSION,
  secretConflictWarnings,
  validateServiceManifest,
  volumesErrors,
} from "./service-manifest.js";
import { discoverResourcesFromRoot } from "./services.js";
import { extraPortsOf, isLoopbackAddress } from "./status-ports.js";

function filePath(projectRoot: string, resource: DiscoveredResource): string {
  return relative(projectRoot, resource.configPath) || resource.configPath;
}

/** Each cycle once, as service names starting from the alphabetically first, ending where it started. */
function findDependencyCycles(resources: DiscoveredResource[]): string[][] {
  const edges = dependencyEdges(resources);
  const cycles = new Map<string, string[]>();
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (name: string): void => {
    state.set(name, "visiting");
    stack.push(name);
    for (const dep of edges.get(name) ?? []) {
      if (state.get(dep) === "visiting") {
        const loop = stack.slice(stack.indexOf(dep));
        const start = loop.indexOf([...loop].sort()[0] ?? dep);
        const ordered = [...loop.slice(start), ...loop.slice(0, start)];
        cycles.set(ordered.join(">"), [...ordered, ordered[0] ?? dep]);
      } else if (!state.has(dep)) {
        visit(dep);
      }
    }
    stack.pop();
    state.set(name, "done");
  };

  for (const name of [...edges.keys()].sort()) {
    if (!state.has(name)) visit(name);
  }
  return [...cycles.values()];
}

/** A dependsOn that is not a list of service names cannot be followed, so say so instead of failing later. */
export function checkDependsOnShape(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const problems = resources.flatMap((resource) =>
    declaredDependsOn(resource.config) === null
      ? [
          `${filePath(projectRoot, resource)} dependsOn ${JSON.stringify(resource.config?.dependsOn)}: expected an array of service names`,
        ]
      : [],
  );
  if (problems.length === 0) {
    return {
      name: "dependsOn",
      didPass: true,
      message: "Every dependsOn is a list of service names",
    };
  }
  return {
    name: "dependsOn",
    didPass: false,
    message: `${formatCount(problems.length, "invalid dependsOn", "invalid dependsOn")}:\n    ${problems.join("\n    ")}`,
    fix: 'Write "dependsOn" as an array of service names, for example ["postgres", "api"]',
  };
}

/** Services that wait on each other can never both start. A dependsOn name that is not a service is left to the unknown-name check. */
export function checkCircularDependencies(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const byName = new Map(resources.map((r) => [r.name, r]));
  const cycles = findDependencyCycles(resources);

  if (cycles.length === 0) {
    return {
      name: "Circular dependencies",
      didPass: true,
      message: "No service depends on itself through dependsOn",
    };
  }
  const lines = cycles.map((cycle) => {
    const first = byName.get(cycle[0] ?? "");
    const next = cycle[1] ?? "";
    return `${first ? filePath(projectRoot, first) : cycle[0]} dependsOn "${next}": circular dependency ${cycle.join(" -> ")}`;
  });
  return {
    name: "Circular dependencies",
    didPass: false,
    message: `${cycles.length} ${cycles.length === 1 ? "circular dependency" : "circular dependencies"}:\n    ${lines.join("\n    ")}`,
    fix: 'Remove one "dependsOn" entry in each cycle so the services no longer wait on each other, or move what they share into a third service',
  };
}

/**
 * Everything `flisk config verify` reports about one service.json's own fields (Docker-safe names, field types, line breaks,
 * route paths), applied before `flisk up` starts anything. Without it a bad value passed `flisk up` and stopped inside Tilt
 * ("repository name must be lowercase", "string has no .get field or method"). A missing schemaVersion or required field is
 * left out: old projects keep working without them, and `flisk config migrate` adds the version.
 */
export function checkServiceFields(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const problems = resources.flatMap((resource) =>
    validateServiceManifest(
      {
        ...(resource.config ?? {}),
        // A service with no appName is named after its directory; that name has to be Docker-safe too. A wrong-typed one is reported.
        appName:
          resource.config && "appName" in resource.config ? resource.config.appName : resource.name,
      },
      filePath(projectRoot, resource),
    ).errors.filter((error) => !/required field is missing|\.schemaVersion:/.test(error)),
  );
  if (problems.length === 0) {
    return { name: "Service fields", didPass: true, message: "Every service.json field is valid" };
  }
  return {
    name: "Service fields",
    didPass: false,
    message: `${formatCount(problems.length, "invalid field")}:\n    ${problems.join("\n    ")}`,
    fix: "Correct the field in service.json; the published schema (flisk.sh/schema.service.json) lists each field's type",
  };
}

/**
 * A custom `dockerfile` (relative to the service, or to its `buildContext`) that does not exist stops the Tiltfile with
 * "CUSTOM DOCKERFILE NOT FOUND" (discovery/manifest/loading.star), after `flisk up` has said yes.
 */
export function checkCustomDockerfiles(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const problems = resources.flatMap((resource) => {
    const config = resource.config as { dockerfile?: unknown; buildContext?: unknown } | undefined;
    const dockerfile = config?.dockerfile;
    if (typeof dockerfile !== "string" || dockerfile === "") return [];
    const context = typeof config?.buildContext === "string" ? config.buildContext : "";
    const path = join(dirname(resource.configPath), context === "." ? "" : context, dockerfile);
    // The loader runs `test -f`, so a directory (for example ".autogenerated") is as missing as a path that does not exist.
    let isFile = false;
    try {
      isFile = statSync(path).isFile();
    } catch {
      isFile = false;
    }
    return isFile
      ? []
      : [`${filePath(projectRoot, resource)} dockerfile: no such file in the service directory`];
  });
  if (problems.length === 0) {
    return { name: "Custom Dockerfiles", didPass: true, message: "Every custom dockerfile exists" };
  }
  return {
    name: "Custom Dockerfiles",
    didPass: false,
    message: `${formatCount(problems.length, "missing dockerfile")}:\n    ${problems.join("\n    ")}`,
    fix: 'Create the file, or remove "dockerfile" from service.json to use the generated Dockerfile',
  };
}

/**
 * A `sidecarOf` (#2908) becomes `network_mode: "service:<host>"` in the stack's Compose file, so the host must be a resource in
 * the same stack. Otherwise Compose stops with "service ... depends on undefined service", after `flisk up` has said yes.
 */
export function checkSidecars(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const stackOf = new Map(resources.map((resource) => [resource.name, resource.config?.stack]));
  const problems = resources.flatMap((resource) => {
    const host: unknown = (resource.config as { sidecarOf?: unknown } | undefined)?.sidecarOf;
    if (typeof host !== "string" || host === "") return [];
    const at = `${filePath(projectRoot, resource)} sidecarOf "${host}"`;
    if (!stackOf.has(host)) return [`${at}: no resource has that name`];
    if (stackOf.get(host) !== resource.config?.stack) {
      return [
        `${at}: is in stack "${String(stackOf.get(host))}", not "${String(resource.config?.stack)}"`,
      ];
    }
    return [];
  });
  if (problems.length === 0) {
    return {
      name: "Sidecars",
      didPass: true,
      message: "Every sidecarOf names a resource in its stack",
    };
  }
  return {
    name: "Sidecars",
    didPass: false,
    message: `${formatCount(problems.length, "invalid sidecarOf", "invalid sidecarOf")}:\n    ${problems.join("\n    ")}`,
    fix: 'Set "sidecarOf" to the appName of a resource in the same stack',
  };
}

/**
 * A bind mount in `volumes` (#1748) is relative to its service directory, and one that climbs out of the project would hand a
 * container files Flisk was never asked to share. The generator refuses it too, after `flisk up` has said yes.
 */
export function checkVolumes(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const problems = resources.flatMap((resource) => {
    if (!resource.config || !("volumes" in resource.config)) return [];
    const dir = relative(projectRoot, dirname(resource.configPath));
    const depth = dir === "" ? 0 : dir.split(sep).length;
    // The shape of each entry is reported with the other service.json fields (checkServiceFields); this check adds the location.
    return volumesErrors(
      resource.config as Record<string, unknown>,
      filePath(projectRoot, resource),
      depth,
    ).filter((problem) => problem.endsWith("must stay inside the project"));
  });
  if (problems.length === 0) {
    return { name: "Volumes", didPass: true, message: "Every bind mount stays inside the project" };
  }
  return {
    name: "Volumes",
    didPass: false,
    message: `${formatCount(problems.length, "bind mount outside the project", "bind mounts outside the project")}:\n    ${problems.join("\n    ")}`,
    fix: 'Mount a path inside the project, such as "./config", or use a named volume such as "data"',
  };
}

/** `docker ps` lines `name|ports`, or "" when Docker cannot be asked. */
function dockerPublishedPorts(): string {
  try {
    return execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/** The non-loopback host address (`0.0.0.0:80/tcp`) a running container publishes this host port on, or null. */
export function liveNetworkAddress(
  dockerPs: string,
  hostPort: number,
  containerPort: number,
  protocol: string,
): string | null {
  const suffix = `:${hostPort}->${containerPort}/${protocol}`;
  for (const line of dockerPs.split("\n")) {
    const ports = line.slice(line.indexOf("|") + 1);
    for (const mapping of ports.split(",")) {
      const text = mapping.trim();
      if (!text.endsWith(suffix)) continue;
      const address = text.slice(0, text.length - suffix.length).replace(/^\[(.*)\]$/, "$1");
      if (address && !isLoopbackAddress(address) && address !== "::1")
        return `${address}${suffix.replace("->", " -> ")}`;
    }
  }
  return null;
}

/**
 * An `extraPorts` entry with `"bind": "0.0.0.0"` (#2935), or a `publish` that resolves to one (a bare port, 0.0.0.0 or any
 * non-loopback address), is reachable from every device on the network, unlike everything else Flisk publishes. Say so in
 * `flisk doctor`, as a warning, so it stays a visible choice. A `publish` variable is read from the shell and the project `.env`
 * the way Compose reads it; a value that is not a port or address:port is named, because Compose would refuse it.
 */
export function checkNetworkPorts(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
  dockerPorts: () => string = dockerPublishedPorts,
): CheckResult {
  const lookup = projectEnvLookup(projectRoot);
  const ports = resources.flatMap((resource) =>
    extraPortsOf(resource, lookup).map((port) => ({ resource, port })),
  );
  const open = ports
    .filter(({ port }) => !port.problem && !isLoopbackAddress(port.bind))
    .map(({ resource, port }) => {
      const via = port.publish
        ? ` (${port.publish.variables.join(", ")}, ${port.publish.source === "environment" ? "set in the environment or .env" : "default in service.json"})`
        : "";
      return `${resource.name} ${port.address}${via}`;
    });
  const bad = ports
    .filter(({ port }) => port.problem)
    .map(({ resource, port }) => `${resource.name} ${port.problem}`);
  // service.json and .env say 127.0.0.1, but a container created before they changed (or by hand) may still be on every interface.
  const declaredLoopback = ports.filter(
    ({ port }) => !port.problem && isLoopbackAddress(port.bind),
  );
  const live = declaredLoopback.length > 0 ? dockerPorts() : "";
  const stale = declaredLoopback
    .map(({ resource, port }) => ({
      resource,
      port,
      address: liveNetworkAddress(live, port.hostPort, port.containerPort, port.protocol),
    }))
    .filter((entry) => entry.address !== null)
    .map(
      ({ resource, port, address }) =>
        `${resource.name} ${port.address} is declared on this machine only, but a running container publishes ${address}`,
    );
  if (open.length === 0 && bad.length === 0 && stale.length === 0) {
    return {
      name: "Network ports",
      didPass: true,
      message: "No port is published beyond this machine",
    };
  }
  const sections = [
    open.length > 0
      ? `${formatCount(open.length, "port")} reachable from the network:\n    ${open.join("\n    ")}`
      : "",
    stale.length > 0
      ? `${formatCount(stale.length, "port")} wider than declared:\n    ${stale.join("\n    ")}`
      : "",
    bad.length > 0 ? `Invalid published address:\n    ${bad.join("\n    ")}` : "",
  ].filter(Boolean);
  return {
    name: "Network ports",
    didPass: false,
    isWarning: true,
    message: sections.join("\n  "),
    fix: [
      open.length > 0
        ? 'Remove "bind": "0.0.0.0" from extraPorts, or start a "publish" default or .env value with 127.0.0.1:, to publish on this machine only'
        : "",
      stale.length > 0
        ? "Recreate the container (flisk restart <resource>) so it picks up the declared bind"
        : "",
      bad.length > 0
        ? 'Set the .env value to a port or an IPv4 address:port such as "127.0.0.1:8080"'
        : "",
    ]
      .filter(Boolean)
      .join(". "),
  };
}

/** The runtimes `docker info` lists, or null when Docker cannot be asked. */
function dockerRuntimes(): string[] | null {
  try {
    const out = execFileSync("docker", ["info", "--format", "{{json .Runtimes}}"], {
      encoding: "utf-8",
      timeout: 8000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Object.keys(JSON.parse(out) ?? {});
  } catch {
    return null;
  }
}

/**
 * A bring-your-own `container.gpus` reserves NVIDIA devices in the generated Compose file. `config verify` accepts it anywhere, so
 * on a host whose Docker has no NVIDIA runtime (a laptop, Docker Desktop on a Mac) the failure comes from Docker when the container
 * is created, after the build. Warn up front instead. A Docker that cannot be asked is not a finding (the Docker checks report it),
 * and a host using CDI may not list the runtime, so this is a warning, never a gate.
 */
export function checkGpuRuntime(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
  runtimes: () => string[] | null = dockerRuntimes,
): CheckResult {
  const wanting = resources
    .filter((resource) => {
      const container = (resource.config as { container?: { gpus?: unknown } } | undefined)
        ?.container;
      return container?.gpus !== undefined;
    })
    .map((resource) => resource.name);
  if (wanting.length === 0) {
    return { name: "GPU runtime", didPass: true, message: "No service asks for a GPU" };
  }
  const found = runtimes();
  if (found === null || found.includes("nvidia")) {
    return {
      name: "GPU runtime",
      didPass: true,
      message:
        found === null
          ? "Docker did not answer; the GPU runtime was not checked"
          : "Docker has the NVIDIA runtime",
    };
  }
  return {
    name: "GPU runtime",
    didPass: false,
    isWarning: true,
    message: `${wanting.join(", ")} ask for a GPU (container.gpus), but Docker lists no nvidia runtime (found: ${found.join(", ") || "none"}); Docker will refuse to create ${wanting.length === 1 ? "it" : "them"}`,
    fix: "Install the NVIDIA Container Toolkit on a GPU host, or remove container.gpus for this machine",
  };
}

/** A port outside 1-65535 can never be bound, and `flisk up` would otherwise find out only when Docker fails. */
export function checkServicePorts(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const problems = resources.flatMap((resource) => {
    const port: unknown = resource.config?.port;
    if (port === undefined) return [];
    if (typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535) return [];
    return [
      `${filePath(projectRoot, resource)} port ${JSON.stringify(port)}: not an integer from 1 to 65535`,
    ];
  });

  if (problems.length === 0) {
    return { name: "Service ports", didPass: true, message: "Every declared port is valid" };
  }
  return {
    name: "Service ports",
    didPass: false,
    message: `${formatCount(problems.length, "invalid port")}:\n    ${problems.join("\n    ")}`,
    fix: 'Set "port" to the port the service listens on, an integer from 1 to 65535',
  };
}

/**
 * A service.json with no schemaVersion is how every project began, so this is a warning: it keeps working, and only
 * `flisk config migrate` writes the field. A version this flisk does not know is reported the same way, with a different fix.
 */
export function checkSchemaVersions(
  projectRoot = findProjectRoot() ?? process.cwd(),
  strict = false,
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
): CheckResult {
  const missing: string[] = [];
  const unsupported: string[] = [];
  for (const resource of resources) {
    const version: unknown = resource.config?.schemaVersion;
    if (version === SERVICE_MANIFEST_SCHEMA_VERSION) continue;
    const file = filePath(projectRoot, resource);
    if (version === undefined) missing.push(`${file} schemaVersion: missing`);
    else
      unsupported.push(
        `${file} schemaVersion ${JSON.stringify(version)}: this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`,
      );
  }

  if (missing.length === 0 && unsupported.length === 0) {
    return {
      name: "schemaVersion",
      didPass: true,
      message: "Every service.json has a supported schemaVersion",
    };
  }
  const fixes = [
    ...(missing.length > 0 ? ["Run `flisk config migrate` to add the missing schemaVersion"] : []),
    ...(unsupported.length > 0
      ? ["A version this flisk does not support cannot be migrated: upgrade flisk"]
      : []),
  ];
  return {
    name: "schemaVersion",
    didPass: false,
    isWarning: !strict,
    message: `${formatCount(missing.length + unsupported.length, "service.json file")} without a supported schemaVersion:\n    ${[...missing, ...unsupported].join("\n    ")}`,
    fix: fixes.join(". "),
  };
}

/** Prints the schemaVersion warning once. It never stops anything: the project keeps working as it is. */
export function warnSchemaVersions(projectRoot: string, resources?: DiscoveredResource[]): void {
  const check = checkSchemaVersions(projectRoot, false, resources);
  if (check.didPass) return;
  console.warn(chalk.yellow(`⚠ ${check.message}`));
  if (check.fix) console.warn(chalk.gray(`  ${check.fix}`));
}

/**
 * `secrets.required` names that neither the env file of the run nor the environment holds a value for. Compose refuses to
 * interpolate such a name, and that fails the whole Tiltfile, so every service stops, not only the one that needs the secret.
 * Not checked with FLISK_SECRET_PROVIDER=infisical, which leaves the names to Infisical.
 */
export function checkRequiredSecrets(
  projectRoot = findProjectRoot() ?? process.cwd(),
  resources: DiscoveredResource[] = discoverResourcesFromRoot(projectRoot),
  env: NodeJS.ProcessEnv = process.env,
): CheckResult {
  const provider = (env.FLISK_SECRET_PROVIDER ?? "").trim().toLowerCase();
  if (provider !== "" && provider !== "env-file") {
    return {
      name: "Required secrets",
      didPass: true,
      message: "Secrets are left to the secret provider",
    };
  }
  const envFile = env[PROJECT_ENV_FILE_VAR] || join(projectRoot, ".env");
  let fileValues = new Map<string, string>();
  try {
    if (existsSync(envFile)) fileValues = parseEnv(readFileSync(envFile, "utf-8"));
  } catch {
    // An unreadable env file is reported where the file is read; here every name counts as missing.
  }
  const has = (name: string): boolean =>
    Boolean((env[name] ?? "").trim() || (fileValues.get(name) ?? "").trim());
  const problems = resources.flatMap((resource) => {
    const required: unknown = (resource.config?.secrets as { required?: unknown } | undefined)
      ?.required;
    const missingSecrets = (Array.isArray(required) ? required : [])
      .filter(
        (name): name is string =>
          typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !has(name),
      )
      .map((name) => `${filePath(projectRoot, resource)}: secret ${name} has no value`);
    // A provider's token is required unless the provider has a local fallback (service.json `providers`).
    const missingTokens = providersOf(resource.config as Record<string, unknown> | undefined)
      .filter(
        (provider) =>
          provider.required &&
          provider.tokenSecret !== undefined &&
          /^[A-Za-z_][A-Za-z0-9_]*$/.test(provider.tokenSecret) &&
          !has(provider.tokenSecret) &&
          !missingSecrets.some((line) => line.endsWith(` ${provider.tokenSecret} has no value`)),
      )
      .map(
        (provider) =>
          `${filePath(projectRoot, resource)}: secret ${provider.tokenSecret} (token of provider ${provider.id}) has no value`,
      );
    return [...missingSecrets, ...missingTokens];
  });
  if (problems.length === 0) {
    return {
      name: "Required secrets",
      didPass: true,
      message: "Every required secret has a value",
    };
  }
  return {
    name: "Required secrets",
    didPass: false,
    message: `${formatCount(problems.length, "required secret")} without a value:\n    ${problems.join("\n    ")}`,
    fix: `Add NAME=value to ${relative(projectRoot, envFile) || ".env"} (it is gitignored), or export it in the environment, or move it to "optional"`,
  };
}

/** Prints each secret that a literal in `params` or `env` overrides. A warning: such a project still starts. */
export function warnSecretConflicts(projectRoot: string, resources?: DiscoveredResource[]): void {
  for (const resource of resources ?? discoverResourcesFromRoot(projectRoot)) {
    if (!resource.config) continue;
    for (const warning of secretConflictWarnings(
      resource.config as Record<string, unknown>,
      filePath(projectRoot, resource),
    ))
      console.warn(chalk.yellow(`⚠ ${warning}`));
  }
}

/**
 * Runs before anything starts (also under --dry-run, like the drift gate): duplicate service names, circular
 * dependsOn and invalid ports exit with 1 and say which file, which field, and how to fix it.
 */
export function enforceServiceConfigGate(
  projectRoot: string,
  options: { onInvalid?: (message: string) => void; resources?: DiscoveredResource[] } = {},
  exit: (code: number) => never = process.exit,
): void {
  const resources = options.resources ?? discoverResourcesFromRoot(projectRoot);
  const failed = [
    checkDuplicateResourceNames(projectRoot, resources),
    checkServiceFields(projectRoot, resources),
    checkCustomDockerfiles(projectRoot, resources),
    checkRequiredSecrets(projectRoot, resources),
    checkDependsOnShape(projectRoot, resources),
    checkCircularDependencies(projectRoot, resources),
    checkServicePorts(projectRoot, resources),
    checkSidecars(projectRoot, resources),
    checkVolumes(projectRoot, resources),
  ].filter((check) => !check.didPass);
  if (failed.length === 0) return;

  const text = failed
    .map((check) => `${check.message}${check.fix ? `\nFix: ${check.fix}` : ""}`)
    .join("\n");
  options.onInvalid?.(text);
  for (const check of failed) {
    console.error(chalk.red(`✗ ${check.message}`));
    if (check.fix) console.error(chalk.gray(`  Fix: ${check.fix}`));
  }
  exit(1);
}
