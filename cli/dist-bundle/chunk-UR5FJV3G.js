import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  GATEWAY_DISABLED_REASON,
  PREFERRED_HOST_PORTS,
  createHostPortPlan,
  isHostPortAvailable,
  withoutGatewayPorts
} from "./chunk-IXI5AKZB.js";
import {
  findTiltPortOwner,
  isForeignTilt
} from "./chunk-XT2XGGXK.js";
import {
  isDatabaseCapabilityEnabled,
  isGatewayEnabled
} from "./chunk-IZ7YHIUT.js";
import {
  discoverResourcesFromRoot,
  isWebUiBringYourOwn,
  parseHostMapping,
  projectEnvLookup,
  publishVariables,
  resolveRouteBase,
  resolveServicePath,
  routesAsApi,
  substitutePublish
} from "./chunk-KZQVEXPY.js";
import {
  BRING_YOUR_OWN_TYPE,
  PROJECT_JSON,
  STANDARD_PORTS
} from "./chunk-NKTINEF4.js";
import {
  toComposeProjectName
} from "./chunk-HS5H5D2L.js";

// dist/utils/host-port-config.js
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

// dist/utils/status-ports.js
var isLoopbackAddress = (address) => /^127\./.test(address);
function resolveExtraPort(port, protocol, publish, lookup) {
  const variables = publishVariables(publish);
  if (typeof variables === "string")
    return null;
  const fromEnvironment = variables.some((variable) => Boolean(lookup(variable.name)));
  const resolved = substitutePublish(publish, lookup);
  const mapping = parseHostMapping(resolved);
  const base = { containerPort: port, protocol };
  const info = {
    template: publish,
    source: fromEnvironment ? "environment" : "default",
    variables: variables.map((variable) => variable.name)
  };
  if (!mapping) {
    const fallback = parseHostMapping(substitutePublish(publish));
    if (!fallback)
      return null;
    const address2 = fallback.address ?? "0.0.0.0";
    return {
      ...base,
      hostPort: fallback.port,
      bind: address2,
      address: `${address2}:${fallback.port}/${protocol}`,
      publish: info,
      problem: `${variables.map((variable) => variable.name).join(", ")} resolves to "${resolved}", which is not a port or address:port such as 127.0.0.1:8080`
    };
  }
  const address = mapping.address ?? "0.0.0.0";
  return {
    ...base,
    hostPort: mapping.port,
    bind: address,
    address: `${address}:${mapping.port}/${protocol}`,
    publish: info
  };
}
function extraPortsOf(resource, lookup = (name) => process.env[name] || void 0) {
  const config = resource.config;
  if (config?.appType !== BRING_YOUR_OWN_TYPE || !Array.isArray(config.extraPorts))
    return [];
  return config.extraPorts.flatMap((entry) => {
    if (!entry || typeof entry !== "object")
      return [];
    const { port, hostPort, protocol, bind, publish } = entry;
    if (typeof port !== "number")
      return [];
    const proto = protocol === "udp" ? "udp" : "tcp";
    if (typeof publish === "string") {
      const resolved = resolveExtraPort(port, proto, publish, lookup);
      return resolved ? [resolved] : [];
    }
    const host = typeof hostPort === "number" ? hostPort : port;
    const address = bind === "0.0.0.0" ? "0.0.0.0" : "127.0.0.1";
    return [
      {
        containerPort: port,
        hostPort: host,
        protocol: proto,
        bind: address,
        address: `${address}:${host}/${proto}`
      }
    ];
  });
}
function resolveGatewayOption(options) {
  if (options === void 0 || options === null)
    return true;
  if (typeof options === "boolean")
    return options;
  const opts = options;
  if (typeof opts.gateway === "boolean") {
    return opts.gateway;
  }
  if (opts.capabilities && typeof opts.capabilities.gateway === "boolean") {
    return opts.capabilities.gateway;
  }
  return true;
}
function buildServicePorts(resource, ingressHttp, options, lookup) {
  const gatewayEnabled = resolveGatewayOption(options);
  const appType = resource.config?.appType;
  const containerPort = resource.port ?? resource.config?.port ?? null;
  if (typeof options === "object" && options !== null && "native" in options && options.native) {
    return {
      url: null,
      containerPort,
      hostPort: null,
      directUrl: containerPort ? `http://localhost:${containerPort}` : null,
      extraPorts: extraPortsOf(resource, lookup)
    };
  }
  const routedByType = appType === "frontend" || routesAsApi(resource) || isWebUiBringYourOwn(resource);
  const routable = gatewayEnabled && routedByType;
  let url = null;
  if (routable) {
    url = `${resolveRouteBase(resource, ingressHttp)}${resolveServicePath(resource)}`;
  }
  const directUrl = !routedByType && containerPort && appType !== BRING_YOUR_OWN_TYPE ? `http://localhost:${containerPort}` : null;
  return {
    url,
    containerPort,
    hostPort: null,
    directUrl,
    extraPorts: extraPortsOf(resource, lookup)
  };
}
function buildStackPorts(plan, tiltPort, options) {
  const gatewayEnabled = resolveGatewayOption(options);
  const ports = [];
  if (plan && gatewayEnabled) {
    ports.push({ name: "ingress-http", hostPort: plan.ingressHttp, purpose: "Traefik HTTP ingress" }, { name: "ingress-https", hostPort: plan.ingressHttps, purpose: "Traefik HTTPS ingress" });
  }
  const validTiltPort = tiltPort !== void 0 && Number.isInteger(tiltPort) && tiltPort > 0;
  ports.push({
    name: "tilt-ui",
    hostPort: validTiltPort ? tiltPort : STANDARD_PORTS.tiltUi,
    purpose: "Tilt UI"
  });
  if (plan) {
    ports.push({ name: "postgres", hostPort: plan.postgres, purpose: "Published Postgres" });
  }
  return ports;
}

// dist/utils/host-port-config.js
var CONFIG_PATH = join(".flisk", ".flisk-out", "host-ports.json");
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
      dockerPs = execFileSync("docker", ["ps", "--format", "{{.Names}}|{{.Ports}}"], {
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
  isLoopbackAddress,
  extraPortsOf,
  buildServicePorts,
  buildStackPorts,
  readSavedHostPortPlan,
  writeSavedHostPortPlan,
  exportHostPortPlan,
  resolveRuntimeIngressPort,
  resolveRuntimeTiltPort,
  getHostPortPlan,
  describeHostPortPlan,
  hostPortPlanFix
};
