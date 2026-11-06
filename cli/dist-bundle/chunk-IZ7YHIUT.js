import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  dependsOnOf,
  discoverResourcesWithProblems
} from "./chunk-KZQVEXPY.js";
import {
  BRING_YOUR_OWN_TYPE,
  DATABASE_MANAGEMENT_FEATURE,
  FliskError,
  PORT_RANGES,
  PROJECT_JSON,
  STANDARD_PORTS,
  findProjectRoot,
  source_default
} from "./chunk-NKTINEF4.js";

// dist/utils/file-helpers.js
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
function writeFilesWithProgress(basePath, tasks, onProgress, options = {}) {
  for (const [i, task] of tasks.entries()) {
    console.log(source_default.blue(`${task.emoji} ${task.description}...`));
    if (options.exclusive) {
      const content = task.type === "json" ? `${JSON.stringify(task.content, null, 2)}
` : String(task.content);
      const filePath = resolve(basePath, task.filename);
      mkdirSync(dirname(filePath), { recursive: true });
      try {
        writeFileSync(filePath, content, { encoding: "utf-8", flag: "wx" });
      } catch (error) {
        if (error.code !== "EEXIST")
          throw error;
        throw new FliskError(`${filePath} appeared while it was being created and was left as it is.`, [
          "Something else is writing into this folder. Pick another folder or name and run the command again."
        ]);
      }
    } else if (task.type === "json") {
      writeJsonFileInDir(basePath, task.filename, task.content);
    } else {
      writeTextFileInDir(basePath, task.filename, String(task.content));
    }
    if (onProgress) {
      onProgress(task, i, tasks.length);
    }
  }
}
function writeJsonFile(filePath, data, space = 2) {
  const content = `${JSON.stringify(data, null, space)}
`;
  writeFileSync(filePath, content, "utf-8");
}
function writeJsonFileInDir(dir, filename, data, space = 2) {
  const filePath = resolve(dir, filename);
  writeJsonFile(filePath, data, space);
}
function writeTextFile(filePath, content) {
  writeFileSync(filePath, content, "utf-8");
}
function writeTextFileInDir(dir, filename, content) {
  const filePath = resolve(dir, filename);
  writeTextFile(filePath, content);
}
function ensureDirectory(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
var GITIGNORE_ENTRIES = [
  ".env",
  ".flisk/.flisk-out/",
  ".flisk/.project-id",
  ".flisk/smoke/",
  "node_modules/"
];
function ensureGitignore(projectRoot) {
  const gitignorePath = resolve(projectRoot, ".gitignore");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
  const lines = new Set(existing.split("\n").map((line) => line.trim().replace(/\/$/, "")));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.has(entry.replace(/\/$/, "")));
  if (missing.length === 0)
    return [];
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  const header = existing ? "\n# Flisk (generated files and secrets)\n" : "# Flisk (generated files and secrets)\n";
  appendFileSync(gitignorePath, `${prefix}${header}${missing.join("\n")}
`);
  return missing;
}
function isInsideGitWorkTree(startPath) {
  let dir = resolve(startPath);
  for (; ; ) {
    if (existsSync(resolve(dir, ".git")))
      return true;
    const parent = dirname(dir);
    if (parent === dir)
      return false;
    dir = parent;
  }
}
function ensureSmokeRecordsIgnored(projectRoot) {
  if (!isInsideGitWorkTree(projectRoot))
    return void 0;
  try {
    ensureGitignore(projectRoot);
    return void 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not add .flisk/smoke/ to ${resolve(projectRoot, ".gitignore")}: ${reason}. Git may track the smoke response records.`;
  }
}

// dist/utils/capabilities.js
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { join } from "node:path";

// dist/config/platform-standards.js
var PLATFORM_VERSION = "1.0.0";
var TECH_STACK = {
  runtime: "bun",
  bundler: "vite",
  language: "typescript",
  framework: "hono",
  database: "postgresql",
  orm: "prisma",
  messaging: "nats",
  linting: "biome",
  testing: "vitest"
};
var PORTS = {
  frontend: {
    base: PORT_RANGES.frontend.base,
    range: PORT_RANGES.frontend.range,
    start: PORT_RANGES.frontend.min,
    end: PORT_RANGES.frontend.max
  },
  backend: {
    base: PORT_RANGES.backend.base,
    range: PORT_RANGES.backend.range,
    start: PORT_RANGES.backend.min,
    end: PORT_RANGES.backend.max
  },
  health: {
    base: PORT_RANGES.health.base,
    range: PORT_RANGES.health.range,
    start: PORT_RANGES.health.min,
    end: PORT_RANGES.health.max
  },
  worker: {
    base: PORT_RANGES.worker.base,
    range: PORT_RANGES.worker.range,
    start: PORT_RANGES.worker.min,
    end: PORT_RANGES.worker.max
  },
  migrator: {
    base: PORT_RANGES.migrator.base,
    range: PORT_RANGES.migrator.range,
    start: PORT_RANGES.migrator.min,
    end: PORT_RANGES.migrator.max
  },
  tiltUi: STANDARD_PORTS.tiltUi,
  traefik: STANDARD_PORTS.traefik
};
var HEALTH_CHECKS = {
  path: "/health",
  live: "/health/live",
  ready: "/health/ready",
  timeout: 30,
  interval: 5
};
var NAMING = {
  frontend: "-frontend",
  backend: "-backend",
  worker: "-worker",
  migrator: "-migrator",
  library: "-lib",
  sdk: "-sdk",
  validSeparators: ["-", "_"],
  maxLength: 63,
  minLength: 3
};
var TRAEFIK = {
  entrypoint: "web",
  network: "traefik-public",
  defaultHost: "localhost",
  appHost: "app.localhost",
  apiHost: "api.localhost",
  appSubdomainPrefix: "app",
  apiSubdomainPrefix: "api",
  defaultPort: 8080,
  tlsEnabled: false,
  entrypoints: ["web"],
  middlewares: [],
  tls: { enabled: false },
  healthcheckPath: "/health",
  healthcheckInterval: "10s",
  healthcheckTimeout: "5s",
  frontendPriorityBase: 100
};
var DEFAULT_CAPABILITIES = {
  gateway: true,
  database: true
};
var CAPABILITIES = DEFAULT_CAPABILITIES;
var FILEWATCH_IGNORES = [
  "node_modules",
  "dist",
  "build",
  ".git",
  ".prisma",
  ".turbo",
  "coverage",
  "tmp",
  "temp",
  "__tests__",
  "test",
  "tests"
];
var RESOURCE_TYPES = {
  frontend: {
    suffix: "-frontend",
    portRange: "3000-3999"
  },
  backend: {
    suffix: "-backend",
    portRange: "4000-4999"
  },
  library: {
    suffix: "-library",
    portRange: null
  },
  sdk: {
    suffix: "-sdk",
    portRange: "3000-9999"
  },
  migrator: {
    suffix: "-migrator",
    portRange: "7000-7999"
  },
  worker: {
    suffix: "-worker",
    portRange: "6000-6999"
  }
};
var FEATURES = {
  prisma: "Database ORM with migrations",
  nats: "Event streaming via NATS",
  redis: "Caching layer",
  infisical: "Secrets management",
  vitest: "Testing framework",
  traefik: "HTTP routing",
  websocket: "Real-time connections",
  graphql: "GraphQL support",
  grpc: "gRPC support",
  viteNode: "Vite Node runtime",
  maintenance: "Maintenance mode"
};
var PATHS = {
  services: "services/product",
  sharedPlatform: "shared-platform-engineering",
  sharedProduct: "shared-product-engineering",
  sharedDdd: "shared-ddd-layers"
};
var DISCOVERY = {
  scanIntervalSeconds: 5,
  maxManifestsPerRoot: 50,
  servicePatterns: ["services/product/*", "services/platform/*"]
};
var DOCKER = {
  dockerfile: "Dockerfile",
  context: "."
  // Auto-detect native arch (arm64 on Apple Silicon, amd64 elsewhere)
  // platform: "linux/amd64",
};
var RUNTIME = {
  backend: {
    command: "bun",
    args: ["run", "dev"],
    env: { NODE_ENV: "development" }
  },
  frontend: {
    command: "bun",
    args: ["run", "dev"],
    env: { NODE_ENV: "development" }
  }
};
var PLATFORM_STANDARDS = {
  version: PLATFORM_VERSION,
  tech: TECH_STACK,
  ports: PORTS,
  health: HEALTH_CHECKS,
  naming: NAMING,
  traefik: TRAEFIK,
  capabilities: CAPABILITIES,
  filewatchIgnores: FILEWATCH_IGNORES,
  serviceTypes: RESOURCE_TYPES,
  features: FEATURES,
  paths: PATHS,
  discovery: DISCOVERY,
  docker: DOCKER,
  runtime: RUNTIME
};

// dist/utils/platform-services.js
var POSTGRES_NAMES = ["postgres", DATABASE_MANAGEMENT_FEATURE];
function isBringYourOwn(resource) {
  return resource.config?.appType === BRING_YOUR_OWN_TYPE;
}
function wantsSharedPostgres(resource, databaseNames) {
  const features = resource.config?.featuresEnabled;
  if (Array.isArray(features) && features.includes(DATABASE_MANAGEMENT_FEATURE))
    return true;
  return dependsOnOf(resource.config).some((name) => POSTGRES_NAMES.includes(name) || databaseNames.includes(name));
}
function evaluatePlatformServiceNeeds(resources) {
  const others = resources.filter((resource) => !isBringYourOwn(resource) && resource.config?.appType !== "database").map((r) => r.name);
  const routed = resources.filter((resource) => isBringYourOwn(resource) && resource.config?.exposeViaProxy !== false).map((r) => r.name);
  const databaseNames = resources.filter((resource) => resource.config?.appType === "database").map((r) => r.name);
  const postgresUsers = resources.filter((resource) => databaseNames.includes(resource.name) || wantsSharedPostgres(resource, databaseNames)).map((r) => r.name);
  const gatewayUsers = [...others, ...routed].sort();
  const databaseUsers = [.../* @__PURE__ */ new Set([...others, ...postgresUsers])].sort();
  return {
    gateway: {
      isNeeded: gatewayUsers.length > 0,
      users: gatewayUsers,
      reason: gatewayUsers.length > 0 ? `${gatewayUsers.length} routed ${gatewayUsers.length === 1 ? "service" : "services"}` : 'no routed service (every resource is bring-your-own with "exposeViaProxy": false)'
    },
    database: {
      isNeeded: databaseUsers.length > 0,
      users: databaseUsers,
      reason: databaseUsers.length > 0 ? `used by ${databaseUsers.length} ${databaseUsers.length === 1 ? "resource" : "resources"}` : "no database resource and no dependsOn postgres"
    }
  };
}
function needsDatabaseKeys(resources) {
  if (resources.length === 0)
    return true;
  if (!resources.every(isBringYourOwn))
    return true;
  return evaluatePlatformServiceNeeds(resources).database.isNeeded;
}

// dist/utils/capabilities.js
function readProjectJson(projectRoot) {
  try {
    const file = join(projectRoot, ".flisk", PROJECT_JSON);
    if (!existsSync2(file))
      return void 0;
    return JSON.parse(readFileSync2(file, "utf-8"));
  } catch {
    return void 0;
  }
}
function applyBooleans(caps, source) {
  if (!source || typeof source !== "object")
    return;
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === "boolean")
      caps[key] = val;
  }
}
function applyFlags(caps, flags) {
  if (!flags || typeof flags !== "object")
    return;
  for (const [key, val] of Object.entries(flags)) {
    if (val === false && key in caps)
      caps[key] = false;
  }
  const flagCaps = flags.capabilities;
  if (flagCaps && typeof flagCaps === "object") {
    for (const [key, val] of Object.entries(flagCaps)) {
      if (val === false)
        caps[key] = false;
    }
  }
}
function applyUnusedPlatformServices(caps, configObj, projectRoot) {
  if (!configObj || configObj.orchestration)
    return;
  const declared = configObj.capabilities ?? {};
  const inferable = ["gateway", "database"].filter((name) => typeof declared[name] !== "boolean");
  if (inferable.length === 0)
    return;
  let needs;
  try {
    const { resources } = discoverResourcesWithProblems(projectRoot);
    if (resources.length === 0)
      return;
    needs = evaluatePlatformServiceNeeds(resources);
  } catch {
    return;
  }
  for (const name of inferable) {
    if (!needs[name].isNeeded)
      caps[name] = false;
  }
}
function projectNeedsDatabaseKeys(projectRoot) {
  const configObj = readProjectJson(projectRoot);
  if (!configObj || configObj.orchestration)
    return true;
  const declared = configObj.capabilities ?? {};
  if (declared.database === true)
    return true;
  try {
    const { resources, problems } = discoverResourcesWithProblems(projectRoot);
    if (problems.length > 0)
      return true;
    return needsDatabaseKeys(resources);
  } catch {
    return true;
  }
}
function resolveProjectCapabilities(projectRootOrConfig, options) {
  const caps = { ...DEFAULT_CAPABILITIES };
  let configObj;
  let projectRoot;
  if (typeof projectRootOrConfig === "string") {
    projectRoot = projectRootOrConfig;
    configObj = readProjectJson(projectRootOrConfig);
  } else if (projectRootOrConfig && typeof projectRootOrConfig === "object") {
    configObj = projectRootOrConfig;
  } else {
    projectRoot = findProjectRoot();
    if (projectRoot)
      configObj = readProjectJson(projectRoot);
  }
  applyBooleans(caps, configObj?.capabilities);
  if (projectRoot)
    applyUnusedPlatformServices(caps, configObj, projectRoot);
  if (typeof projectRootOrConfig === "object" && projectRootOrConfig !== null) {
    for (const [key, val] of Object.entries(projectRootOrConfig)) {
      if (val === false && key in caps)
        caps[key] = false;
    }
  }
  applyFlags(caps, options);
  return caps;
}
function isCapabilityEnabled(projectRootOrConfig, capabilityName, options) {
  return resolveProjectCapabilities(projectRootOrConfig, options)[capabilityName] !== false;
}
function isDatabaseCapabilityEnabled(projectRootOrConfig, options) {
  return isCapabilityEnabled(projectRootOrConfig, "database", options);
}
function isGatewayEnabled(projectRootOrConfig, options) {
  return isCapabilityEnabled(projectRootOrConfig, "gateway", options);
}
function getEnabledCapabilities(projectRootOrConfig, options) {
  const caps = resolveProjectCapabilities(projectRootOrConfig, options);
  return Object.keys(caps).filter((name) => caps[name] === true);
}
function assertGatewayOptOutIsConfigured(projectRoot) {
  if (projectRoot && !isGatewayEnabled(projectRoot))
    return;
  throw new FliskError("--no-gateway needs the gateway turned off in .flisk/project.json; the flag alone does not change the generated files.", [
    'Set "capabilities": { "gateway": false } in .flisk/project.json',
    "Run flisk config regenerate, then flisk up"
  ]);
}
function disableDatabaseCapability(projectRoot) {
  const file = join(projectRoot, ".flisk", PROJECT_JSON);
  const config = readProjectJson(projectRoot);
  if (!config)
    return false;
  const current = config.capabilities;
  const caps = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  if (caps.database === false)
    return false;
  config.capabilities = { ...caps, database: false };
  writeJsonFile(file, config);
  return true;
}
function describePlatformServices(projectRoot, resources, options) {
  const caps = resolveProjectCapabilities(projectRoot ?? void 0, options);
  const declared = (projectRoot ? readProjectJson(projectRoot)?.capabilities : void 0) ?? {};
  const needs = evaluatePlatformServiceNeeds(resources);
  const labels = { gateway: "router (Traefik)", database: "PostgreSQL" };
  return ["gateway", "database"].map((capability) => {
    const isEnabled = caps[capability] !== false;
    const setting = `capabilities.${capability} in .flisk/project.json`;
    let reason;
    if (declared[capability] === false)
      reason = `off: ${setting} is false`;
    else if (!isEnabled && needs[capability].isNeeded)
      reason = "off: turned off by a flag";
    else if (declared[capability] === true)
      reason = `on: ${setting} is true`;
    else if (!isEnabled)
      reason = `off: ${needs[capability].reason}`;
    else if (resources.length === 0)
      reason = "on: default, the project has no resources yet";
    else
      reason = `on: ${needs[capability].reason}`;
    return {
      capability,
      name: labels[capability],
      isEnabled,
      users: needs[capability].users,
      reason
    };
  });
}

export {
  PLATFORM_STANDARDS,
  writeFilesWithProgress,
  writeJsonFile,
  writeTextFile,
  ensureDirectory,
  ensureGitignore,
  isInsideGitWorkTree,
  ensureSmokeRecordsIgnored,
  projectNeedsDatabaseKeys,
  isDatabaseCapabilityEnabled,
  isGatewayEnabled,
  getEnabledCapabilities,
  assertGatewayOptOutIsConfigured,
  disableDatabaseCapability,
  describePlatformServices
};
