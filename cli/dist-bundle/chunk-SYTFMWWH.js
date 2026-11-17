import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  extraPortsOf
} from "./chunk-ZI7AIJRM.js";
import {
  findTiltPortOwner,
  isForeignTilt
} from "./chunk-KT6PYS2C.js";
import {
  isDatabaseCapabilityEnabled,
  isGatewayEnabled
} from "./chunk-BH5IJ6AV.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";
import {
  discoverResourcesFromRoot,
  projectEnvLookup
} from "./chunk-2BH5UW2N.js";
import {
  FliskError,
  PROJECT_JSON
} from "./chunk-73W4Y4TI.js";

// dist/utils/host-port-config.js
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// dist/utils/host-command-cache.js
function createHostCommandCache() {
  return /* @__PURE__ */ new Map();
}
function createAsyncCommandCache() {
  return /* @__PURE__ */ new Map();
}
function cacheExecAsync(exec, cache) {
  return (command, timeoutMs) => {
    const key = JSON.stringify([command, timeoutMs]);
    let pending = cache.get(key);
    if (!pending) {
      pending = Promise.resolve().then(() => exec(command, timeoutMs));
      cache.set(key, pending);
    }
    return pending;
  };
}
var SHARED_DOCKER_PS = {
  args: ["ps", "--format", "{{.Names}}\\t{{.Image}}\\t{{.Ports}}"],
  shellCommand: "docker ps --format '{{.Names}}\\t{{.Image}}\\t{{.Ports}}'",
  timeoutMs: 1e4
};
function hasSharedDockerPsOutput(cache) {
  if (!cache)
    return false;
  const key = JSON.stringify([SHARED_DOCKER_PS.shellCommand, "utf-8", SHARED_DOCKER_PS.timeoutMs]);
  const cached = cache.get(key);
  return cached !== void 0 && "output" in cached;
}
function runCachedHostCommand(cache, shellCommand, options, run) {
  if (!cache)
    return run();
  const key = JSON.stringify([shellCommand, options.encoding, options.timeout]);
  const cached = cache.get(key);
  if (cached) {
    if ("error" in cached)
      throw cached.error;
    return cached.output;
  }
  try {
    const output = run();
    cache.set(key, { output });
    return output;
  } catch (error) {
    cache.set(key, { error });
    throw error;
  }
}

// dist/utils/host-port-plan.js
import { createServer } from "node:net";

// dist/utils/port-listener-probe.js
import { connect } from "node:net";
function hasLocalListener(port, timeoutMs = 500) {
  return new Promise((resolve2) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const finish = (result) => {
      socket.destroy();
      resolve2(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

// dist/utils/host-port-plan.js
var GATEWAY_DISABLED_REASON = "gateway capability disabled";
var DEFAULT_HOST_PORT_RANGES = {
  ingressHttp: { start: 8080, end: 8180 },
  ingressHttps: { start: 8443, end: 8543 },
  postgres: { start: 15432, end: 15532 }
};
var ENV_KEYS = {
  ingressHttp: "FLISK_HTTP_PORT",
  ingressHttps: "FLISK_HTTPS_PORT",
  postgres: "FLISK_POSTGRES_PORT"
};
var REQUESTED_PORTS = { ingressHttp: 80, ingressHttps: 443, postgres: 5432 };
var PREFERRED_HOST_PORTS = {
  ingressHttp: REQUESTED_PORTS.ingressHttp,
  ingressHttps: REQUESTED_PORTS.ingressHttps
};
function isPrivilegedBindFree(errorCode, platform) {
  return errorCode === "EACCES" && platform === "darwin";
}
async function isHostPortAvailable(port) {
  if (await hasLocalListener(port))
    return false;
  return new Promise((resolve2) => {
    const server = createServer();
    server.once("error", (error) => {
      resolve2(isPrivilegedBindFree(error.code, process.platform));
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve2(true)));
  });
}
function parsePort(name, value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new FliskError(`${name} must be an integer between 1 and 65535 (received ${JSON.stringify(value)})`, ["Provide a valid port number between 1 and 65535"], 1);
  }
  return port;
}
async function createHostPortPlan(options = {}) {
  const env = options.env ?? process.env;
  const isAvailable = options.isAvailable ?? isHostPortAvailable;
  const explicitFlags = { ingressHttp: false, ingressHttps: false, postgres: false };
  const reasons = { ingressHttp: "", ingressHttps: "", postgres: "" };
  const selected = { explicit: explicitFlags };
  const reserved = /* @__PURE__ */ new Set();
  const dbEnabled = options.database !== false && options.capabilities?.database !== false;
  const gatewayEnabled = options.gateway !== false && options.capabilities?.gateway !== false;
  const keys = [
    ...gatewayEnabled ? ["ingressHttp", "ingressHttps"] : [],
    ...dbEnabled ? ["postgres"] : []
  ];
  if (!dbEnabled) {
    selected.postgres = 5432;
    explicitFlags.postgres = false;
    reasons.postgres = "database capability disabled";
  }
  if (!gatewayEnabled) {
    selected.ingressHttp = REQUESTED_PORTS.ingressHttp;
    selected.ingressHttps = REQUESTED_PORTS.ingressHttps;
    reasons.ingressHttp = GATEWAY_DISABLED_REASON;
    reasons.ingressHttps = GATEWAY_DISABLED_REASON;
  }
  for (const key of keys) {
    const envValue = env[ENV_KEYS[key]];
    const explicit = envValue !== void 0 && envValue.trim() !== "";
    const range = options.ranges?.[key] ?? DEFAULT_HOST_PORT_RANGES[key];
    const preferred = PREFERRED_HOST_PORTS[key];
    const candidates = explicit ? [parsePort(ENV_KEYS[key], envValue)] : [
      ...preferred === void 0 ? [] : [preferred],
      ...Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index)
    ];
    let chosen;
    for (const port of candidates) {
      if (reserved.has(port))
        continue;
      if (await isAvailable(port)) {
        chosen = port;
        break;
      }
      if (explicit) {
        throw new FliskError(`${ENV_KEYS[key]}=${port} is already in use. Choose a free host port and retry.`, [
          "Choose a different free host port or unset the environment variable to use fallback ranges"
        ], 1);
      }
    }
    if (chosen === void 0) {
      throw new FliskError(`No available host port in ${range.start}-${range.end} for ${key}. Set ${ENV_KEYS[key]} to a free port and retry.`, [
        `Free up port range ${range.start}-${range.end} or set ${ENV_KEYS[key]} to an available port`
      ], 1);
    }
    reserved.add(chosen);
    selected[key] = chosen;
    explicitFlags[key] = explicit;
    reasons[key] = explicit ? "explicit override" : chosen === preferred ? "requested port is free" : `selected from fallback range ${range.start}-${range.end}`;
  }
  return {
    ...selected,
    requested: { ...REQUESTED_PORTS },
    reason: reasons
  };
}
function formatHostPortPlan(plan) {
  const parts = [
    ...plan.reason?.ingressHttp === GATEWAY_DISABLED_REASON ? [] : [`HTTP ${plan.ingressHttp}`, `HTTPS ${plan.ingressHttps}`],
    ...plan.reason?.postgres === "database capability disabled" ? [] : [`Postgres ${plan.postgres}`]
  ];
  return parts.length > 0 ? `Host ports: ${parts.join(", ")}` : "Host ports: none needed";
}
function withoutGatewayPorts(plan) {
  return {
    ...plan,
    ingressHttp: REQUESTED_PORTS.ingressHttp,
    ingressHttps: REQUESTED_PORTS.ingressHttps,
    explicit: { ...plan.explicit, ingressHttp: false, ingressHttps: false },
    reason: {
      ...plan.reason,
      ingressHttp: GATEWAY_DISABLED_REASON,
      ingressHttps: GATEWAY_DISABLED_REASON
    }
  };
}

// dist/utils/host-port-config.js
var CONFIG_PATH = join(".flisk", ".flisk-out", "host-ports.json");
function readSharedDockerPs(cache) {
  const { args, shellCommand, timeoutMs } = SHARED_DOCKER_PS;
  const options = { encoding: "utf-8", timeout: timeoutMs };
  return runCachedHostCommand(cache, shellCommand, options, () => execFileSync("docker", [...args], options));
}
function toNamePortsLines(tabbed) {
  return tabbed.split("\n").map((line) => {
    const [name = "", , ports = ""] = line.split("	");
    return `${name}|${ports}`;
  }).join("\n");
}
function isDockerPortOwnedByProject(dockerPs, projectPrefix, port) {
  return dockerPs.split("\n").some((line) => {
    const [name = "", ports = ""] = line.split("|");
    const containerName = name.toLowerCase();
    const prefix = projectPrefix.toLowerCase();
    return (containerName.startsWith(`${prefix}_`) || containerName.startsWith(`${prefix}-`)) && ports.includes(`:${port}->`);
  });
}
function readSavedHostPortPlan(projectRoot) {
  const path = join(projectRoot, CONFIG_PATH);
  if (!existsSync(path))
    return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf-8"));
    if (!value || typeof value !== "object")
      return null;
    const plan = value;
    if (!Number.isInteger(plan.ingressHttp) || !Number.isInteger(plan.ingressHttps) || !Number.isInteger(plan.postgres) || !plan.requested || !plan.explicit || !plan.reason)
      return null;
    if (plan.tiltUi !== void 0 && (!Number.isInteger(plan.tiltUi) || plan.tiltUi < 1 || plan.tiltUi > 65535)) {
      delete plan.tiltUi;
    }
    return plan;
  } catch {
    return null;
  }
}
function readSavedTiltPort(projectRoot) {
  const plan = readSavedHostPortPlan(projectRoot);
  return plan?.tiltUi ?? null;
}
function writeSavedHostPortPlan(projectRoot, plan) {
  const path = join(projectRoot, CONFIG_PATH);
  mkdirSync(join(projectRoot, ".flisk", ".flisk-out"), { recursive: true });
  mkdirSync(join(projectRoot, ".flisk", ".flisk-out", "traefik-dynamic"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 2)}
`, { encoding: "utf-8", mode: 384 });
}
function exportHostPortPlan(plan) {
  process.env.FLISK_HTTP_PORT = String(plan.ingressHttp);
  process.env.FLISK_HTTPS_PORT = String(plan.ingressHttps);
  process.env.FLISK_POSTGRES_PORT = String(plan.postgres);
}
var COMPOSE_WORKING_DIR_LABEL = "com.docker.compose.project.working_dir";
function isPortHeldByProjectContainers(dockerPs, projectRoot, port) {
  const roots = /* @__PURE__ */ new Set([resolve(projectRoot)]);
  try {
    roots.add(realpathSync(projectRoot));
  } catch {
  }
  return dockerPs.split("\n").some((line) => {
    const [, ports = "", workingDir = ""] = line.split("|");
    if (!workingDir || !ports.includes(`:${port}->`))
      return false;
    return [...roots].some((root) => workingDir === root || workingDir.startsWith(`${root}${sep}`));
  });
}
function resolveRuntimeIngressPort(projectRoot, plannedPort, readDockerPs = () => execFileSync("docker", ["ps", "--format", `{{.Names}}|{{.Ports}}|{{.Label "${COMPOSE_WORKING_DIR_LABEL}"}}`], { encoding: "utf-8", timeout: 5e3 })) {
  const saved = readSavedHostPortPlan(projectRoot);
  if (!saved || saved.ingressHttp === plannedPort)
    return plannedPort;
  try {
    if (isPortHeldByProjectContainers(readDockerPs(), projectRoot, saved.ingressHttp)) {
      return saved.ingressHttp;
    }
  } catch {
  }
  return plannedPort;
}
function resolveRuntimeTiltPort(projectRoot, options = {}) {
  const ownerOf = options.ownerOf ?? findTiltPortOwner;
  const savedPort = readSavedTiltPort(projectRoot);
  if (options.envPort !== void 0 && options.envPort !== "") {
    const parsed = Number(options.envPort);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      const owner = ownerOf(parsed);
      if (owner && isForeignTilt(owner, projectRoot))
        return null;
      return parsed;
    }
    return null;
  }
  if (savedPort !== null) {
    const owner = ownerOf(savedPort);
    if (owner && isForeignTilt(owner, projectRoot)) {
    } else {
      return savedPort;
    }
  }
  const defaultPort = 10350;
  const defaultOwner = ownerOf(defaultPort);
  if (defaultOwner && isForeignTilt(defaultOwner, projectRoot)) {
    return null;
  }
  return defaultPort;
}
function reservedExtraPorts(projectRoot) {
  const lookup = projectEnvLookup(projectRoot);
  try {
    return new Set(discoverResourcesFromRoot(projectRoot).flatMap((resource) => extraPortsOf(resource, lookup).map((port) => port.hostPort)));
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function getHostPortPlan(projectRoot, options = {}) {
  const dbEnabled = isDatabaseCapabilityEnabled(projectRoot, options);
  const gatewayEnabled = isGatewayEnabled(projectRoot, options);
  const plan = await planHostPorts(projectRoot, { ...options, dbEnabled, gatewayEnabled });
  return gatewayEnabled ? plan : withoutGatewayPorts(plan);
}
async function planHostPorts(projectRoot, options) {
  const { dbEnabled, gatewayEnabled } = options;
  const savedPlan = readSavedHostPortPlan(projectRoot);
  const saved = gatewayEnabled && savedPlan?.reason.ingressHttp === GATEWAY_DISABLED_REASON ? null : savedPlan;
  const overrideKeys = [
    ...gatewayEnabled ? ["FLISK_HTTP_PORT", "FLISK_HTTPS_PORT"] : [],
    ...dbEnabled ? ["FLISK_POSTGRES_PORT"] : []
  ];
  const lookup = projectEnvLookup(projectRoot);
  const env = { ...process.env };
  for (const key of ["FLISK_HTTP_PORT", "FLISK_HTTPS_PORT", "FLISK_POSTGRES_PORT"]) {
    const value = lookup(key);
    if (value !== void 0)
      env[key] = value;
  }
  const hasOverride = overrideKeys.some((key) => env[key]);
  if (options.inspectDocker === false && saved && !hasOverride)
    return saved;
  let prefix = "";
  try {
    const project = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
    prefix = toComposeProjectName(String(project?.project?.name ?? "flisk-project")).toLowerCase();
  } catch {
    prefix = "flisk_project";
  }
  let dockerPs = "";
  if (options.inspectDocker !== false) {
    try {
      dockerPs = options.commandCache ? toNamePortsLines(readSharedDockerPs(options.commandCache)) : execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
        encoding: "utf-8",
        timeout: 5e3
      });
    } catch {
    }
  }
  const ownedByProject = (port) => isDockerPortOwnedByProject(dockerPs, prefix, port);
  const isPortFree = options.isPortFree ?? isHostPortAvailable;
  const reserved = reservedExtraPorts(projectRoot);
  const isAvailable = async (port) => !reserved.has(port) && (await isPortFree(port) || ownedByProject(port));
  const replan = () => createHostPortPlan({
    isAvailable,
    database: dbEnabled,
    gateway: gatewayEnabled,
    capabilities: options.capabilities,
    env
  });
  if (saved && !hasOverride) {
    const checkedPorts = [
      ...gatewayEnabled ? [saved.ingressHttp, saved.ingressHttps] : [],
      ...dbEnabled ? [saved.postgres] : []
    ];
    for (const port of checkedPorts) {
      if (!await isAvailable(port))
        return replan();
    }
    for (const [key, preferred] of Object.entries(PREFERRED_HOST_PORTS)) {
      if (!dbEnabled && key === "postgres")
        continue;
      if (!gatewayEnabled && (key === "ingressHttp" || key === "ingressHttps"))
        continue;
      const savedPort = saved[key];
      if (preferred !== void 0 && savedPort !== preferred && await isAvailable(preferred)) {
        return replan();
      }
    }
    return saved;
  }
  return replan();
}
function describeHostPortPlan(plan, caps) {
  const parts = [
    ...caps.gateway ? [`HTTP ${plan.ingressHttp}`, `HTTPS ${plan.ingressHttps}`] : [],
    ...caps.database ? [`Postgres ${plan.postgres}`] : []
  ];
  return parts.length > 0 ? parts.join(", ") : "No gateway or database host ports needed";
}
function hostPortPlanFix(caps) {
  if (caps.gateway && !caps.database) {
    return "Set FLISK_HTTP_PORT or FLISK_HTTPS_PORT to available host ports.";
  }
  if (caps.database && !caps.gateway)
    return "Set FLISK_POSTGRES_PORT to an available host port.";
  return "Set FLISK_HTTP_PORT, FLISK_HTTPS_PORT, or FLISK_POSTGRES_PORT to available host ports.";
}

export {
  createHostCommandCache,
  createAsyncCommandCache,
  cacheExecAsync,
  SHARED_DOCKER_PS,
  hasSharedDockerPsOutput,
  runCachedHostCommand,
  DEFAULT_HOST_PORT_RANGES,
  isHostPortAvailable,
  createHostPortPlan,
  formatHostPortPlan,
  readSharedDockerPs,
  toNamePortsLines,
  isDockerPortOwnedByProject,
  readSavedHostPortPlan,
  readSavedTiltPort,
  writeSavedHostPortPlan,
  exportHostPortPlan,
  isPortHeldByProjectContainers,
  resolveRuntimeIngressPort,
  resolveRuntimeTiltPort,
  getHostPortPlan,
  describeHostPortPlan,
  hostPortPlanFix
};
