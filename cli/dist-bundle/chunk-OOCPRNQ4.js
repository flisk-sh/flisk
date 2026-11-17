import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  extraPortsOf,
  isLoopbackAddress
} from "./chunk-ZI7AIJRM.js";
import {
  checkDuplicateResourceNames
} from "./chunk-TZFR2MQ6.js";
import {
  PROJECT_ENV_FILE_VAR,
  SERVICE_MANIFEST_SCHEMA_VERSION,
  declaredDependsOn,
  dependencyEdges,
  discoverResourcesFromRoot,
  envFileErrors,
  generateEntries,
  parseEnv,
  projectEnvLookup,
  providersOf,
  secretConflictWarnings,
  validateServiceManifest,
  volumesErrors
} from "./chunk-2BH5UW2N.js";
import {
  formatCount
} from "./chunk-ARPSTQFE.js";
import {
  findProjectRoot,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/service-config-checks.js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
function filePath(projectRoot, resource) {
  return relative(projectRoot, resource.configPath) || resource.configPath;
}
function findDependencyCycles(resources) {
  const edges = dependencyEdges(resources);
  const cycles = /* @__PURE__ */ new Map();
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const visit = (name) => {
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
    if (!state.has(name))
      visit(name);
  }
  return [...cycles.values()];
}
function checkDependsOnShape(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const problems = resources.flatMap((resource) => declaredDependsOn(resource.config) === null ? [
    `${filePath(projectRoot, resource)} dependsOn ${JSON.stringify(resource.config?.dependsOn)}: expected an array of service names`
  ] : []);
  if (problems.length === 0) {
    return {
      name: "dependsOn",
      didPass: true,
      message: "Every dependsOn is a list of service names"
    };
  }
  return {
    name: "dependsOn",
    didPass: false,
    message: `${formatCount(problems.length, "invalid dependsOn", "invalid dependsOn")}:
    ${problems.join("\n    ")}`,
    fix: 'Write "dependsOn" as an array of service names, for example ["postgres", "api"]'
  };
}
function checkCircularDependencies(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const byName = new Map(resources.map((r) => [r.name, r]));
  const cycles = findDependencyCycles(resources);
  if (cycles.length === 0) {
    return {
      name: "Circular dependencies",
      didPass: true,
      message: "No service depends on itself through dependsOn"
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
    message: `${cycles.length} ${cycles.length === 1 ? "circular dependency" : "circular dependencies"}:
    ${lines.join("\n    ")}`,
    fix: 'Remove one "dependsOn" entry in each cycle so the services no longer wait on each other, or move what they share into a third service'
  };
}
function checkServiceFields(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const problems = resources.flatMap((resource) => validateServiceManifest({
    ...resource.config ?? {},
    // A service with no appName is named after its directory; that name has to be Docker-safe too. A wrong-typed one is reported.
    appName: resource.config && "appName" in resource.config ? resource.config.appName : resource.name
  }, filePath(projectRoot, resource)).errors.filter((error) => !/required field is missing|\.schemaVersion:/.test(error)));
  if (problems.length === 0) {
    return { name: "Service fields", didPass: true, message: "Every service.json field is valid" };
  }
  return {
    name: "Service fields",
    didPass: false,
    message: `${formatCount(problems.length, "invalid field")}:
    ${problems.join("\n    ")}`,
    fix: "Correct the field in service.json; the published schema (flisk.sh/schema.service.json) lists each field's type"
  };
}
function checkCustomDockerfiles(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const problems = resources.flatMap((resource) => {
    const config = resource.config;
    const dockerfile = config?.dockerfile;
    if (typeof dockerfile !== "string" || dockerfile === "")
      return [];
    const context = typeof config?.buildContext === "string" ? config.buildContext : "";
    const path = join(dirname(resource.configPath), context === "." ? "" : context, dockerfile);
    let isFile = false;
    try {
      isFile = statSync(path).isFile();
    } catch {
      isFile = false;
    }
    return isFile ? [] : [`${filePath(projectRoot, resource)} dockerfile: no such file in the service directory`];
  });
  if (problems.length === 0) {
    return { name: "Custom Dockerfiles", didPass: true, message: "Every custom dockerfile exists" };
  }
  return {
    name: "Custom Dockerfiles",
    didPass: false,
    message: `${formatCount(problems.length, "missing dockerfile")}:
    ${problems.join("\n    ")}`,
    fix: 'Create the file, or remove "dockerfile" from service.json to use the generated Dockerfile'
  };
}
function checkSidecars(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const stackOf = new Map(resources.map((resource) => [resource.name, resource.config?.stack]));
  const problems = resources.flatMap((resource) => {
    const host = resource.config?.sidecarOf;
    if (typeof host !== "string" || host === "")
      return [];
    const at = `${filePath(projectRoot, resource)} sidecarOf "${host}"`;
    if (!stackOf.has(host))
      return [`${at}: no resource has that name`];
    if (stackOf.get(host) !== resource.config?.stack) {
      return [
        `${at}: is in stack "${String(stackOf.get(host))}", not "${String(resource.config?.stack)}"`
      ];
    }
    return [];
  });
  if (problems.length === 0) {
    return {
      name: "Sidecars",
      didPass: true,
      message: "Every sidecarOf names a resource in its stack"
    };
  }
  return {
    name: "Sidecars",
    didPass: false,
    message: `${formatCount(problems.length, "invalid sidecarOf", "invalid sidecarOf")}:
    ${problems.join("\n    ")}`,
    fix: 'Set "sidecarOf" to the appName of a resource in the same stack'
  };
}
function checkVolumes(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const problems = resources.flatMap((resource) => {
    if (!resource.config || !("volumes" in resource.config || "envFile" in resource.config)) {
      return [];
    }
    const dir = relative(projectRoot, dirname(resource.configPath));
    const depth = dir === "" ? 0 : dir.split(sep).length;
    const config = resource.config;
    const displayPath = filePath(projectRoot, resource);
    return [
      ...volumesErrors(config, displayPath, depth),
      ...envFileErrors(config, displayPath, depth)
    ].filter((problem) => problem.endsWith("must stay inside the project"));
  });
  if (problems.length === 0) {
    return { name: "Volumes", didPass: true, message: "Every bind mount stays inside the project" };
  }
  return {
    name: "Volumes",
    didPass: false,
    message: `${formatCount(problems.length, "bind mount outside the project", "bind mounts outside the project")}:
    ${problems.join("\n    ")}`,
    fix: 'Mount a path inside the project, such as "./config", or use a named volume such as "data"'
  };
}
function postgresImageMajor(image) {
  if (typeof image !== "string")
    return null;
  const withoutDigest = image.split("@")[0] ?? "";
  const lastSlash = withoutDigest.lastIndexOf("/");
  const colon = withoutDigest.indexOf(":", lastSlash + 1);
  if (colon === -1)
    return null;
  const repository = withoutDigest.slice(0, colon).replace(/^(?:docker\.io\/)?(?:library\/)?/, "");
  if (repository !== "postgres" && repository !== "pgvector/pgvector")
    return null;
  const match = /^(?:pg)?(\d+)/.exec(withoutDigest.slice(colon + 1));
  return match ? Number(match[1]) : null;
}
function postgresVolumeWarnings(projectRoot, resources) {
  return resources.flatMap((resource) => {
    const major = postgresImageMajor(resource.config?.image);
    if (major === null || major < 18)
      return [];
    const volumes = resource.config?.volumes;
    if (!Array.isArray(volumes))
      return [];
    return volumes.flatMap((volume, index) => {
      const target = volume?.target;
      if (typeof target !== "string" || target.replace(/\/+$/, "") !== "/var/lib/postgresql/data") {
        return [];
      }
      return [
        `${filePath(projectRoot, resource)} volumes[${index}].target ${target}: Postgres ${major} refuses to start with its data volume here. Mount /var/lib/postgresql instead`
      ];
    });
  });
}
function checkPostgresVolumes(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), strict = false) {
  const problems = postgresVolumeWarnings(projectRoot, resources);
  if (problems.length === 0) {
    return {
      name: "Postgres volume",
      didPass: true,
      message: "No Postgres 18+ image mounts its volume at /var/lib/postgresql/data"
    };
  }
  return {
    name: "Postgres volume",
    didPass: false,
    isWarning: !strict,
    message: `${formatCount(problems.length, "Postgres 18+ volume")} at the pre-18 path:
    ${problems.join("\n    ")}`,
    fix: 'Set the volume "target" to /var/lib/postgresql (Postgres 18+ images store data in a versioned directory below it)'
  };
}
function dockerPublishedPorts() {
  try {
    return execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
      encoding: "utf-8",
      timeout: 5e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return "";
  }
}
function liveNetworkAddress(dockerPs, hostPort, containerPort, protocol) {
  const suffix = `:${hostPort}->${containerPort}/${protocol}`;
  for (const line of dockerPs.split("\n")) {
    const ports = line.slice(line.indexOf("|") + 1);
    for (const mapping of ports.split(",")) {
      const text = mapping.trim();
      if (!text.endsWith(suffix))
        continue;
      const address = text.slice(0, text.length - suffix.length).replace(/^\[(.*)\]$/, "$1");
      if (address && !isLoopbackAddress(address) && address !== "::1")
        return `${address}${suffix.replace("->", " -> ")}`;
    }
  }
  return null;
}
function checkNetworkPorts(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), dockerPorts = dockerPublishedPorts) {
  const lookup = projectEnvLookup(projectRoot);
  const ports = resources.flatMap((resource) => extraPortsOf(resource, lookup).map((port) => ({ resource, port })));
  const open = ports.filter(({ port }) => !port.problem && !isLoopbackAddress(port.bind)).map(({ resource, port }) => {
    const via = port.publish ? ` (${port.publish.variables.join(", ")}, ${port.publish.source === "environment" ? "set in the environment or .env" : "default in service.json"})` : "";
    return `${resource.name} ${port.address}${via}`;
  });
  const bad = ports.filter(({ port }) => port.problem).map(({ resource, port }) => `${resource.name} ${port.problem}`);
  const declaredLoopback = ports.filter(({ port }) => !port.problem && isLoopbackAddress(port.bind));
  const live = declaredLoopback.length > 0 ? dockerPorts() : "";
  const stale = declaredLoopback.map(({ resource, port }) => ({
    resource,
    port,
    address: liveNetworkAddress(live, port.hostPort, port.containerPort, port.protocol)
  })).filter((entry) => entry.address !== null).map(({ resource, port, address }) => `${resource.name} ${port.address} is declared on this machine only, but a running container publishes ${address}`);
  if (open.length === 0 && bad.length === 0 && stale.length === 0) {
    return {
      name: "Network ports",
      didPass: true,
      message: "No port is published beyond this machine"
    };
  }
  const sections = [
    open.length > 0 ? `${formatCount(open.length, "port")} reachable from the network:
    ${open.join("\n    ")}` : "",
    stale.length > 0 ? `${formatCount(stale.length, "port")} wider than declared:
    ${stale.join("\n    ")}` : "",
    bad.length > 0 ? `Invalid published address:
    ${bad.join("\n    ")}` : ""
  ].filter(Boolean);
  return {
    name: "Network ports",
    didPass: false,
    isWarning: true,
    message: sections.join("\n  "),
    fix: [
      open.length > 0 ? 'Remove "bind": "0.0.0.0" from extraPorts, or start a "publish" default or .env value with 127.0.0.1:, to publish on this machine only' : "",
      stale.length > 0 ? "Recreate the container (flisk restart <resource>) so it picks up the declared bind" : "",
      bad.length > 0 ? 'Set the .env value to a port or an IPv4 address:port such as "127.0.0.1:8080"' : ""
    ].filter(Boolean).join(". ")
  };
}
function dockerRuntimes() {
  try {
    const out = execFileSync("docker", ["info", "--format", "{{json .Runtimes}}"], {
      encoding: "utf-8",
      timeout: 8e3,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return Object.keys(JSON.parse(out) ?? {});
  } catch {
    return null;
  }
}
function checkGpuRuntime(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), runtimes = dockerRuntimes) {
  const wanting = resources.filter((resource) => {
    const container = resource.config?.container;
    return container?.gpus !== void 0;
  }).map((resource) => resource.name);
  if (wanting.length === 0) {
    return { name: "GPU runtime", didPass: true, message: "No service asks for a GPU" };
  }
  const found = runtimes();
  if (found === null || found.includes("nvidia")) {
    return {
      name: "GPU runtime",
      didPass: true,
      message: found === null ? "Docker did not answer; the GPU runtime was not checked" : "Docker has the NVIDIA runtime"
    };
  }
  return {
    name: "GPU runtime",
    didPass: false,
    isWarning: true,
    message: `${wanting.join(", ")} ask for a GPU (container.gpus), but Docker lists no nvidia runtime (found: ${found.join(", ") || "none"}); Docker will refuse to create ${wanting.length === 1 ? "it" : "them"}`,
    fix: "Install the NVIDIA Container Toolkit on a GPU host, or remove container.gpus for this machine"
  };
}
function dockerModelRunnerState() {
  const quiet = {
    timeout: 8e3,
    stdio: ["ignore", "ignore", "ignore"]
  };
  try {
    execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], quiet);
  } catch {
    return null;
  }
  try {
    execFileSync("docker", ["model", "version"], quiet);
  } catch {
    return "no-plugin";
  }
  try {
    execFileSync("docker", ["model", "status"], quiet);
    return "running";
  } catch {
    return "backend-not-running";
  }
}
function checkModelRunner(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), runnerState = dockerModelRunnerState) {
  const wanting = resources.filter((resource) => {
    const models = resource.config?.models;
    return Array.isArray(models) && models.length > 0;
  }).map((resource) => resource.name);
  if (wanting.length === 0) {
    return { name: "Docker Model Runner", didPass: true, message: "No service uses models" };
  }
  const state = runnerState();
  if (state === null) {
    return {
      name: "Docker Model Runner",
      didPass: true,
      message: "Docker did not answer; Docker Model Runner was not checked"
    };
  }
  if (state === "running") {
    return {
      name: "Docker Model Runner",
      didPass: true,
      message: "Docker Model Runner is running (`docker model status`)"
    };
  }
  const verb = wanting.length === 1 ? "declares" : "declare";
  const it = wanting.length === 1 ? "it" : "them";
  if (state === "no-plugin") {
    return {
      name: "Docker Model Runner",
      didPass: false,
      isWarning: true,
      message: `${wanting.join(", ")} ${verb} models, but this Docker has no \`docker model\` plugin; Compose will refuse to start ${it} ("'models' support requires Docker Model plugin")`,
      fix: "Enable Docker Model Runner in Docker Desktop, or install docker-model-plugin (Docker Engine on Linux), then run: docker model install-runner"
    };
  }
  return {
    name: "Docker Model Runner",
    didPass: false,
    isWarning: true,
    message: `${wanting.join(", ")} ${verb} models, and the \`docker model\` plugin is installed, but \`docker model status\` says the Model Runner is not running, so Docker cannot serve the models to ${it}`,
    fix: "Enable Docker Model Runner in Docker Desktop (Settings > AI), or on Docker Engine run: docker model install-runner"
  };
}
function warnModelRunner(projectRoot, resources) {
  const check = checkModelRunner(projectRoot, resources);
  if (check.didPass)
    return;
  console.warn(source_default.yellow(`\u26A0 ${check.message}`));
  if (check.fix)
    console.warn(source_default.gray(`  Fix: ${check.fix}`));
}
function checkServicePorts(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot)) {
  const problems = resources.flatMap((resource) => {
    const port = resource.config?.port;
    if (port === void 0)
      return [];
    if (typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535)
      return [];
    return [
      `${filePath(projectRoot, resource)} port ${JSON.stringify(port)}: not an integer from 1 to 65535`
    ];
  });
  if (problems.length === 0) {
    return { name: "Service ports", didPass: true, message: "Every declared port is valid" };
  }
  return {
    name: "Service ports",
    didPass: false,
    message: `${formatCount(problems.length, "invalid port")}:
    ${problems.join("\n    ")}`,
    fix: 'Set "port" to the port the service listens on, an integer from 1 to 65535'
  };
}
function checkSchemaVersions(projectRoot = findProjectRoot() ?? process.cwd(), strict = false, resources = discoverResourcesFromRoot(projectRoot)) {
  const missing = [];
  const unsupported = [];
  for (const resource of resources) {
    const version = resource.config?.schemaVersion;
    if (version === SERVICE_MANIFEST_SCHEMA_VERSION)
      continue;
    const file = filePath(projectRoot, resource);
    if (version === void 0)
      missing.push(`${file} schemaVersion: missing`);
    else
      unsupported.push(`${file} schemaVersion ${JSON.stringify(version)}: this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`);
  }
  if (missing.length === 0 && unsupported.length === 0) {
    return {
      name: "schemaVersion",
      didPass: true,
      message: "Every service.json has a supported schemaVersion"
    };
  }
  const fixes = [
    ...missing.length > 0 ? ["Run `flisk config migrate` to add the missing schemaVersion"] : [],
    ...unsupported.length > 0 ? ["A version this flisk does not support cannot be migrated: upgrade flisk"] : []
  ];
  return {
    name: "schemaVersion",
    didPass: false,
    isWarning: !strict,
    message: `${formatCount(missing.length + unsupported.length, "service.json file")} without a supported schemaVersion:
    ${[...missing, ...unsupported].join("\n    ")}`,
    fix: fixes.join(". ")
  };
}
function warnSchemaVersions(projectRoot, resources) {
  const check = checkSchemaVersions(projectRoot, false, resources);
  if (check.didPass)
    return;
  console.warn(source_default.yellow(`\u26A0 ${check.message}`));
  if (check.fix)
    console.warn(source_default.gray(`  ${check.fix}`));
}
function checkRequiredSecrets(projectRoot = findProjectRoot() ?? process.cwd(), resources = discoverResourcesFromRoot(projectRoot), env = process.env) {
  const provider = (env.FLISK_SECRET_PROVIDER ?? "").trim().toLowerCase();
  if (provider !== "" && provider !== "env-file") {
    return {
      name: "Required secrets",
      didPass: true,
      message: "Secrets are left to the secret provider"
    };
  }
  const envFile = env[PROJECT_ENV_FILE_VAR] || join(projectRoot, ".env");
  let fileValues = /* @__PURE__ */ new Map();
  try {
    if (existsSync(envFile))
      fileValues = parseEnv(readFileSync(envFile, "utf-8"));
  } catch {
  }
  const has = (name) => Boolean((env[name] ?? "").trim() || (fileValues.get(name) ?? "").trim());
  const problems = resources.flatMap((resource) => {
    const required = resource.config?.secrets?.required;
    const generated = generateEntries(resource.config);
    const missingSecrets = (Array.isArray(required) ? required : []).filter((name) => typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !has(name) && !generated.has(name)).map((name) => `${filePath(projectRoot, resource)}: secret ${name} has no value`);
    const missingTokens = providersOf(resource.config).filter((provider2) => provider2.required && provider2.tokenSecret !== void 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(provider2.tokenSecret) && !has(provider2.tokenSecret) && !missingSecrets.some((line) => line.endsWith(` ${provider2.tokenSecret} has no value`))).map((provider2) => `${filePath(projectRoot, resource)}: secret ${provider2.tokenSecret} (token of provider ${provider2.id}) has no value`);
    return [...missingSecrets, ...missingTokens];
  });
  if (problems.length === 0) {
    return {
      name: "Required secrets",
      didPass: true,
      message: "Every required secret has a value"
    };
  }
  return {
    name: "Required secrets",
    didPass: false,
    message: `${formatCount(problems.length, "required secret")} without a value:
    ${problems.join("\n    ")}`,
    fix: `Add NAME=value to ${relative(projectRoot, envFile) || ".env"} (it is gitignored), or export it in the environment, or move it to "optional"`
  };
}
function warnSecretConflicts(projectRoot, resources) {
  for (const resource of resources ?? discoverResourcesFromRoot(projectRoot)) {
    if (!resource.config)
      continue;
    for (const warning of secretConflictWarnings(resource.config, filePath(projectRoot, resource)))
      console.warn(source_default.yellow(`\u26A0 ${warning}`));
  }
}
function enforceServiceConfigGate(projectRoot, options = {}, exit = process.exit) {
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
    checkVolumes(projectRoot, resources)
  ].filter((check) => !check.didPass);
  if (failed.length === 0)
    return;
  const text = failed.map((check) => `${check.message}${check.fix ? `
Fix: ${check.fix}` : ""}`).join("\n");
  options.onInvalid?.(text);
  for (const check of failed) {
    console.error(source_default.red(`\u2717 ${check.message}`));
    if (check.fix)
      console.error(source_default.gray(`  Fix: ${check.fix}`));
  }
  exit(1);
}

export {
  checkDependsOnShape,
  checkCircularDependencies,
  checkSidecars,
  checkVolumes,
  postgresVolumeWarnings,
  checkPostgresVolumes,
  checkNetworkPorts,
  checkGpuRuntime,
  checkModelRunner,
  warnModelRunner,
  checkServicePorts,
  checkSchemaVersions,
  warnSchemaVersions,
  warnSecretConflicts,
  enforceServiceConfigGate
};
