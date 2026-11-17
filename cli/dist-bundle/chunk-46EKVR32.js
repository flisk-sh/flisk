import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  findFreePort
} from "./chunk-VHYGQC6J.js";
import {
  tiltAnswerIsForeign
} from "./chunk-IGNCJRWD.js";
import {
  enableDiscoveredStacks,
  writeDefaultProjectConfig
} from "./chunk-BHIICSIU.js";
import {
  buildStartupReport,
  explainFailures,
  formatStartupReport,
  formatWaitFailures,
  isStartupStalled,
  lastLines,
  machineProblemFixes,
  withLoggedReasons
} from "./chunk-DLM3GIFT.js";
import {
  attachedUpInCiWarning,
  findPortContainer,
  findPortOccupant,
  runNativeUp,
  upFailureHints
} from "./chunk-AD3ZB2GJ.js";
import {
  findAvailablePort
} from "./chunk-BH74SJOW.js";
import {
  DEVCONTAINER_DOCKER_FIX,
  WEBCONTAINER_UP_MESSAGE,
  detectHost,
  isContainerHost
} from "./chunk-MP4WL74Z.js";
import {
  cloneMissingRepos,
  defaultGitRunner,
  redactRepoUrl,
  validateRepoUrl
} from "./chunk-AQDZHQMD.js";
import {
  evaluateTiltReadiness,
  getDisabledHealthResourceNames,
  healthProbeCannotRun,
  isAdvisoryResource,
  tiltGetUiResources,
  tiltResourceLogs,
  waitForTiltResourcesReady
} from "./chunk-RD63MOSC.js";
import {
  alreadyRunningReport,
  effectiveRuntimeStatus,
  findStaleDisabledResources,
  getDeferredResourceNames,
  isUnhealthyButRunning,
  parseTiltPort,
  resolveTiltPort,
  secondUpAction,
  stopTiltForUp,
  summarizeTiltBuildError,
  waitForTiltPortsToStop
} from "./chunk-KHTVPPO5.js";
import {
  nativeWindowsStackRefusal
} from "./chunk-5L7YRPQH.js";
import {
  createJsonEmitter,
  findForeignContainerOwners,
  pruneSupersededTiltImages,
  upOwnerRefusal
} from "./chunk-XZMNCFVC.js";
import {
  inferNodeProject,
  inferredStateRoot
} from "./chunk-YJYXSQUB.js";
import {
  defaultDockerRunner,
  diskWarningField,
  enforceBuildCacheCeiling,
  enforceDiskGuard,
  readDockerVmFreeGib
} from "./chunk-X45DIH6R.js";
import {
  hasNearbyServiceJson
} from "./chunk-OKFJRRFZ.js";
import {
  projectNameAt,
  recordProjectRoot
} from "./chunk-ICMIEDFD.js";
import {
  enforceFliskVersionGate
} from "./chunk-MQQVFK7Q.js";
import {
  enforceServiceConfigGate,
  warnModelRunner,
  warnSchemaVersions,
  warnSecretConflicts
} from "./chunk-OOCPRNQ4.js";
import {
  ProjectConfigNotFoundError,
  areMasterFilesStale,
  ensureGeneratedRootIgnored,
  ensureProjectRuntimeAssets,
  generateMasterConfigs,
  isTiltfileOrchestration,
  isVendoredEngineStale,
  isWrappedTiltfileStale,
  readProjectConfig,
  verifyMasterConfigs
} from "./chunk-RYTYYP36.js";
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  exportHostPortPlan,
  formatHostPortPlan,
  getHostPortPlan,
  isHostPortAvailable,
  readSavedTiltPort,
  writeSavedHostPortPlan
} from "./chunk-SYTFMWWH.js";
import {
  findProjectTiltPorts,
  findTiltPortOwner,
  isOwnTilt,
  stopOwnedTiltOnPort,
  stopTiltOnPort
} from "./chunk-KT6PYS2C.js";
import {
  databaseResourceNames,
  evaluateSharedPlatformPostgres,
  namesSharedPlatformPostgres
} from "./chunk-LJHNJFBB.js";
import {
  assertGatewayOptOutIsConfigured,
  disableDatabaseCapability,
  ensureSmokeRecordsIgnored,
  isDatabaseCapabilityEnabled,
  isGatewayEnabled,
  projectNeedsDatabaseKeys
} from "./chunk-BH5IJ6AV.js";
import {
  handleDryRun
} from "./chunk-MJGDAK6E.js";
import {
  toMachineError
} from "./chunk-3SNMUNQF.js";
import {
  EnvFileError,
  OUTPUT_WITHHELD,
  PROJECT_ENV_FILE_VAR,
  SERVICE_MANIFEST_SCHEMA_VERSION,
  appendHealthPath,
  applyEnvFileSelection,
  assertEngineSupportsEnvFile,
  buildSmokePlans,
  completeEnvFile,
  dependencyEdges,
  dependsOnOf,
  discoverResourcesFromRoot,
  discoverResourcesStrict,
  discoverResourcesWithProblems,
  discoverServiceManifestPaths,
  discoverStacks,
  ensureGeneratedSecrets,
  envFileWarning,
  formatMixedRuntimeRefusal,
  formatSmokeFailure,
  getResourcesForStack,
  isNativeProject,
  isNativeService,
  isRoutableService,
  isRoutedBringYourOwn,
  isWebUiBringYourOwn,
  projectSecretValues,
  redactLogLines,
  redactProjectText,
  resolveRuntimeMode,
  resolveServiceUrl,
  resolveSubdomainBases,
  routesAsApi,
  runSmokePlans,
  safeSmokeDeps,
  selectEnvFile,
  stackExists,
  unknownBackendNames,
  warnAboutSkippedFiles,
  writeTextFileAtomic
} from "./chunk-2BH5UW2N.js";
import {
  formatCount
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  STANDARD_PORTS,
  buildTiltUpArgs,
  errorFactories,
  findProjectRoot,
  getErrorMessage,
  getPackageVersion,
  requireProjectBeforeDocker,
  requireProjectRoot,
  runCommand,
  runTilt,
  showError,
  showErrorAndExit,
  source_default,
  withTiltCheck
} from "./chunk-73W4Y4TI.js";

// dist/commands/up.js
import { existsSync as existsSync3 } from "node:fs";
import { connect } from "node:net";
import { join as join4 } from "node:path";
import { Command } from "commander";

// dist/utils/cold-start.js
var NO_IMAGE_APP_TYPES = /* @__PURE__ */ new Set(["library", "sdk", "bring-your-own"]);
function countBuiltImages(services) {
  return services.filter((service) => {
    const appType = service.config?.appType ?? service.type;
    if (appType && NO_IMAGE_APP_TYPES.has(appType))
      return false;
    return !service.config?.image;
  }).length;
}
function projectImageFilters(projectName, services) {
  const project = projectName.toLowerCase().replaceAll("-", "_");
  const stacks = [...new Set(services.map((s) => s.stack).filter((s) => Boolean(s)))];
  if (stacks.length === 0)
    return [`${project}_*`];
  return stacks.flatMap((stack) => [`${project}_${stack}_*`, `${project}_${stack}-db-migrator`]);
}
async function isColdStart(filters, run = defaultDockerRunner) {
  if (filters.length === 0)
    return false;
  try {
    const args = ["images", "-q", ...filters.flatMap((f) => ["--filter", `reference=${f}`])];
    const stdout = await run(args);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}
function formatColdStartNotice(imageCount) {
  const images = imageCount === 1 ? "1 image" : `${imageCount} images`;
  return `First start: building ${images} from scratch. This takes a few minutes; later starts reuse the cache.`;
}
async function coldStartNotice(projectName, services, run = defaultDockerRunner) {
  const imageCount = countBuiltImages(services);
  if (imageCount === 0)
    return null;
  const isCold = await isColdStart(projectImageFilters(projectName, services), run);
  return isCold ? formatColdStartNotice(imageCount) : null;
}

// dist/utils/model-preflight.js
import { spawnSync } from "node:child_process";
var DEFAULT_MODEL_PULL_RETRIES = 3;
var DEFAULT_MODEL_PULL_DELAY_MS = 5e3;
function resolveModelReference(rawModel, lookupEnv = (name) => process.env[name]) {
  const trimmed = rawModel.trim();
  if (!trimmed.startsWith("${") || !trimmed.endsWith("}")) {
    return trimmed;
  }
  const inner = trimmed.slice(2, -1);
  const colonDash = inner.indexOf(":-");
  if (colonDash !== -1) {
    const varName = inner.slice(0, colonDash);
    const fallback = inner.slice(colonDash + 2);
    const val2 = lookupEnv(varName);
    return val2 !== void 0 && val2.trim() !== "" ? val2.trim() : fallback.trim();
  }
  const dash = inner.indexOf("-");
  if (dash !== -1) {
    const varName = inner.slice(0, dash);
    const fallback = inner.slice(dash + 1);
    const val2 = lookupEnv(varName);
    return val2 !== void 0 ? val2.trim() : fallback.trim();
  }
  const val = lookupEnv(inner);
  return val ? val.trim() : "";
}
function collectRequiredModels(resources, lookupEnv = (name) => process.env[name]) {
  const models = /* @__PURE__ */ new Set();
  for (const resource of resources) {
    const serviceModels = resource.config?.models;
    if (!Array.isArray(serviceModels))
      continue;
    for (const entry of serviceModels) {
      if (!entry || typeof entry.model !== "string")
        continue;
      const resolved = resolveModelReference(entry.model, lookupEnv);
      if (resolved) {
        models.add(resolved);
      }
    }
  }
  return [...models];
}
function defaultExec(command, args) {
  const res = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: 6e5,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error
  };
}
function defaultSleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function pullModelWithRetries(model, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MODEL_PULL_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_MODEL_PULL_DELAY_MS;
  const exec = options.exec ?? defaultExec;
  const sleep = options.sleep ?? defaultSleep;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onAttempt?.({ model, attempt, maxAttempts });
    try {
      const res = exec("docker", ["model", "pull", model]);
      if (res.status === 0 && !res.error) {
        options.onSuccess?.({ model, attempt });
        return { ok: true, model, attempts: attempt };
      }
      const rawError = (res.stderr || res.stdout || res.error?.message || "").trim();
      lastError = rawError || `docker model pull exited with code ${res.status ?? "unknown"}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < maxAttempts) {
      options.onRetry?.({
        model,
        attempt,
        maxAttempts,
        delayMs: retryDelayMs,
        error: lastError
      });
      await sleep(retryDelayMs);
    }
  }
  return { ok: false, model, attempts: maxAttempts, error: lastError };
}
async function runModelPreflight(models, options = {}) {
  const pulled = [];
  for (const model of models) {
    const res = await pullModelWithRetries(model, options);
    if (!res.ok) {
      return {
        ok: false,
        failedModel: res.model,
        attempts: res.attempts,
        error: res.error
      };
    }
    pulled.push(model);
  }
  return { ok: true, pulled };
}

// dist/utils/port-claims.js
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
var PORT_CLAIM_TTL_MS = 12e4;
function defaultClaimDir() {
  return path.join(tmpdir(), "flisk-port-claims");
}
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function readClaim(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed.pid === "number" && typeof parsed.owner === "string" && typeof parsed.at === "number") {
      return { pid: parsed.pid, owner: parsed.owner, at: parsed.at };
    }
  } catch {
  }
  return null;
}
function createPortClaimer(owner, options = {}) {
  const dir = options.dir ?? defaultClaimDir();
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const alive = options.isProcessAlive ?? processIsAlive;
  const ttl = options.ttlMs ?? PORT_CLAIM_TTL_MS;
  const record = () => JSON.stringify({ pid, owner, at: now() });
  return (port) => {
    const file = path.join(dir, `${port}.json`);
    try {
      mkdirSync(dir, { recursive: true });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          writeFileSync(file, record(), { flag: "wx" });
          return true;
        } catch (error) {
          if (error.code !== "EEXIST")
            throw error;
        }
        const held = readClaim(file);
        if (held?.owner === owner) {
          writeFileSync(file, record());
          return true;
        }
        const stale = held === null || now() - held.at > ttl || !alive(held.pid);
        if (!stale)
          return false;
        try {
          unlinkSync(file);
        } catch {
        }
      }
      return false;
    } catch {
      return true;
    }
  };
}

// dist/utils/port-fallback-notice.js
var PORT_KEYS = [
  { key: "ingressHttp", label: "HTTP", env: "FLISK_HTTP_PORT" },
  { key: "ingressHttps", label: "HTTPS", env: "FLISK_HTTPS_PORT" },
  { key: "postgres", label: "Postgres", env: "FLISK_POSTGRES_PORT" }
];
function formatPortFallbackNotice(plan) {
  const lines = [];
  for (const { key, label, env } of PORT_KEYS) {
    const requested = plan.requested[key];
    const chosen = plan[key];
    if (plan.explicit[key] || chosen === requested)
      continue;
    lines.push(`${label}: wanted ${requested}, using ${chosen} (${plan.reason[key]}). To force ${requested}: ${env}=${requested} flisk up`);
  }
  return lines;
}

// dist/utils/profiles.js
function profilesOf(resource) {
  const raw = resource.config?.profiles;
  return Array.isArray(raw) ? raw.filter((name) => typeof name === "string" && name.length > 0) : [];
}
function applyProfiles(resources, activeProfiles = [], requested = []) {
  const active = new Set(activeProfiles);
  const named = new Set(requested);
  const kept = [];
  const skipped = [];
  for (const resource of resources) {
    const profiles = profilesOf(resource);
    if (profiles.length === 0 || named.has(resource.name) || profiles.some((p) => active.has(p))) {
      kept.push(resource);
    } else {
      skipped.push({ name: resource.name, profiles });
    }
  }
  return { kept, skipped };
}
function declaredProfiles(resources) {
  return [...new Set(resources.flatMap(profilesOf))].sort();
}
function describeSkipped(skipped) {
  return skipped.map(({ name, profiles }) => `${name} (${profiles.length === 1 ? "profile" : "profiles"} ${profiles.join(", ")})`).join(", ");
}

// dist/utils/schema-version-gate.js
import { relative, sep } from "node:path";
function enforceSchemaVersionGate(projectRoot, options = {}, exit = process.exit) {
  let resources;
  if (options.resources) {
    resources = options.resources;
  } else {
    try {
      resources = discoverResourcesFromRoot(projectRoot);
    } catch {
      return;
    }
  }
  const unsupported = resources.flatMap((resource) => {
    const version = resource.config?.schemaVersion;
    if (version === void 0 || version === SERVICE_MANIFEST_SCHEMA_VERSION)
      return [];
    const rel = relative(projectRoot, resource.configPath) || resource.configPath;
    const file = rel.split(sep).join("/");
    return [
      `${file} schemaVersion ${JSON.stringify(version)}: this flisk supports ${SERVICE_MANIFEST_SCHEMA_VERSION}`
    ];
  });
  if (unsupported.length === 0)
    return;
  const verb = unsupported.length === 1 ? "declares" : "declare";
  const message = `${formatCount(unsupported.length, "service.json file")} ${verb} a schemaVersion this flisk does not support:
    ${unsupported.join("\n    ")}`;
  const fix = "Upgrade flisk to a version that supports these files. Changing schemaVersion by hand is not a fix";
  options.onInvalid?.(`${message}
Fix: ${fix}`);
  console.error(source_default.red(`\u2717 ${message}`));
  console.error(source_default.gray(`  Fix: ${fix}`));
  exit(1);
}

// dist/utils/up-fast-noop.js
import { createHash } from "node:crypto";
import { existsSync, mkdirSync as mkdirSync2, readdirSync, readFileSync as readFileSync2, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep as sep2 } from "node:path";

// dist/utils/url-check.js
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
var URL_PROBE_TIMEOUT_MS = 3e3;
var URL_CHECK_DEADLINE_MS = 15e3;
var URL_SLOW_DEADLINE_MS = 6e4;
var URL_CHECK_INTERVAL_MS = 500;
var URL_CHECK_CONCURRENCY = 8;
var BODY_SAMPLE_BYTES = 512;
var TRAEFIK_NOT_FOUND = "404 page not found";
var TRAEFIK_GATEWAY_BODIES = {
  502: ["Bad Gateway"],
  503: ["Service Unavailable", "no available server"],
  504: ["Gateway Timeout"]
};
function buildPrintedUrlTargets(resources, ingressPort, deferred = /* @__PURE__ */ new Set()) {
  const targets = [];
  for (const resource of resources) {
    if (deferred.has(resource.name))
      continue;
    const url = resolveServiceUrl(resource, ingressPort);
    if (!url)
      continue;
    const port = resource.config?.port;
    targets.push({ service: resource.name, url, ...port ? { port } : {} });
    const healthUrl = printedHealthUrl(resource, url);
    if (healthUrl)
      targets.push({ service: resource.name, url: healthUrl, ...port ? { port } : {} });
  }
  return targets;
}
function healthUrlOf(url) {
  try {
    const parsed = new URL(url);
    const path2 = parsed.pathname.replace(/\/+$/, "");
    if (!path2.endsWith("/health"))
      parsed.pathname = `${path2}/health`;
    return parsed.toString();
  } catch {
    return url.endsWith("/health") ? url : `${url.replace(/\/+$/, "")}/health`;
  }
}
function printedHealthUrl(resource, url) {
  if (!isRoutedBringYourOwn(resource))
    return healthUrlOf(url);
  const path2 = resource.config?.healthCheckPath;
  if (!path2 || path2 === "/")
    return null;
  try {
    const parsed = new URL(url);
    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/${path2.replace(/^\/+/, "")}`;
    return parsed.toString();
  } catch {
    return null;
  }
}
function isLocalGatewayUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
  } catch {
    return false;
  }
}
function classifyProbe(probe, url) {
  const { status } = probe;
  if (status === void 0) {
    if (probe.error === "timeout")
      return { didAnswer: false, cause: "timeout" };
    if (probe.error === "ECONNREFUSED" && (url === void 0 || isLocalGatewayUrl(url))) {
      return { didAnswer: false, cause: "gateway-not-listening" };
    }
    return { didAnswer: false, cause: "no-response" };
  }
  const body = (probe.body ?? "").trim();
  if (status === 404 && body === TRAEFIK_NOT_FOUND) {
    return { didAnswer: false, cause: "route-not-found" };
  }
  if (TRAEFIK_GATEWAY_BODIES[status]?.includes(body)) {
    return { didAnswer: false, cause: "port-not-listening" };
  }
  return { didAnswer: true };
}
var LOG_LEVEL_WORDS = /* @__PURE__ */ new Set([
  "ERROR",
  "WARN",
  "WARNING",
  "INFO",
  "DEBUG",
  "FATAL",
  "HTTP",
  "GET",
  "POST"
]);
var MISSING_ENV_LOG_LINES = 40;
function findMissingEnvName(logs) {
  const lines = logs.split(/\r?\n/).slice(-MISSING_ENV_LOG_LINES);
  const tail = lines.join("\n");
  const patterns = [
    // "Missing required environment variable: DATABASE_URL", "missing env var API_KEY"
    /\b(?:missing|undefined|unset)\s+(?:required\s+)?(?:environment|env)\s+(?:variable|var)s?\s*:?\s*['"`]?([A-Za-z_][A-Za-z0-9_]*)/i,
    // "environment variable API_KEY is not set", "env var X must be set"
    /\b(?:environment|env)\s+(?:variable|var)\s+['"`]?([A-Za-z_][A-Za-z0-9_]*)['"`]?\s+(?:is\s+)?(?:missing|not set|required|undefined|unset|must be set)/i,
    // "API_KEY is not set", "DATABASE_URL is required", "SECRET must be set"
    /\b([A-Z][A-Z0-9_]{2,})['"`]?\s+(?:is\s+)?(?:not set|required|missing|undefined|must be set)\b/
  ];
  for (const pattern of patterns) {
    const lines2 = tail.split("\n").reverse();
    for (const line of lines2) {
      const name = pattern.exec(line)?.[1];
      if (name && !LOG_LEVEL_WORDS.has(name.toUpperCase()))
        return name;
    }
  }
  if (/\benviron\b/.test(tail)) {
    for (const line of [...lines].reverse()) {
      const name = /KeyError:\s*['"]([A-Z][A-Z0-9_]+)['"]/.exec(line)?.[1];
      if (name)
        return name;
    }
  }
  return null;
}
function describeUrlFailure(target, failure) {
  const { service } = target;
  const logs = `flisk logs -s ${service}`;
  switch (failure.cause) {
    case "missing-env":
      return {
        message: `the latest logs of ${service} say the environment variable ${failure.envName ?? "(unnamed)"} is not set`,
        nextCommand: `add ${failure.envName ?? "it"}=<value> to .env, then run: flisk restart ${service} --rebuild`
      };
    case "container-exited":
      return {
        message: `${service} exited after it started, so nothing answers this URL`,
        nextCommand: logs
      };
    case "port-not-listening":
      return {
        message: `Traefik has the route but got no answer from ${service} (Traefik's own HTTP ${failure.status ?? 502}): likely nothing listens on ${target.port ? `port ${target.port}` : "the declared port"}, or the app listens only on 127.0.0.1`,
        nextCommand: logs
      };
    case "route-not-found":
      return {
        message: `Traefik has no route for this URL (its own 404), so the request never reaches ${service}`,
        nextCommand: "flisk networks"
      };
    case "gateway-not-listening":
      return {
        message: "Nothing listens on the gateway port: Traefik is not running or is bound to another port (on Colima, the VM may have stopped forwarding ports: colima restart)",
        nextCommand: "flisk doctor"
      };
    case "timeout":
      return {
        message: `No response from ${service} within ${URL_PROBE_TIMEOUT_MS / 1e3}s`,
        nextCommand: logs
      };
    case "no-response":
      return {
        message: failure.error === "incomplete response" ? `The connection closed before the whole response from ${service} arrived` : `The request failed${failure.error ? ` (${failure.error})` : ""}; check the host and port of this URL`,
        nextCommand: "flisk doctor"
      };
  }
}
async function checkPrintedUrls(targets, options = {}) {
  const probe = options.probe ?? probeUrl;
  const timeoutMs = options.timeoutMs ?? URL_PROBE_TIMEOUT_MS;
  const deadlineMs = options.deadlineMs ?? URL_CHECK_DEADLINE_MS;
  const intervalMs = options.intervalMs ?? URL_CHECK_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve2) => setTimeout(resolve2, ms)));
  const now = options.now ?? Date.now;
  const slowDeadlineMs = options.slowDeadlineMs ?? URL_SLOW_DEADLINE_MS;
  const startedAt = now();
  let deadline = startedAt + deadlineMs;
  const results = /* @__PURE__ */ new Map();
  let pending = targets.map((target, index) => ({ target, index }));
  for (let attempt = 0; pending.length > 0; attempt++) {
    const left = deadline - now();
    if (attempt > 0 && left <= 0)
      break;
    const budget = Math.max(1, Math.min(timeoutMs, left));
    const probed = await mapWithConcurrency(pending, options.concurrency ?? URL_CHECK_CONCURRENCY, async (entry) => ({ ...entry, result: await probe(entry.target.url, budget) }));
    for (const { index, result } of probed)
      results.set(index, result);
    pending = probed.filter(({ target, result }) => !classifyProbe(result, target.url).didAnswer).map(({ target, index }) => ({ target, index }));
    if (pending.some(({ index }) => results.get(index)?.error === "timeout")) {
      deadline = Math.max(deadline, startedAt + slowDeadlineMs);
    }
    const remaining = deadline - now();
    if (pending.length === 0 || remaining <= 0)
      break;
    await sleep(Math.min(intervalMs, remaining));
  }
  const diagnosed = /* @__PURE__ */ new Map();
  const diagnose = (service) => {
    let found = diagnosed.get(service);
    if (!found) {
      found = diagnoseService(service, options.diagnosis ?? {});
      diagnosed.set(service, found);
    }
    return found;
  };
  return Promise.all(targets.map(async (target, index) => {
    const result = results.get(index) ?? { error: "not probed" };
    const classified = classifyProbe(result, target.url);
    const base = {
      service: target.service,
      url: target.url,
      didAnswer: classified.didAnswer,
      ...result.status !== void 0 ? { status: result.status } : {}
    };
    if (classified.didAnswer || !classified.cause)
      return base;
    const fromService = classified.cause === "gateway-not-listening" ? null : await diagnose(target.service);
    const cause = fromService?.cause ?? classified.cause;
    const envName = fromService?.envName;
    const { message, nextCommand } = describeUrlFailure(target, {
      cause,
      status: result.status,
      envName,
      error: result.error
    });
    return { ...base, cause, message, nextCommand, ...envName ? { envName } : {} };
  }));
}
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
async function diagnoseService(service, deps) {
  const logs = deps.logs ? await deps.logs(service).catch(() => null) : null;
  const envName = logs ? findMissingEnvName(logs) : null;
  if (envName)
    return { cause: "missing-env", envName };
  const hasExited = deps.hasExited ? await deps.hasExited(service).catch(() => null) : null;
  if (hasExited)
    return { cause: "container-exited" };
  return null;
}
function formatUrlFailures(checks) {
  const failed = checks.filter((check) => !check.didAnswer);
  if (failed.length === 0)
    return [];
  const lines = [
    `Not ready: ${failed.length} of ${checks.length} printed URL${checks.length === 1 ? "" : "s"} ${failed.length === 1 ? "does" : "do"} not answer.`
  ];
  for (const check of failed) {
    lines.push(`  \u2717 ${check.service}: ${check.url}`);
    if (check.message)
      lines.push(`      likely cause: ${check.message}`);
    if (check.nextCommand)
      lines.push(`      next:  ${check.nextCommand}`);
  }
  return lines;
}
function urlFailureSuggestions(checks) {
  const next = checks.filter((check) => !check.didAnswer && check.nextCommand).map((check) => `${check.service}: ${check.nextCommand}`);
  return [...new Set(next), "Tilt is still running; stop it with: flisk down"];
}
function tiltResourceHasExited(uiResourcesJson, service) {
  try {
    const parsed = JSON.parse(uiResourcesJson);
    const item = parsed.items?.find((entry) => entry.metadata?.name === service);
    if (!item)
      return null;
    return item.status?.runtimeStatus === "error";
  } catch {
    return null;
  }
}
function probeUrl(url, timeoutMs) {
  return new Promise((resolve2) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve2({ error: "invalid URL" });
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const hostname = parsed.hostname;
    const isLoopbackName = hostname === "localhost" || hostname.endsWith(".localhost");
    const request = isHttps ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (probe) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      resolve2(probe);
    };
    const req = request({
      protocol: parsed.protocol,
      hostname: isLoopbackName ? "127.0.0.1" : hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method: "GET",
      headers: { Host: parsed.host, "User-Agent": "flisk-up-url-check" },
      // The certificate is checked as usual; one that does not verify is a request error (no-response), not an answer.
      ...isHttps ? { servername: hostname } : {}
    }, (res) => {
      const chunks = [];
      let size = 0;
      let isSampled = false;
      const answer = () => finish({
        status: res.statusCode,
        body: Buffer.concat(chunks).subarray(0, BODY_SAMPLE_BYTES).toString("utf-8")
      });
      res.on("data", (chunk) => {
        if (size < BODY_SAMPLE_BYTES) {
          chunks.push(chunk);
          size += chunk.length;
        }
        if (size >= BODY_SAMPLE_BYTES && !isSampled) {
          isSampled = true;
          answer();
          res.destroy();
        }
      });
      res.on("end", answer);
      const cutOff = () => {
        if (res.complete)
          answer();
        else
          finish({ error: "incomplete response" });
      };
      res.on("close", cutOff);
      res.on("error", cutOff);
    });
    const timer = setTimeout(() => {
      req.destroy();
      finish({ error: "timeout" });
    }, timeoutMs);
    req.on("error", (err) => finish({ error: err.code ?? err.message }));
    req.end();
  });
}

// dist/utils/up-fast-noop.js
var UP_STATE_VERSION = 1;
var UP_STATE_FILE = "up-state.json";
var STACK_ENV_VARS = [
  "AUTO_DISCOVER",
  "FLISK_DISK_MIN_GIB",
  "FLISK_DISK_WARN_GIB",
  "FLISK_ENV_FILE",
  "FLISK_EXTENSION_PATH",
  "FLISK_EXTENSION_SOURCE",
  "FLISK_HTTP_PORT",
  "FLISK_HTTPS_PORT",
  "FLISK_LICENSE_KEY",
  "FLISK_POSTGRES_PORT",
  "FLISK_SERVICE_BASE_URL",
  "TILT_PORT"
];
function statePathFor(projectRoot, home = homedir()) {
  let canonical = projectRoot;
  try {
    canonical = realpathSync(projectRoot);
  } catch {
  }
  const slug = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return join(home, ".flisk", "project-up", `${slug}.json`);
}
function readFastNoopState(projectRoot) {
  try {
    const value = JSON.parse(readFileSync2(statePathFor(projectRoot), "utf-8"));
    if (value.version !== UP_STATE_VERSION || typeof value.fingerprint !== "string" || !Number.isInteger(value.tiltPort) || !(value.tiltPid === null || Number.isInteger(value.tiltPid)) || !Array.isArray(value.services) || !Array.isArray(value.urls)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
function writeFastNoopState(projectRoot, state) {
  try {
    const path2 = statePathFor(projectRoot);
    mkdirSync2(join(path2, ".."), { recursive: true });
    writeTextFileAtomic(path2, `${JSON.stringify(state, null, 2)}
`);
  } catch {
  }
}
function clearFastNoopState(projectRoot) {
  try {
    rmSync(statePathFor(projectRoot), { force: true });
  } catch {
  }
}
function contentOrMissing(file) {
  try {
    return readFileSync2(file, "utf-8");
  } catch {
    return "\0missing";
  }
}
function hashFiles(hash, files, projectRoot) {
  for (const file of [...files].sort()) {
    hash.update(file.slice(projectRoot.length).split(sep2).join("/")).update("\0");
    hash.update(contentOrMissing(file)).update("\0");
  }
}
function stackFingerprint(projectRoot, flags) {
  const hash = createHash("sha256");
  hash.update(`flisk:${getPackageVersion()}:${UP_STATE_VERSION}\0`);
  hashFiles(hash, [
    join(projectRoot, ".flisk", "project.json"),
    join(projectRoot, ".env"),
    join(projectRoot, ".tiltignore"),
    join(projectRoot, "package.json"),
    ...discoverServiceManifestPaths(projectRoot)
  ], projectRoot);
  const generatedDir = join(projectRoot, ".flisk", ".flisk-out");
  if (!existsSync(join(generatedDir, "Tiltfile")))
    return null;
  const generatedFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "host-ports.json" || entry.name === UP_STATE_FILE)
        continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory())
        walk(file);
      else if (entry.isFile())
        generatedFiles.push(file);
    }
  };
  walk(generatedDir);
  hashFiles(hash, generatedFiles, projectRoot);
  const generatedServiceFiles = [];
  for (const manifest of discoverServiceManifestPaths(projectRoot)) {
    const dir = join(manifest, "..", ".autogenerated");
    if (!existsSync(dir))
      continue;
    const collect = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const file = join(current, entry.name);
        if (entry.isDirectory())
          collect(file);
        else if (entry.isFile() && !/\.prebuild(\.dockerignore)?$/.test(entry.name)) {
          generatedServiceFiles.push(file);
        }
      }
    };
    collect(dir);
  }
  hashFiles(hash, generatedServiceFiles, projectRoot);
  for (const name of STACK_ENV_VARS) {
    const value = flags.env[name];
    if (value !== void 0)
      hash.update(`${name}=${value}\0`);
  }
  return hash.digest("hex");
}
function fastNoopUrls(resources, ingressPort, gatewayEnabled) {
  if (!gatewayEnabled)
    return [];
  return resources.flatMap((resource) => {
    const url = resolveServiceUrl(resource, ingressPort);
    return url ? [url] : [];
  });
}
function isPlainUp(flags) {
  return !flags.force && !flags.dryRun && !flags.ignoreDrift && !flags.ignoreVersion && !flags.only?.length && flags.envFile === void 0 && !flags.profile?.length && flags.database !== false && flags.gateway !== false && flags.stackName === void 0;
}
var defaultDeps = {
  readState: readFastNoopState,
  fingerprint: stackFingerprint,
  tiltJson: tiltGetUiResources,
  ownerOf: findTiltPortOwner,
  masterStale: areMasterFilesStale,
  wrappedStale: isWrappedTiltfileStale,
  vendoredStale: isVendoredEngineStale,
  drift: (root, resources) => {
    try {
      return verifyMasterConfigs(root, {
        manifestPaths: resources.map((r) => r.configPath),
        skipManifestValidation: true
      }).handEdited;
    } catch {
      return ["unverifiable"];
    }
  },
  discovery: discoverResourcesWithProblems,
  staleDisabled: findStaleDisabledResources,
  readiness: evaluateTiltReadiness,
  deferred: getDeferredResourceNames,
  checkUrls: (targets) => checkPrintedUrls(targets, { deadlineMs: URL_PROBE_TIMEOUT_MS })
};
async function tryFastNoop(projectRoot, flags, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const state = d.readState(projectRoot);
  if (!state || !isPlainUp(flags))
    return null;
  if (flags.configuredTiltPort !== void 0 && flags.configuredTiltPort !== state.tiltPort) {
    return null;
  }
  const fingerprint = d.fingerprint(projectRoot, flags);
  if (!fingerprint || fingerprint !== state.fingerprint)
    return null;
  const owner = d.ownerOf(state.tiltPort);
  if (!isOwnTilt(owner, projectRoot) || owner === null || state.tiltPid === null || owner.pid !== state.tiltPid) {
    return null;
  }
  if (d.masterStale(projectRoot) || d.wrappedStale(projectRoot) || d.vendoredStale(projectRoot)) {
    return null;
  }
  const discovered = d.discovery(projectRoot);
  if (discovered.problems.length > 0)
    return null;
  const selectedResources = applyProfiles(discovered.resources, [], []).kept;
  if (selectedResources.some(isNativeService))
    return null;
  const services = selectedResources.map((r) => r.name);
  if (services.length === 0 || services.join("\0") !== state.services.join("\0"))
    return null;
  if (d.drift(projectRoot, selectedResources).length > 0)
    return null;
  const json = await d.tiltJson(state.tiltPort);
  if (!json)
    return null;
  let parsed;
  try {
    const root = JSON.parse(json);
    if (root === null || typeof root !== "object" || Array.isArray(root))
      return null;
    parsed = root;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0)
    return null;
  if (parsed.items.some((item) => item === null || typeof item !== "object"))
    return null;
  if (tiltAnswerIsForeign(parsed, new Set(services)))
    return null;
  if (d.staleDisabled(json, projectRoot).length > 0)
    return null;
  const listed = new Set(parsed.items.flatMap((item) => {
    const record = item;
    return record.metadata?.name && record.status?.disableStatus?.state !== "Disabled" ? [record.metadata.name] : [];
  }));
  const deferred = d.deferred(selectedResources);
  if (services.some((name) => deferred.has(name) || !listed.has(name)))
    return null;
  const readiness = d.readiness(json, deferred, void 0, void 0, () => false).result;
  if (!readiness.ready || readiness.failures.length > 0 || readiness.pending > 0)
    return null;
  const urlTargets = state.urls.length > 0 ? buildPrintedUrlTargets(selectedResources, state.ingressPort ?? void 0, deferred) : [];
  let urlChecks = [];
  if (urlTargets.length > 0) {
    urlChecks = await d.checkUrls(urlTargets);
    if (urlChecks.some((check) => !check.didAnswer))
      return null;
  }
  return { ok: true, state, services, urls: state.urls, urlChecks };
}

// dist/utils/up-from-git.js
import { existsSync as existsSync2, readdirSync as readdirSync2 } from "node:fs";
import { join as join2, resolve } from "node:path";
function isGitRepoArg(arg) {
  if (!arg)
    return false;
  return /^(https?|git|ssh|file):\/\//.test(arg) || /^[\w.-]+@[\w.-]+:[^/\\].*$/.test(arg);
}
function repoDirName(url) {
  const name = url.replace(/[?#].*$/, "").replace(/[/\\]+$/, "").split(/[/:\\]/).pop()?.replace(/\.git$/, "");
  if (!name || name === "." || name === "..") {
    throw new FliskError(`Cannot tell a folder name from "${redactRepoUrl(url)}"`, [
      "Clone it yourself with `git clone <url> <dir>`, then run `flisk up` inside it"
    ]);
  }
  return name;
}
async function cloneForUp(url, options = {}) {
  const validation = validateRepoUrl(url);
  if (!validation.valid) {
    throw new FliskError(`Invalid repository URL: ${validation.reason}`);
  }
  const dest = resolve(options.cwd ?? process.cwd(), repoDirName(url));
  const log = options.log ?? (() => {
  });
  if (existsSync2(dest)) {
    if (existsSync2(join2(dest, ".git"))) {
      log(`Using the existing checkout in ${dest}`);
      return dest;
    }
    if (readdirSync2(dest).length > 0) {
      throw new FliskError(`${dest} already exists and is not a git checkout`, [
        "Run `flisk up <url>` from another folder, or remove that folder"
      ]);
    }
  }
  log(`Cloning ${redactRepoUrl(url)} into ${dest}`);
  try {
    await (options.git ?? defaultGitRunner)(["clone", "--depth", "1", "--", url, dest]);
  } catch (error) {
    const detail = String(error.stderr ?? error).trim().split(/\r?\n/)[0];
    throw new FliskError(`git clone failed: ${redactRepoUrl(detail ?? "")}`, [
      "Check the URL and that you can access the repository (`git ls-remote <url>`)"
    ]);
  }
  return dest;
}

// dist/utils/up-only.js
function findUnknownServices(requested, candidates) {
  const known = new Set(candidates.map((resource) => resource.name));
  return requested.filter((name) => !known.has(name));
}
function resolveOnlySelection(requested, all) {
  const edges = dependencyEdges(all);
  const wanted = /* @__PURE__ */ new Set();
  const visit = (name) => {
    if (wanted.has(name) || !edges.has(name))
      return;
    wanted.add(name);
    for (const dep of edges.get(name) ?? [])
      visit(dep);
  };
  for (const name of requested)
    visit(name);
  return {
    selected: all.filter((resource) => wanted.has(resource.name)),
    dependencies: all.map((r) => r.name).filter((n) => wanted.has(n) && !requested.includes(n))
  };
}

// dist/utils/up-progress.js
function failureReason(item, buildFailed) {
  const error = (item.status?.buildHistory?.[0]?.error ?? "").trim();
  if (error)
    return summarizeTiltBuildError(error);
  return buildFailed ? "its build failed" : "it stopped running";
}
function classifyUpProgress(jsonText, deferred) {
  const items = JSON.parse(jsonText).items ?? [];
  const services = [];
  for (const item of items) {
    const name = item.metadata?.name;
    if (!name || name === "(Tiltfile)" || deferred.has(name) || isAdvisoryResource(name))
      continue;
    if (item.status?.disableStatus?.state === "Disabled")
      continue;
    const rawUpdate = item.status?.updateStatus ?? "";
    const update = rawUpdate === "not_applicable" ? "ok" : rawUpdate;
    const runtime = effectiveRuntimeStatus(item.status);
    let state;
    let reason;
    if (update === "error") {
      state = "failed";
      reason = failureReason(item, true);
    } else if (runtime === "error") {
      state = isUnhealthyButRunning(item.status) ? "starting" : "failed";
      if (state === "failed")
        reason = failureReason(item, false);
    } else if (update === "in_progress")
      state = "building";
    else if (update === "ok")
      state = runtime === "pending" || runtime === "none" ? "starting" : "ready";
    else
      state = "waiting";
    services.push(reason ? { name, state, reason } : { name, state });
  }
  return services.sort((a, b) => a.name.localeCompare(b.name));
}
function formatProgressDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1e3));
  if (totalSeconds < 60)
    return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
function formatUpProgressLine(services) {
  const ready = services.filter((service) => service.state === "ready").length;
  const parts = [`${ready}/${services.length} ready`];
  for (const state of ["failed", "building", "starting", "waiting"]) {
    const matching = services.filter((service) => service.state === state);
    if (matching.length === 0)
      continue;
    if (state === "building") {
      const descriptions = matching.map((s) => {
        if (s.buildingDurationMs !== void 0 && s.buildingDurationMs >= 1e3) {
          return `${s.name} (${formatProgressDuration(s.buildingDurationMs)})`;
        }
        return s.name;
      });
      parts.push(`building: ${descriptions.join(", ")}`);
    } else {
      parts.push(`${state}: ${matching.map((s) => s.name).join(", ")}`);
    }
  }
  return parts.join(" \xB7 ");
}
function formatServiceFailedLine(name, reason) {
  const why = reason ? `: ${reason.replace(/[\s.]+$/, "")}` : "";
  return `\u2717 ${name} failed${why}. See its logs: flisk logs -s ${name}`;
}
function shouldRedrawUpProgress(input) {
  if (!input.isTTY || input.quiet)
    return false;
  if (input.env.CI && input.env.CI !== "false" && input.env.CI !== "0")
    return false;
  return input.env.TERM?.toLowerCase().startsWith("dumb") !== true;
}
function createUpProgressReporter(options) {
  const previous = /* @__PURE__ */ new Map();
  const buildingStartedAt = /* @__PURE__ */ new Map();
  let lineShown = false;
  const clearLine = () => {
    if (lineShown)
      options.write("\r\x1B[2K");
    lineShown = false;
  };
  return {
    update(jsonText) {
      let services;
      let items = [];
      try {
        const parsed = JSON.parse(jsonText);
        items = parsed.items ?? [];
        services = classifyUpProgress(jsonText, options.deferred);
      } catch {
        return;
      }
      if (services.length === 0)
        return;
      const now = options.now ?? Date.now;
      const currentTime = now();
      const byName = new Map(items.map((i) => [i.metadata?.name, i]));
      for (const service of services) {
        if (service.state === "building") {
          const item = byName.get(service.name);
          const rawStart = item?.status?.currentBuild?.startTime;
          const tiltStart = rawStart ? Date.parse(rawStart) : NaN;
          if (!Number.isNaN(tiltStart)) {
            buildingStartedAt.set(service.name, tiltStart);
          } else if (!buildingStartedAt.has(service.name)) {
            buildingStartedAt.set(service.name, currentTime);
          }
          const startedAt = buildingStartedAt.get(service.name) ?? currentTime;
          service.buildingDurationMs = Math.max(0, currentTime - startedAt);
        } else {
          buildingStartedAt.delete(service.name);
        }
      }
      const ready = services.filter((service) => service.state === "ready").length;
      const changed = services.filter((service) => previous.get(service.name) !== service.state);
      for (const service of services)
        previous.set(service.name, service.state);
      if (options.redraw) {
        const failed = changed.filter((service) => service.state === "failed");
        if (failed.length > 0)
          clearLine();
        for (const service of failed) {
          options.write(`${formatServiceFailedLine(service.name, service.reason)}
`);
        }
        const width = Math.max(20, (options.columns ?? 80) - 1);
        const line = `\u23F3 ${formatUpProgressLine(services)}`;
        options.write(`\r\x1B[2K${line.length > width ? `${line.slice(0, width - 1)}\u2026` : line}`);
        lineShown = true;
        return;
      }
      for (const service of changed) {
        const count = `(${ready}/${services.length} ready)`;
        options.write(service.state === "failed" ? `${formatServiceFailedLine(service.name, service.reason)} ${count}
` : `${service.name}: ${service.state} ${count}
`);
      }
    },
    finish: clearLine
  };
}
function fetchWithProgress(fetchJson, progress) {
  return async (port) => {
    const text = await fetchJson(port);
    if (text)
      progress.update(text);
    return text;
  };
}

// dist/utils/up-wait.js
import { execFile, spawn } from "node:child_process";
import { closeSync, openSync, readFileSync as readFileSync3, rmSync as rmSync2 } from "node:fs";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join3 } from "node:path";
var DEFAULT_WAIT_TIMEOUT_SECONDS = 1800;
var LOG_TAIL_CHARS = 2e3;
var POLL_MS = 250;
var UNHEALTHY_LINES_PER_SERVICE = 5;
var UNHEALTHY_LINES_TOTAL = 20;
function unhealthyLogTails(lines, perService = UNHEALTHY_LINES_PER_SERVICE, total = UNHEALTHY_LINES_TOTAL) {
  const byService = /* @__PURE__ */ new Map();
  for (const line of lines) {
    if (!line.resource)
      continue;
    const texts = line.text.split(/\r?\n/).map((text) => text.trimEnd()).filter((text) => text.trim());
    if (texts.length === 0)
      continue;
    const kept = byService.get(line.resource) ?? [];
    kept.push(...texts);
    byService.set(line.resource, kept);
  }
  let left = total;
  return [...byService].map(([name, kept]) => {
    const tail = kept.slice(-perService).slice(0, Math.max(0, left));
    left -= tail.length;
    return { name, lines: tail };
  });
}
function formatUnhealthyLogTails(tails) {
  return tails.flatMap(({ name, lines }) => [
    `  ${name}: not healthy`,
    ...lines.map((line) => `    ${line}`),
    `    (${lines.length > 0 ? `${lastLines(lines.length)} of: ` : "see: "}flisk logs --service ${name})`
  ]);
}
function fetchUnhealthyLogLines(invocation, cwd, timeoutMs = 2e4) {
  const [command, ...prefix] = invocation();
  return new Promise((resolve2) => {
    execFile(command, [...prefix, "logs", "--unhealthy", "--json"], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" }
    }, (_error, stdout) => {
      const line = resultLine(String(stdout ?? ""));
      if (!line)
        return resolve2(null);
      try {
        const parsed = JSON.parse(line);
        const found = parsed.data?.lines;
        if (!Array.isArray(found))
          return resolve2(null);
        const lines = found.map((entry) => ({
          resource: entry.resource ?? null,
          text: String(entry.text ?? "")
        }));
        const secrets = projectSecretValues(cwd);
        resolve2(secrets === null ? lines.map((line2) => ({ ...line2, text: OUTPUT_WITHHELD })) : redactLogLines(lines, secrets));
      } catch {
        resolve2(null);
      }
    });
  });
}
function failedWaitMessages(result, unhealthy) {
  const failures = result.data?.failures ?? [];
  const lines = formatWaitFailures(withUnhealthyLogs(failures, unhealthy));
  const messages = failures.length > 0 ? lines : [...(result.errors ?? []).map((error) => error.message ?? ""), ...lines];
  return messages.filter(Boolean);
}
function withUnhealthyLogs(failures, tails) {
  const byName = new Map(tails.map((tail) => [tail.name, tail.lines]));
  const out = failures.map((failure) => byName.has(failure.name) ? { ...failure, logs: byName.get(failure.name) } : failure);
  const named = new Set(failures.map((failure) => failure.name));
  for (const tail of tails) {
    if (!named.has(tail.name))
      out.push({ name: tail.name, message: "not healthy", logs: tail.lines });
  }
  return out;
}
function detachedUpArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--wait")
      continue;
    if (arg === "--wait-timeout") {
      i++;
      continue;
    }
    if (arg.startsWith("--wait-timeout="))
      continue;
    out.push(arg);
  }
  if (!out.includes("--json"))
    out.push("--json");
  return out;
}
function parseWaitTimeout(value) {
  if (value === void 0)
    return { ok: true, seconds: DEFAULT_WAIT_TIMEOUT_SECONDS };
  const seconds = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 21600) {
    return {
      ok: false,
      message: "--wait-timeout must be a whole number of seconds from 1 to 21600"
    };
  }
  return { ok: true, seconds };
}
function logTailOf(log, cwd) {
  return redactProjectText(log, cwd).slice(-LOG_TAIL_CHARS);
}
function resultLine(log) {
  return log.split("\n").filter((line) => line.startsWith('{"schemaVersion"')).pop();
}
async function upAndWait(argv, timeoutSeconds, deps, cwd) {
  const logFile = deps.logFile();
  const child = deps.spawnUp(detachedUpArgs(argv), logFile, cwd);
  let exited;
  let spawnError;
  child.once("exit", (code) => {
    exited = code;
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  const deadline = deps.now() + timeoutSeconds * 1e3;
  for (; ; ) {
    if (spawnError)
      return { kind: "spawn-error", message: spawnError.message };
    const log = deps.readLog(logFile);
    const line = resultLine(log);
    if (line) {
      child.unref();
      try {
        const parsed = JSON.parse(line);
        const failed = (parsed.errors?.length ?? 0) > 0 || parsed.data?.ok === false;
        if (!failed) {
          try {
            rmSync2(logFile, { force: true });
          } catch {
          }
        }
        return { kind: failed ? "failed" : "ready", json: line };
      } catch {
        return { kind: "failed", json: line };
      }
    }
    if (exited !== void 0) {
      return {
        kind: "exited",
        exitCode: exited,
        logTail: logTailOf(log, cwd)
      };
    }
    if (deps.now() >= deadline) {
      child.unref();
      return {
        kind: "timeout",
        logTail: logTailOf(log, cwd),
        logFile
      };
    }
    await deps.sleep(POLL_MS);
  }
}
var defaultUpWaitDeps = (invocation) => ({
  spawnUp(args, logFile, cwd) {
    const fd = openSync(logFile, "a", 384);
    const [command, ...prefix] = invocation();
    const child = spawn(command, [...prefix, ...args], {
      cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
      env: { ...process.env, NO_COLOR: "1" }
    });
    closeSync(fd);
    return child;
  },
  readLog(logFile) {
    try {
      return readFileSync3(logFile, "utf-8");
    } catch {
      return "";
    }
  },
  sleep: (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)),
  now: () => Date.now(),
  logFile: () => join3(tmpdir2(), `flisk-up-wait-${Date.now()}.log`)
});

// dist/commands/up.js
function formatUpSuccess(port, options = {}) {
  const { appUrls = [], serviceHealth = [], showLogsHint = serviceHealth.length > 0 } = options;
  const lines = [];
  lines.push("Flisk is up.");
  lines.push(`Tilt UI: http://localhost:${port}`);
  if (serviceHealth.length > 0) {
    const services = [...serviceHealth].sort((a, b) => Number(Boolean(b.url)) - Number(Boolean(a.url)));
    lines.push("Services:");
    for (const svc of services.slice(0, 10)) {
      const icon = svc.status === "ready" ? "\u2713" : svc.status === "failed" ? "\u2717" : "\u27F3";
      const urlPart = svc.url ? ` \u2192 ${svc.url}` : "";
      lines.push(`  ${icon} ${svc.name}${urlPart}`);
    }
    if (services.length > 10) {
      lines.push(`  \u2026 and ${services.length - 10} more`);
    }
    const withUrl = services.filter((svc) => svc.url && svc.healthUrl !== null);
    lines.push("Health checks:");
    for (const svc of withUrl.slice(0, 10)) {
      const icon = svc.status === "ready" ? "\u2713" : svc.status === "failed" ? "\u2717" : "\u27F3";
      const healthUrl = svc.healthUrl ?? (svc.url ? healthUrlOf(svc.url) : "");
      lines.push(`  ${icon} ${svc.name}: ${healthUrl}`);
    }
    if (withUrl.length > 10) {
      lines.push(`  \u2026 and ${withUrl.length - 10} more`);
    }
  } else if (appUrls.length > 0) {
    lines.push("App URLs:");
    for (const url of appUrls.slice(0, 5)) {
      lines.push(`  ${url}`);
    }
    if (appUrls.length > 5) {
      lines.push(`   \u2026 and ${appUrls.length - 5} more`);
    }
  } else {
    lines.push("App URLs:");
    lines.push("  run: flisk networks");
  }
  lines.push("Stop: flisk down");
  if (showLogsHint) {
    lines.push("Logs: flisk logs --service <name>");
  }
  lines.push("Next: flisk help  # or visit https://flisk.sh/docs");
  return lines;
}
var nativeWindowsUpRefusal = nativeWindowsStackRefusal;
async function hostUpRefusal(host = detectHost(), dockerReachable = defaultDockerReachable) {
  if (host.kind === "webcontainer")
    return WEBCONTAINER_UP_MESSAGE;
  if (isContainerHost(host.kind) && !await dockerReachable())
    return DEVCONTAINER_DOCKER_FIX;
  return null;
}
async function defaultDockerReachable() {
  const { execFile: execFile2 } = await import("node:child_process");
  return new Promise((resolve2) => {
    execFile2("docker", ["ps"], { timeout: 1e4 }, (error) => resolve2(!error));
  });
}
var DRIFT_EXIT_CODE = 2;
function driftReport(projectRoot, resources) {
  let handEdited;
  try {
    ({ handEdited } = verifyMasterConfigs(projectRoot, resources ? {
      manifestPaths: resources.map((r) => r.configPath),
      skipManifestValidation: true
    } : void 0));
  } catch (error) {
    if (error instanceof ProjectConfigNotFoundError)
      return null;
    throw error;
  }
  if (handEdited.length === 0)
    return null;
  return [
    "Generated files were edited by hand and no longer match service.json:",
    ...handEdited.map((file) => `  ${file}`),
    "Run `flisk config regenerate` to discard the edits, or bypass with `flisk up --ignore-drift`."
  ];
}
function enforceDriftGate(projectRoot, options, exit = process.exit) {
  if (options.ignoreDrift) {
    console.warn(source_default.yellow("Warning: --ignore-drift set; generated files were not checked."));
    return;
  }
  const drift = driftReport(projectRoot, options.resources);
  if (!drift)
    return;
  options.onDrift?.(drift.join("\n"));
  showError(drift.join("\n"));
  exit(DRIFT_EXIT_CODE);
}
function enforceVersionFloor(projectRoot, options, currentVersion = getPackageVersion(), exit = process.exit) {
  enforceFliskVersionGate(projectRoot, options, currentVersion, exit);
}
var STARTUP_FAILED = /* @__PURE__ */ Symbol("startup-failed");
async function waitForTiltUnlessStartupFailed(tiltRun, startupFailure, exit = process.exit) {
  const outcome = await Promise.race([tiltRun, startupFailure.then(() => STARTUP_FAILED)]);
  if (outcome === STARTUP_FAILED)
    exit(1);
  return outcome;
}
function waitForTiltUi(port, timeoutMs = 3e4) {
  return new Promise((resolve2) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const socket = connect({ host: "127.0.0.1", port });
      let settled = false;
      const finish = (ready) => {
        if (settled)
          return;
        settled = true;
        socket.destroy();
        if (ready || Date.now() >= deadline)
          resolve2(ready);
        else
          setTimeout(attempt, 250);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    };
    attempt();
  });
}
function selectRunEnvFile(projectRoot, requested) {
  if (requested === void 0)
    return void 0;
  if (!projectRoot) {
    throw errorFactories.notInProject();
  }
  const selection = selectEnvFile(projectRoot, requested);
  assertEngineSupportsEnvFile(projectRoot);
  return selection;
}
function envFileFailure(error) {
  const suggestions = error instanceof FliskError ? error.suggestions : [];
  return {
    failure: {
      code: error instanceof EnvFileError ? error.code : "ENV_FILE_INVALID",
      message: getErrorMessage(error),
      ...suggestions.length > 0 ? { suggestions } : {}
    },
    exitCode: error instanceof FliskError ? error.exitCode : 2
  };
}
function selectNativeRun(stackName, only, fail, cwd = process.cwd()) {
  const foundRoot = findProjectRoot(cwd);
  if (!foundRoot && !hasNearbyServiceJson(cwd))
    return null;
  if (foundRoot && isTiltfileOrchestration(foundRoot))
    return null;
  const projectRoot = foundRoot ?? cwd;
  let discovered;
  try {
    discovered = discoverResourcesWithProblems(projectRoot);
  } catch {
    return null;
  }
  const all = discovered.resources;
  if (!all.some(isNativeService))
    return null;
  if (!foundRoot && !isNativeProject(all))
    return null;
  if (discovered.problems.length > 0) {
    fail("INVALID_SERVICE_CONFIG", discovered.problems.map((problem) => `Invalid service.json at ${problem.path}: ${problem.reason}`).join("\n"));
  }
  let requested = all;
  if (stackName) {
    if (!stackExists(stackName, all)) {
      const error = errorFactories.stackNotFound(stackName, discoverStacks(all).map((s) => s.name));
      fail("STACK_NOT_FOUND", error.message, error.suggestions);
    }
    requested = getResourcesForStack(stackName, all);
  }
  if (only) {
    const unknown = findUnknownServices(only, requested);
    if (unknown.length > 0) {
      const error = errorFactories.unknownServices(unknown, requested.map((service) => service.name));
      fail("UNKNOWN_SERVICE", error.message, error.suggestions);
    }
  }
  const names = only ?? requested.map((service) => service.name);
  const selection = resolveOnlySelection(names, all);
  const { mode, mixed } = resolveRuntimeMode(selection.selected, all);
  if (mode === "container") {
    const containerNames = (selection.selected.some(isNativeService) ? selection.selected : all).filter((service) => !isNativeService(service)).map((service) => service.name);
    fail("MIXED_RUNTIME", formatMixedRuntimeRefusal(mixed, containerNames));
  }
  return {
    projectRoot,
    isNewProject: !foundRoot,
    all,
    selected: selection.selected,
    dependencies: only ? selection.dependencies : []
  };
}
function fastNoopFlags(options, stackName, configuredTiltPort) {
  return {
    force: options.force,
    dryRun: options.dryRun,
    ignoreDrift: options.ignoreDrift,
    ignoreVersion: options.ignoreVersion,
    only: options.only,
    envFile: options.envFile,
    profile: options.profile,
    database: options.database,
    gateway: options.gateway,
    stackName,
    configuredTiltPort,
    env: { ...process.env }
  };
}
function printFastNoopResult(result, options, emit) {
  const { state, services, urls, urlChecks } = result;
  const tiltUrl = `http://localhost:${state.tiltPort}`;
  if (emit) {
    emit({
      ok: true,
      alreadyRunning: true,
      stack: state.stack,
      services,
      tiltUrl,
      ...urls.length > 0 ? { advertisedUrls: urls } : {},
      // The same per-URL objects a normal start reports, so `data.urls` parsers keep working.
      ...urlChecks.length > 0 ? { urls: urlChecks } : {}
    });
    return;
  }
  if (options.quiet)
    return;
  console.log(source_default.green("Stack is healthy."));
  for (const url of urls)
    console.log(source_default.cyan(`  ${url}`));
  console.log(source_default.gray(`Tilt: ${tiltUrl}`));
  console.log(source_default.gray("It keeps running. `flisk status` shows it, `flisk down` stops it."));
}
function recordHealthyRun(details) {
  const { projectRoot, flags, tiltPort, stack, resources, ingressPort, gatewayEnabled } = details;
  const urls = fastNoopUrls(resources, ingressPort ?? void 0, gatewayEnabled);
  if (!isPlainUp(flags))
    return urls;
  if (details.persist === false) {
    clearFastNoopState(projectRoot);
    return urls;
  }
  const fingerprint = stackFingerprint(projectRoot, flags);
  if (!fingerprint) {
    clearFastNoopState(projectRoot);
    return urls;
  }
  writeFastNoopState(projectRoot, {
    version: UP_STATE_VERSION,
    fingerprint,
    tiltPort,
    // The Tilt process that served this run: if it is replaced, the next `flisk up` takes the normal path.
    tiltPid: findTiltPortOwner(tiltPort)?.pid ?? null,
    stack,
    services: resources.map((r) => r.name),
    ingressPort,
    urls
  });
  return urls;
}
async function tryFastNoopUp(options, stackName, configuredTiltPort, emit, beforeEmit) {
  const root = findProjectRoot();
  if (!root)
    return false;
  const flags = fastNoopFlags(options, stackName, configuredTiltPort);
  const result = await tryFastNoop(root, flags);
  if (!result)
    return false;
  beforeEmit?.();
  printFastNoopResult(result, options, emit);
  return true;
}
async function runUpWait(options) {
  const emit = options.json ? createJsonEmitter("UP_FAILED", "flisk up --wait") : void 0;
  const timeout = parseWaitTimeout(options.waitTimeout);
  if (!timeout.ok) {
    emit?.({ ok: false }, [
      { code: "INVALID_WAIT_TIMEOUT", message: timeout.message, suggestions: [] }
    ]);
    showErrorAndExit(timeout.message, 1, []);
  }
  const outcome = await upAndWait(process.argv.slice(2), timeout.seconds, defaultUpWaitDeps(cliInvocation), process.cwd());
  const unhealthy = outcome.kind === "failed" || outcome.kind === "timeout" ? unhealthyLogTails(await fetchUnhealthyLogLines(cliInvocation, process.cwd()) ?? []) : [];
  if (outcome.kind === "ready" || outcome.kind === "failed") {
    if (options.json) {
      console.log(outcome.kind === "failed" ? withLogsInResult(outcome.json, unhealthy) : outcome.json);
    } else {
      const parsed = JSON.parse(outcome.json);
      if (outcome.kind === "ready") {
        console.log(source_default.green("Stack is healthy."));
        const advertised = Array.isArray(parsed.data?.advertisedUrls) ? parsed.data.advertisedUrls : [];
        for (const url of advertised) {
          if (typeof url === "string")
            console.log(source_default.cyan(`  ${url}`));
        }
        if (parsed.data?.tiltUrl)
          console.log(source_default.gray(`Tilt: ${parsed.data.tiltUrl}`));
        console.log(source_default.gray("It keeps running. `flisk status` shows it, `flisk down` stops it."));
      } else {
        showError(`flisk up failed:
  ${failedWaitMessages(parsed, unhealthy).join("\n  ")}`);
      }
    }
    process.exit(outcome.kind === "ready" ? 0 : 1);
  }
  const reason = outcome.kind === "timeout" ? `the stack was not healthy after ${timeout.seconds} seconds (the log is ${outcome.logFile})` : outcome.kind === "exited" ? `flisk up exited with code ${outcome.exitCode ?? "unknown"} before the stack was ready` : `could not start flisk up: ${outcome.message}`;
  const code = outcome.kind === "timeout" ? "UP_WAIT_TIMEOUT" : "UP_WAIT_FAILED";
  const suggestions = outcome.kind === "timeout" ? ["`flisk status` shows which services are not healthy", "`flisk down` stops the stack"] : [];
  const failures = withUnhealthyLogs([], unhealthy);
  emit?.(failures.length > 0 ? { ok: false, failures } : { ok: false }, [
    { code, message: reason, suggestions }
  ]);
  if (!options.json) {
    const logs = formatUnhealthyLogTails(unhealthy);
    const tail = logs.length > 0 ? logs.join("\n") : "logTail" in outcome ? outcome.logTail.trim() : "";
    showError(`${reason}${tail ? `
${tail}` : ""}`, void 0, suggestions);
  }
  process.exit(1);
}
function withLogsInResult(json, unhealthy) {
  if (unhealthy.length === 0)
    return json;
  try {
    const parsed = JSON.parse(json);
    if (!parsed.data)
      return json;
    parsed.data.failures = withUnhealthyLogs(parsed.data.failures ?? [], unhealthy);
    return JSON.stringify(parsed);
  } catch {
    return json;
  }
}
async function upColdStartNotice(projectRoot, services) {
  let projectName;
  try {
    projectName = readProjectConfig(projectRoot).project.name;
  } catch {
    return null;
  }
  return coldStartNotice(projectName, services);
}
function recordableStacks(projectRoot) {
  try {
    return discoverStacks(discoverResourcesWithProblems(projectRoot).resources).map((s) => s.name);
  } catch {
    return [];
  }
}
async function cloneDeclaredRepos(projectRoot) {
  let repos;
  try {
    repos = readProjectConfig(projectRoot).repos;
  } catch {
  }
  if (!repos || repos.length === 0)
    return false;
  const results = await cloneMissingRepos(projectRoot, repos);
  return results.some((result) => result.cloned);
}
function missingDeclaredRepoDirs(projectRoot) {
  if (!projectRoot)
    return [];
  let repos;
  try {
    repos = readProjectConfig(projectRoot).repos;
  } catch {
    return [];
  }
  return (repos ?? []).map((repo) => repo.dir).filter((dir) => !existsSync3(join4(projectRoot, dir)));
}
var upCommand = new Command("up").description("Start all services on this machine (optionally filtered by stack). Alias: deploy, which never deploys to a cluster").alias("deploy").argument("[stack-name]", "Name of the stack to start (optional - runs all if omitted), or a git repository URL to clone and start").option("-v, --verbose", "Enable verbose output", false).option("-q, --quiet", "Suppress non-essential output", false).option("--dry-run", "Show what would be started without starting", false).option("-f, --force", "Kill existing Tilt process before starting", false).option("--ignore-drift", "Start even if generated files differ from service.json", false).option("--ignore-version", "Start even if this flisk does not satisfy pinnedFliskVersion or minFliskVersion in .flisk/project.json", false).option("--no-database", "Do not provision the bundled shared Postgres: saves capabilities.database=false in .flisk/project.json and regenerates .flisk/.flisk-out/ (set it to true to turn Postgres back on)").option("--only <services...>", "Start only these services plus what the Tiltfile enables for them (their dependsOn services and shared infrastructure). With a stack, names must belong to that stack; dependencies may cross stacks").option("--profile <names...>", 'Also start the services whose "profiles" in service.json include one of these names (without it they are left out)').option("--env-file <path>", "Use this project env file for the run instead of .env (for example: --env-file .env.integration)").option("--no-gateway", 'Run without gateway routing (no Traefik). Needs "capabilities": { "gateway": false } in .flisk/project.json; regenerates .flisk/.flisk-out/ from it').option("--json", "Print one JSON object on stdout when the stack is ready or the command fails; implies --quiet", false).option("--wait", "Start the stack in the background and return once every service is healthy (exit 0), or when it fails or --wait-timeout passes (exit 1). The stack keeps running; `flisk down` stops it", false).option("--wait-timeout <seconds>", "With --wait: seconds to wait for a healthy stack, 1 to 21600 (default 1800)").addHelpText("after", "\nFree disk space is checked first. Container projects: under 5 GiB flisk up stops, under 15 GiB it warns. Local-process projects: under 1 GiB it stops, under 2 GiB it warns. FLISK_DISK_MIN_GIB and FLISK_DISK_WARN_GIB change the limits of both. The shared Docker build cache is trimmed to 20 GiB (FLISK_BUILD_CACHE_MAX_GIB, 0 turns it off).\n\nExamples:\n  flisk up\n  flisk up shop\n  flisk up --dry-run\n  flisk up --ignore-drift").action(async (stackName, options) => {
  const baseEmit = options.json ? createJsonEmitter("UP_FAILED", "flisk up") : void 0;
  let diskWarning;
  const emit = baseEmit ? (data, errors) => baseEmit(diskWarning && data.ok === true ? { ...data, diskWarning } : data, errors) : void 0;
  const guardDisk = (isDockerRun) => {
    if (options.dryRun)
      return;
    const disk = enforceDiskGuard({
      vmFreeGib: isDockerRun ? readDockerVmFreeGib() : null,
      runtime: isDockerRun ? "container" : "native",
      emit: baseEmit,
      quiet: options.quiet || options.json,
      warn: (line) => console.warn(source_default.yellow(line))
    });
    diskWarning = diskWarningField(disk) ?? diskWarning;
  };
  if (isGitRepoArg(stackName)) {
    try {
      const dir = await cloneForUp(stackName, {
        log: options.json || options.quiet ? void 0 : (line) => console.log(source_default.gray(line))
      });
      process.chdir(dir);
    } catch (error) {
      if (error instanceof FliskError) {
        if (emit)
          emit({ ok: false }, [toMachineError(error).error]);
        return error.exit();
      }
      throw error;
    }
    stackName = void 0;
  }
  if (options.wait) {
    await runUpWait(options);
    return;
  }
  if (options.json)
    options.quiet = true;
  const portSetting = parseTiltPort(process.env.TILT_PORT);
  if (!portSetting.ok) {
    const suggestions = upFailureHints({ kind: "invalid-tilt-port" });
    emit?.({ ok: false }, [
      { code: "INVALID_TILT_PORT", message: portSetting.message, suggestions }
    ]);
    showErrorAndExit(portSetting.message, 1, suggestions);
  }
  const configuredTiltPort = portSetting.port;
  const fastFlags = fastNoopFlags(options, stackName, configuredTiltPort);
  if (isPlainUp(fastFlags)) {
    const fastResult = await tryFastNoopUp(options, stackName, configuredTiltPort, emit, () => {
      if (emit) {
        diskWarning = diskWarningField(enforceDiskGuard({ emit: baseEmit, quiet: true })) ?? diskWarning;
      }
    });
    if (fastResult)
      return;
  }
  const versionRoot = findProjectRoot();
  if (versionRoot) {
    enforceVersionFloor(versionRoot, {
      ignoreVersion: options.ignoreVersion,
      onFail: (message, status) => emit?.({ ok: false }, [
        {
          code: status === "mismatch" ? "FLISK_VERSION_MISMATCH" : "FLISK_VERSION_TOO_OLD",
          message
        }
      ])
    });
  }
  let hasClonedRepos = false;
  if (!options.dryRun) {
    const declaredRoot = findProjectRoot();
    if (declaredRoot) {
      try {
        hasClonedRepos = await cloneDeclaredRepos(declaredRoot);
      } catch (error) {
        if (error instanceof FliskError) {
          if (emit)
            emit({ ok: false }, [toMachineError(error).error]);
          return error.exit();
        }
        throw error;
      }
    }
  }
  const inferredProject = inferNodeProject(process.cwd());
  if (inferredProject && !stackName && !options.only && !options.envFile && !options.profile) {
    const stateRoot = inferredStateRoot(process.cwd());
    const service = inferredProject.service;
    if (service.config && service.config.port === void 0) {
      service.config.port = await findFreePort(3e3);
    }
    if (!options.quiet) {
      console.log(source_default.gray(`Inferred service from package.json: ${inferredProject.service.name}`));
    }
    guardDisk(false);
    await runNativeUp({
      projectRoot: stateRoot,
      selected: [service],
      dependencies: [],
      dryRun: options.dryRun,
      quiet: options.quiet,
      force: options.force,
      emit,
      inferred: { command: inferredProject.command, script: inferredProject.script }
    });
    return;
  }
  const nativeRun = selectNativeRun(stackName, options.only, (code, message, suggestions) => {
    emit?.({ ok: false }, [
      { code, message, ...suggestions && suggestions.length > 0 ? { suggestions } : {} }
    ]);
    return showErrorAndExit(message, 1, suggestions);
  });
  if (nativeRun) {
    const { projectRoot } = nativeRun;
    let envFilePath;
    if (options.envFile !== void 0) {
      try {
        envFilePath = selectEnvFile(projectRoot, options.envFile).path;
      } catch (error) {
        const { failure, exitCode } = envFileFailure(error);
        emit?.({ ok: false }, [failure]);
        showErrorAndExit(failure.message, exitCode, failure.suggestions);
      }
    }
    if (!nativeRun.isNewProject) {
      enforceSchemaVersionGate(projectRoot, {
        resources: nativeRun.all,
        onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }])
      });
    }
    enforceServiceConfigGate(projectRoot, {
      resources: nativeRun.all,
      onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SERVICE_CONFIG", message }])
    });
    if (nativeRun.isNewProject && !options.dryRun) {
      writeDefaultProjectConfig(projectRoot);
      if (!options.quiet) {
        console.log(source_default.gray("Created .flisk/project.json (this directory is now a Flisk project)"));
      }
    }
    const nativeProfiles = applyProfiles(nativeRun.selected, options.profile ?? [], options.only ?? []);
    assertKnownProfiles(options.profile, nativeRun.all, emit);
    if (nativeProfiles.skipped.length > 0 && !options.quiet) {
      console.log(source_default.gray(skippedProfilesNote(nativeProfiles.skipped)));
    }
    guardDisk(false);
    await runNativeUp({
      projectRoot,
      selected: nativeProfiles.kept,
      dependencies: nativeRun.dependencies,
      stackName,
      only: options.only,
      envFilePath,
      dryRun: options.dryRun,
      quiet: options.quiet,
      force: options.force,
      emit
    });
    return;
  }
  const platformRefusal = nativeWindowsUpRefusal(process.platform, process.env.FLISK_ALLOW_NATIVE_WINDOWS);
  if (platformRefusal)
    showErrorAndExit(platformRefusal);
  const envFileRoot = requireProjectBeforeDocker(() => versionRoot ?? findProjectRoot(), (error) => {
    emit?.({ ok: false }, [toMachineError(error).error]);
    return error.exit();
  });
  let envFileSelection;
  if (options.envFile === void 0) {
    delete process.env[PROJECT_ENV_FILE_VAR];
  }
  if (options.envFile !== void 0) {
    try {
      envFileSelection = selectRunEnvFile(envFileRoot, options.envFile);
    } catch (error) {
      const { failure, exitCode } = envFileFailure(error);
      emit?.({ ok: false }, [failure]);
      showErrorAndExit(failure.message, exitCode, failure.suggestions);
    }
    if (envFileSelection && envFileRoot) {
      applyEnvFileSelection(envFileSelection);
      if (!options.quiet) {
        console.log(source_default.gray(`Using env file: ${envFileSelection.relativePath} (the project .env is not read in this run)`));
      }
      const warning = envFileWarning(envFileRoot, envFileSelection);
      if (warning)
        console.warn(source_default.yellow(warning));
    }
  }
  const hostRefusal = options.dryRun ? null : await hostUpRefusal();
  if (hostRefusal) {
    emit?.({ ok: false }, [{ code: "HOST_UNSUPPORTED", message: hostRefusal }]);
    showErrorAndExit(hostRefusal);
  }
  if (!options.dryRun) {
    const tilt = await pruneSupersededTiltImages(1);
    if (tilt.removed.length > 0 && !options.quiet) {
      console.log(source_default.gray(`Removed ${tilt.removed.length} superseded tilt-* image(s) (up to ${(tilt.removedBytes / 1e9).toFixed(1)} GB).`));
    }
    const cache = await enforceBuildCacheCeiling();
    if (cache.pruned && !options.quiet) {
      console.log(source_default.gray(`Build cache was ${cache.sizeGib?.toFixed(1)} GiB; trimmed to ${cache.ceilingGib} GiB (FLISK_BUILD_CACHE_MAX_GIB changes the limit, 0 turns it off).`));
    }
  }
  guardDisk(true);
  const schemaRoot = findProjectRoot();
  let initialDiscovery;
  if (schemaRoot) {
    try {
      initialDiscovery = discoverResourcesWithProblems(schemaRoot);
      warnAboutSkippedFiles(initialDiscovery.problems);
    } catch {
    }
    if (initialDiscovery) {
      enforceSchemaVersionGate(schemaRoot, {
        resources: initialDiscovery.resources,
        onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }])
      });
    }
  }
  if (!options.dryRun) {
    const { assertMachineReadyOrExit } = await import("./cold-preflight-6GVMXA7D.js");
    await assertMachineReadyOrExit({ hints: upFailureHints({ kind: "machine" }) });
  }
  const action = async () => {
    const foundRoot = options.dryRun ? requireProjectRoot() : findProjectRoot();
    const projectRoot = foundRoot ?? process.cwd();
    if (foundRoot && !options.dryRun) {
      const ownName = projectNameAt(foundRoot);
      const refusal = ownName ? upOwnerRefusal(ownName, findForeignContainerOwners(ownName, recordableStacks(foundRoot), foundRoot)) : void 0;
      if (refusal) {
        emit?.({ ok: false }, [
          {
            code: "PROJECT_NAME_IN_USE",
            message: refusal.message,
            suggestions: refusal.suggestions
          }
        ]);
        showErrorAndExit(refusal.message, 1, refusal.suggestions);
      }
    }
    if (options.gateway === false)
      assertGatewayOptOutIsConfigured(foundRoot);
    const gatewayEnabled = isGatewayEnabled(projectRoot, options);
    const discoveredResources = discoverResourcesStrict(foundRoot && foundRoot === schemaRoot && !hasClonedRepos ? initialDiscovery : void 0);
    if (foundRoot && hasClonedRepos) {
      enforceSchemaVersionGate(foundRoot, {
        resources: discoveredResources,
        onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SCHEMA_VERSION", message }])
      });
    }
    let discoveredStacks;
    let discoveredStackNames = [];
    if (!options.only || stackName) {
      discoveredStacks = discoverStacks(discoveredResources);
      discoveredStackNames = discoveredStacks.map((stack) => stack.name);
    }
    if (options.only) {
      if (stackName && !stackExists(stackName, discoveredResources)) {
        const error = errorFactories.stackNotFound(stackName, discoveredStackNames);
        emit?.({ ok: false }, [toMachineError(error).error]);
        error.exit();
      }
      const candidates = stackName ? getResourcesForStack(stackName, discoveredResources) : discoveredResources;
      const unknown = findUnknownServices(options.only, candidates);
      const pendingClone = options.dryRun ? missingDeclaredRepoDirs(foundRoot) : [];
      if (unknown.length > 0 && pendingClone.length > 0) {
        if (!emit && !options.quiet) {
          console.warn(source_default.yellow(`Pending clone: ${unknown.join(", ")} may be in a repository not cloned yet (${pendingClone.join(", ")}). A real run clones it first.`));
        }
      } else if (unknown.length > 0) {
        const validNames = candidates.map((service) => service.name);
        const error = errorFactories.unknownServices(unknown, validNames);
        emit?.({ ok: false }, [
          {
            code: "UNKNOWN_SERVICE",
            message: error.message,
            ...error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}
          }
        ]);
        error.exit();
      }
    }
    if (foundRoot) {
      enforceDriftGate(foundRoot, {
        ignoreDrift: options.ignoreDrift,
        resources: discoveredResources,
        onDrift: (message) => emit?.({ ok: false }, [{ code: "DRIFT_DETECTED", message }])
      });
    }
    if (foundRoot) {
      enforceServiceConfigGate(foundRoot, {
        resources: discoveredResources,
        onInvalid: (message) => emit?.({ ok: false }, [{ code: "INVALID_SERVICE_CONFIG", message }])
      });
    }
    const unknownDependsOn = foundRoot ? evaluateSharedPlatformPostgres(foundRoot, discoveredResources).unknownDependsOnNames : [];
    const unknownBackends = foundRoot ? unknownBackendNames(discoveredResources) : [];
    if (unknownBackends.length > 0 && !emit && !options.quiet) {
      for (const { resource, name } of unknownBackends) {
        console.warn(source_default.yellow(`\u26A0\uFE0F  ${resource} has backendName "${name}", which is not a service of this project; it has no backend to wait for or call.`));
      }
    }
    if (unknownDependsOn.length > 0 && !emit && !options.quiet) {
      for (const { resource, name } of unknownDependsOn) {
        console.warn(source_default.yellow(`\u26A0\uFE0F  ${resource} dependsOn "${name}", which is not a service or stack of this project; it is ignored. Fix the name, or remove it.`));
      }
    }
    if (foundRoot && !emit && !options.quiet) {
      warnSchemaVersions(foundRoot, discoveredResources);
      warnSecretConflicts(foundRoot, discoveredResources);
      if (!options.dryRun)
        warnModelRunner(foundRoot, discoveredResources);
    }
    const claimPort = options.dryRun ? void 0 : createPortClaimer(projectRoot);
    const savedTiltPort = readSavedTiltPort(projectRoot);
    const hostPortPlan = await getHostPortPlan(projectRoot, {
      inspectDocker: !options.dryRun,
      database: options.database,
      gateway: gatewayEnabled,
      ...claimPort ? {
        isPortFree: async (port2) => await isHostPortAvailable(port2) && claimPort(port2)
      } : {}
    });
    if (!options.dryRun) {
      if (foundRoot && !envFileSelection) {
        const addedEnvKeys = completeEnvFile(projectRoot, {
          databaseKeys: projectNeedsDatabaseKeys(projectRoot)
        });
        if (addedEnvKeys.length > 0 && !options.quiet) {
          console.log(source_default.gray(`Added ${addedEnvKeys.join(", ")} to .env (generated; existing values unchanged)`));
        }
      }
      if (foundRoot && !envFileSelection) {
        const generatedNames = ensureGeneratedSecrets(projectRoot, discoveredResources);
        if (generatedNames.length > 0 && !options.quiet) {
          console.log(source_default.gray(`Generated ${generatedNames.join(", ")} into .env (once; existing values unchanged)`));
        }
      }
      const databaseTurnedOff = Boolean(foundRoot) && options.database === false && disableDatabaseCapability(projectRoot);
      if (foundRoot && !existsSync3(join4(projectRoot, ".flisk", ".flisk-out", "Tiltfile"))) {
        if (!options.quiet) {
          console.log(source_default.gray("No generated Tiltfile yet; generating .flisk/.flisk-out/ ..."));
        }
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
      } else if (foundRoot && isWrappedTiltfileStale(projectRoot)) {
        if (!options.quiet) {
          console.log(source_default.gray(isTiltfileOrchestration(projectRoot) ? "Wrapping your Tiltfile; regenerating .flisk/.flisk-out/ ..." : "project.json no longer wraps a Tiltfile; regenerating .flisk/.flisk-out/ ..."));
        }
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
      } else if (foundRoot && isVendoredEngineStale(projectRoot)) {
        if (!options.quiet) {
          console.log(source_default.gray("This Flisk ships a different engine or templates than .flisk/.flisk-out/ was generated with; regenerating ..."));
        }
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
      } else if (foundRoot && areMasterFilesStale(projectRoot)) {
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
      } else if (databaseTurnedOff || options.gateway === false) {
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
      }
      if (databaseTurnedOff && !options.quiet) {
        console.log(source_default.gray("Set capabilities.database to false in .flisk/project.json; regenerated .flisk/.flisk-out/ without the shared Postgres"));
      }
      if (foundRoot && !isDatabaseCapabilityEnabled(projectRoot)) {
        const databaseNames = databaseResourceNames(discoveredResources);
        const postgresUsers = discoveredResources.filter((r) => databaseNames.includes(r.name) || dependsOnOf(r.config).some((name) => namesSharedPlatformPostgres(name, databaseNames))).map((r) => r.name);
        if (postgresUsers.length > 0 && !options.quiet) {
          console.warn(source_default.yellow(`Database capability is off, but ${postgresUsers.join(", ")} depend on postgres; the shared Postgres still starts for them.`));
        }
      }
      const copiedAssets = ensureProjectRuntimeAssets(projectRoot);
      const ignoredGenerated = foundRoot ? ensureGeneratedRootIgnored(projectRoot) : [];
      if (ignoredGenerated.length > 0 && !options.quiet) {
        console.log(source_default.gray(`Added to .gitignore (generated, not yours to commit): ${ignoredGenerated.join(", ")}`));
      }
      if (copiedAssets.length > 0 && options.verbose && !options.quiet) {
        console.log(source_default.gray(`Refreshed runtime assets: ${copiedAssets.join(", ")}`));
      }
      const newlyEnabledStacks = enableDiscoveredStacks(projectRoot, discoveredResources);
      if (newlyEnabledStacks.length > 0) {
        await generateMasterConfigs(projectRoot, { quiet: options.quiet });
        if (!options.quiet) {
          console.log(source_default.gray(`Added ${newlyEnabledStacks.join(", ")} to the pre_alpha phase in .flisk/project.json`));
        }
      }
    }
    let servicesToStart;
    let stackDescription;
    let focusServiceNames = [];
    if (stackName) {
      servicesToStart = getResourcesForStack(stackName, discoveredResources);
      if (servicesToStart.length === 0) {
        const error = errorFactories.stackNotFound(stackName, discoveredStackNames);
        emit?.({ ok: false }, [toMachineError(error).error]);
        error.exit();
      }
      focusServiceNames = servicesToStart.map((s) => s.name);
      stackDescription = `stack "${stackName}"`;
    } else {
      servicesToStart = discoveredResources;
      const allStacks = discoveredStacks ?? discoverStacks(discoveredResources);
      stackDescription = `all stacks (${formatCount(allStacks.length, "stack")}, ${formatCount(servicesToStart.length, "service")})`;
    }
    let dependencyNames = [];
    if (options.only) {
      const selection = resolveOnlySelection(options.only, discoveredResources);
      servicesToStart = selection.selected;
      dependencyNames = selection.dependencies;
      focusServiceNames = servicesToStart.map((s) => s.name);
      stackDescription = `${formatCount(options.only.length, "requested service")}${dependencyNames.length > 0 ? ` plus ${dependencyNames.join(", ")}` : ""}`;
    }
    assertKnownProfiles(options.profile, discoveredResources, emit);
    const profileSelection = applyProfiles(servicesToStart, options.profile ?? [], options.only ?? []);
    if (profileSelection.skipped.length > 0) {
      servicesToStart = profileSelection.kept;
      focusServiceNames = servicesToStart.map((s) => s.name);
      if (!options.quiet)
        console.log(source_default.gray(skippedProfilesNote(profileSelection.skipped)));
    }
    if (options.verbose && !options.quiet) {
      console.log(source_default.gray(`Found ${formatCount(servicesToStart.length, "service")} in ${stackDescription}`));
    }
    const serviceNames = servicesToStart.map((s) => s.name);
    const hasPendingClone = options.dryRun && missingDeclaredRepoDirs(foundRoot).length > 0;
    if (discoveredResources.length === 0 && !hasPendingClone && !isTiltfileOrchestration(projectRoot)) {
      const error = errorFactories.noResources();
      emit?.({ ok: false }, [
        { code: "NO_RESOURCES", message: error.message, suggestions: error.suggestions }
      ]);
      error.exit();
    }
    if (!options.quiet) {
      console.log(source_default.blue(`${options.dryRun ? "Would start" : "Starting"} ${formatCount(serviceNames.length, "service")} from ${stackDescription}...`));
      for (const name of serviceNames) {
        console.log(source_default.gray(`  - ${name}`));
      }
      const { appBase, apiBase } = resolveSubdomainBases(hostPortPlan.ingressHttp);
      const routed = gatewayEnabled ? servicesToStart.filter(isRoutableService) : [];
      const frontends = routed.filter((s) => s.config?.appType === "frontend" || isWebUiBringYourOwn(s));
      const backends = routed.filter((s) => routesAsApi(s));
      if (frontends.length > 0) {
        console.log(source_default.blue("\n\u{1F30D} Frontend URLs:"));
        for (const svc of frontends) {
          if (isWebUiBringYourOwn(svc)) {
            const url = resolveServiceUrl(svc, hostPortPlan.ingressHttp);
            console.log(source_default.gray(`  - ${svc.name}: ${source_default.cyan(url)}`));
          } else {
            const basePath = svc.config?.basePath ?? `/${svc.name}`;
            console.log(source_default.gray(`  - ${svc.name}: ${appBase}${source_default.cyan(basePath)}`));
          }
        }
      }
      if (backends.length > 0) {
        console.log(source_default.blue("\n\u{1F527} Backend API URLs:"));
        for (const svc of backends) {
          const sablier = svc.config?.sablier;
          const deferredTag = sablier?.enable && sablier?.deferStart ? source_default.dim(" (deferred \u2014 starts on first request)") : "";
          if (isRoutedBringYourOwn(svc)) {
            const url = resolveServiceUrl(svc, hostPortPlan.ingressHttp);
            console.log(source_default.gray(`  - ${svc.name}: ${source_default.cyan(url)}${deferredTag}`));
          } else {
            const servicePathName = svc.name.replace(/-api$/, "");
            const apiPath = svc.config?.apiPath ?? `/api/${servicePathName}`;
            console.log(source_default.gray(`  - ${svc.name}: ${apiBase}${source_default.cyan(appendHealthPath(apiPath))}${deferredTag}`));
          }
        }
      }
    }
    const focusTargets = options.only ?? (profileSelection.skipped.length > 0 ? focusServiceNames : stackName ? [stackName] : void 0);
    const tiltArgs = buildTiltUpArgs(focusServiceNames, {
      verbose: options.verbose,
      quiet: options.quiet,
      force: options.force,
      focusTargets
    });
    const dryRunCommand = focusTargets ? `tilt up ${tiltArgs.join(" ")}` : "tilt up";
    if (!options.quiet) {
      console.log(source_default.blue(formatHostPortPlan(hostPortPlan)));
      for (const line of formatPortFallbackNotice(hostPortPlan))
        console.log(source_default.yellow(line));
      console.log(source_default.gray("Override with FLISK_HTTP_PORT, FLISK_HTTPS_PORT, or FLISK_POSTGRES_PORT."));
    }
    if (emit && options.dryRun) {
      emit({
        ok: true,
        dryRun: true,
        stack: stackName ?? null,
        services: serviceNames,
        ...options.only ? { requested: options.only, declaredDependencies: dependencyNames } : {},
        ...unknownDependsOn.length > 0 ? { unknownDependsOn } : {},
        ...unknownBackends.length > 0 ? { unknownBackendNames: unknownBackends } : {},
        command: dryRunCommand
      });
      return;
    }
    if (handleDryRun(options, "not starting services", dryRunCommand)) {
      return;
    }
    exportHostPortPlan(hostPortPlan);
    const basePort = STANDARD_PORTS.tiltUi;
    const watchedPort = configuredTiltPort ?? basePort;
    const candidatePorts = options.only ? [.../* @__PURE__ */ new Set([basePort, watchedPort])] : [watchedPort];
    const { running, foreign, savedRunning, unknownSaved } = await findProjectTiltPorts({
      watchedPorts: candidatePorts,
      savedPort: savedTiltPort,
      projectRoot,
      isServing: async (candidate) => await tiltGetUiResources(candidate) !== null
    });
    if (foreign.length > 0 && configuredTiltPort !== void 0) {
      const other = foreign[0];
      const message = `TILT_PORT=${other?.port} is used by another project's Tilt (${other?.root}). Choose a free port, or run flisk down in that project.`;
      emit?.({ ok: false }, [{ code: "TILT_PORT_IN_USE", message }]);
      showErrorAndExit(message);
    }
    if (!options.quiet) {
      for (const other of foreign) {
        console.log(source_default.yellow(`\u26A0\uFE0F  Tilt on port ${other.port} belongs to another project (${other.root}); this project will use another port.`));
      }
    }
    if (options.force && unknownSaved.length > 0) {
      const message = `Tilt on saved port ${unknownSaved.join(", ")} cannot be identified as this project's, so --force will not stop it and will not start a second Tilt beside it. Run flisk down, or stop that Tilt yourself, then run flisk up again.`;
      emit?.({ ok: false }, [{ code: "TILT_OWNER_UNKNOWN", message }]);
      showErrorAndExit(message);
    }
    const force = options.force && foreign.length === 0;
    const decision = secondUpAction({
      runningPorts: running,
      force: Boolean(options.force),
      only: Boolean(options.only)
    });
    if (decision.action === "already-running") {
      if (envFileSelection) {
        const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --env-file applies to a new run only: run \`flisk down\` first, or pass --force to replace the running stack.`;
        emit?.({ ok: false }, [{ code: "ENV_FILE_ALREADY_RUNNING", message }]);
        showErrorAndExit(message);
      }
      const runningPort = decision.ports[0] ?? watchedPort;
      const tiltUrl = `http://localhost:${runningPort}`;
      const parsedWaitTimeout = emit && typeof options.waitTimeout !== "undefined" ? parseWaitTimeout(options.waitTimeout) : void 0;
      if (emit && parsedWaitTimeout && !parsedWaitTimeout.ok) {
        emit({ ok: false }, [
          { code: "INVALID_WAIT_TIMEOUT", message: parsedWaitTimeout.message, suggestions: [] }
        ]);
        showErrorAndExit(parsedWaitTimeout.message, 1, []);
      }
      hostPortPlan.tiltUi = runningPort;
      writeSavedHostPortPlan(projectRoot, hostPortPlan);
      const deferred = getDeferredResourceNames(discoveredResources);
      if (emit) {
        const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
        const readiness = await waitForTiltResourcesReady(runningPort, {
          timeoutMs: parsedWaitTimeout?.ok ? parsedWaitTimeout.seconds * 1e3 : void 0,
          deferred,
          isStalled: (text) => isStartupStalled(text, dependsOn, deferred)
        });
        const failures = readiness.ready ? readiness.failures : await explainFailures(readiness.failures, (name) => tiltResourceLogs(runningPort, name));
        const report = alreadyRunningReport(runningPort, { ...readiness, failures });
        if (report.ok) {
          let attachedUrlChecks = [];
          if (gatewayEnabled) {
            const urlChecks = await checkStackUrls(runningPort, servicesToStart, hostPortPlan.ingressHttp, deferred);
            if (urlChecks.some((check) => !check.didAnswer)) {
              clearFastNoopState(projectRoot);
              emit({ ok: false, alreadyRunning: true, tiltUrl, urls: urlChecks }, [
                {
                  code: "UP_URL_UNREACHABLE",
                  message: `${formatUrlFailures(urlChecks).join("\n")}
Tilt is still running; inspect it or run: flisk down`,
                  suggestions: urlFailureSuggestions(urlChecks)
                }
              ]);
              process.exitCode = 1;
              return;
            }
            attachedUrlChecks = urlChecks;
          }
          const urls = recordHealthyRun({
            projectRoot,
            flags: fastFlags,
            tiltPort: runningPort,
            stack: stackName ?? null,
            resources: servicesToStart,
            ingressPort: hostPortPlan.ingressHttp,
            gatewayEnabled,
            persist: false
          });
          emit({
            ok: true,
            alreadyRunning: true,
            tiltUrl,
            ...urls.length > 0 ? { advertisedUrls: urls } : {},
            ...attachedUrlChecks.length > 0 ? { urls: attachedUrlChecks } : {}
          });
        } else {
          clearFastNoopState(projectRoot);
          emit({ ok: false, alreadyRunning: true, tiltUrl, failures }, [
            { code: report.code, message: report.message, suggestions: report.suggestions }
          ]);
          process.exitCode = 1;
        }
        return;
      }
      const snapshot = await tiltGetUiResources(runningPort);
      const current = snapshot ? evaluateTiltReadiness(snapshot, deferred, void 0, getDisabledHealthResourceNames(discoveredResources), healthProbeCannotRun).result : void 0;
      if (current && current.failures.length > 0) {
        const report = alreadyRunningReport(runningPort, current);
        if (!report.ok)
          showErrorAndExit(report.message, 1, report.suggestions);
      }
      if (!options.quiet) {
        console.log(source_default.green(`Environment is already running on port ${decision.ports.join(", ")}.`));
        console.log(`Tilt UI: ${tiltUrl}`);
      }
      return;
    }
    if (decision.action === "only-blocked") {
      const message = `A Tilt is already running on port ${decision.ports.join(", ")}. --only cannot change a running stack's services: run \`flisk down\` first, or pass --force to replace it.`;
      emit?.({ ok: false }, [{ code: "TILT_ALREADY_RUNNING", message }]);
      showErrorAndExit(message);
    }
    if (options.only && force) {
      for (const runningPort of running) {
        if (candidatePorts.includes(runningPort))
          stopTiltOnPort(runningPort);
      }
    }
    const canReplaceTargetPort = Boolean(force) && (configuredTiltPort !== void 0 || running.includes(basePort));
    const resolution = await resolveTiltPort({
      configuredPort: configuredTiltPort,
      force: canReplaceTargetPort,
      basePort,
      findAvailablePort: (base, attempts) => findAvailablePort(base, attempts, claimPort),
      fallbackPort: savedRunning[0]
    });
    const port = resolution.port;
    if (resolution.autoSwitched && !options.quiet) {
      console.log(source_default.yellow(`\u26A0\uFE0F  Port ${basePort} is already in use`));
      console.log(source_default.blue(`\u{1F504} Auto-switching to port ${port}
`));
    }
    process.env.TILT_PORT = port.toString();
    hostPortPlan.tiltUi = port;
    writeSavedHostPortPlan(projectRoot, hostPortPlan);
    await stopTiltForUp({
      force: canReplaceTargetPort,
      quiet: options.quiet,
      port,
      ownPorts: options.force ? savedRunning : []
    }, {
      stop: (targetPort) => {
        if (savedRunning.includes(targetPort)) {
          stopOwnedTiltOnPort(targetPort, projectRoot);
        } else {
          stopTiltOnPort(targetPort);
        }
      },
      log: (message) => console.log(source_default.yellow(message)),
      wait: (milliseconds) => new Promise((resolve2) => setTimeout(resolve2, milliseconds))
    });
    if (options.force && savedRunning.length > 0) {
      const stillServing = await waitForTiltPortsToStop(savedRunning, (candidate) => tiltGetUiResources(candidate).then((resources) => resources !== null));
      if (stillServing.length > 0) {
        const message = `Tilt on port ${stillServing.join(", ")} is still running after --force tried to stop it, so flisk up did not start a second Tilt. Run flisk down, then run flisk up again.`;
        emit?.({ ok: false }, [{ code: "TILT_STOP_FAILED", message }]);
        showErrorAndExit(message);
      }
    }
    const coldNotice = await upColdStartNotice(projectRoot, servicesToStart);
    if (coldNotice) {
      if (options.json)
        console.warn(coldNotice);
      else if (!options.quiet)
        console.log(source_default.cyan(`
${coldNotice}`));
    }
    if (!options.dryRun) {
      const requiredModels = collectRequiredModels(servicesToStart);
      if (requiredModels.length > 0) {
        if (!options.quiet) {
          console.log(source_default.gray(`Checking required models with Docker Model Runner (${requiredModels.join(", ")})...`));
        }
        const preflightResult = await runModelPreflight(requiredModels, {
          onRetry: options.quiet ? void 0 : ({ model, attempt, maxAttempts, delayMs, error }) => {
            console.log(source_default.yellow(`Retrying model pull for ${model} (attempt ${attempt}/${maxAttempts}) in ${delayMs / 1e3}s: ${error}`));
          }
        });
        if (!preflightResult.ok) {
          const message = `Failed to pull required model "${preflightResult.failedModel}" after ${preflightResult.attempts} attempts: ${preflightResult.error}`;
          const suggestions = [
            `Docker Model Runner failed to pull: ${preflightResult.failedModel}`,
            preflightResult.error,
            "Verify Docker Model Runner is active and reachable, or pull the model manually."
          ];
          emit?.({ ok: false }, [{ code: "MODEL_PULL_FAILED", message, suggestions }]);
          showErrorAndExit(message, 1, suggestions);
        }
      }
    }
    if (!options.quiet) {
      console.log(source_default.gray("\nRunning tilt up..."));
      console.log(source_default.gray(`Using Tiltfile: .flisk/.flisk-out/Tiltfile`));
    }
    recordProjectRoot(projectRoot, { stacks: recordableStacks(projectRoot) });
    const tiltRun = runTilt("up", tiltArgs, {
      verbose: options.verbose && !options.json,
      quiet: options.quiet,
      inheritStdio: !options.quiet
      // Suppress tilt output in quiet mode
    });
    const smokePlans = buildSmokePlans(servicesToStart, hostPortPlan.ingressHttp, {
      gateway: gatewayEnabled
    });
    let smokeFailed = false;
    let printedSuccess = false;
    let startupFailed = false;
    let signalStartupFailed = () => {
    };
    const startupFailure = new Promise((resolve2) => {
      signalStartupFailed = resolve2;
    });
    const successOutput = (async () => {
      const uiReady = await waitForTiltUi(port);
      let jsonReady = false;
      let startedServices = serviceNames;
      let startedDependencies = dependencyNames;
      let urlChecks;
      if (uiReady && emit) {
        const deferred = getDeferredResourceNames(discoveredResources);
        const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
        const parsedWaitTimeout = typeof options.waitTimeout !== "undefined" ? parseWaitTimeout(options.waitTimeout) : void 0;
        const waitTimeoutMs = parsedWaitTimeout?.ok ? parsedWaitTimeout.seconds * 1e3 : void 0;
        const readiness = await waitForTiltResourcesReady(port, {
          timeoutMs: waitTimeoutMs,
          deferred,
          // Only what the caller named must be enabled. Dependencies are the Tiltfile's call (it skips some on purpose).
          expected: options.only ? options.only.filter((name) => !deferred.has(name)) : void 0,
          // As for the human output: stop as soon as everything left is blocked by a failure (for example init-networks),
          // instead of waiting out the whole timeout.
          isStalled: (text) => isStartupStalled(text, dependsOn, deferred)
        });
        if (readiness.ready) {
          jsonReady = true;
          if (options.only) {
            const enabled = new Set(readiness.enabled);
            const allNames = discoveredResources.map((r) => r.name);
            startedServices = allNames.filter((name) => enabled.has(name));
            startedDependencies = startedServices.filter((name) => !options.only.includes(name));
          }
          if (gatewayEnabled) {
            const started = new Set(startedServices);
            urlChecks = await checkStackUrls(port, discoveredResources.filter((r) => started.has(r.name)), hostPortPlan.ingressHttp, deferred);
            if (urlChecks.some((check) => !check.didAnswer)) {
              jsonReady = false;
              startupFailed = true;
              emit({ ok: false, tiltUrl: `http://localhost:${port}`, urls: urlChecks }, [
                {
                  code: "UP_URL_UNREACHABLE",
                  message: `${formatUrlFailures(urlChecks).join("\n")}
Tilt is still running; inspect it or run: flisk down`,
                  suggestions: urlFailureSuggestions(urlChecks)
                }
              ]);
            }
          }
        } else {
          startupFailed = true;
          const failures = await explainFailures(readiness.failures, (name) => tiltResourceLogs(port, name));
          const detail = failures.map((f) => `${f.name}: ${f.message}${f.fix ? `. ${f.fix}` : ""}`).join("; ");
          const stillBuildingMsg = readiness.stillBuilding && readiness.stillBuilding.length > 0 ? ` (${readiness.stillBuilding.join(", ")} still building)` : "";
          emit({ ok: false, tiltUrl: `http://localhost:${port}`, failures }, [
            {
              code: readiness.timedOut ? "UP_TIMEOUT" : "UP_RESOURCE_FAILED",
              message: `${readiness.timedOut ? `Timed out waiting for resources${stillBuildingMsg}` : "Resources failed"}${detail ? ` (${detail})` : ""}. Tilt is still running; inspect it or run: flisk down`,
              suggestions: upFailureHints({
                kind: "services",
                failed: readiness.failures.map((failure) => failure.name),
                timedOut: readiness.timedOut,
                stillBuilding: readiness.stillBuilding
              })
            }
          ]);
        }
      }
      if (uiReady && !emit) {
        const deferred = getDeferredResourceNames(discoveredResources);
        const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
        const progress = createUpProgressReporter({
          write: (text) => process.stdout.write(text),
          redraw: shouldRedrawUpProgress({
            isTTY: process.stdout.isTTY,
            quiet: Boolean(options.quiet),
            env: process.env
          }),
          deferred,
          columns: process.stdout.columns
        });
        const parsedWaitTimeout = typeof options.waitTimeout !== "undefined" ? parseWaitTimeout(options.waitTimeout) : void 0;
        const waitTimeoutMs = parsedWaitTimeout?.ok ? parsedWaitTimeout.seconds * 1e3 : void 0;
        const readiness = await waitForTiltResourcesReady(port, {
          timeoutMs: waitTimeoutMs,
          deferred,
          isStalled: (text) => isStartupStalled(text, dependsOn, deferred),
          fetchJson: fetchWithProgress(tiltGetUiResources, progress)
        });
        progress.finish();
        if (!readiness.ready) {
          startupFailed = true;
          const resourcesJson = await tiltGetUiResources(port);
          const report = resourcesJson ? buildStartupReport(resourcesJson, dependsOn, deferred) : {
            failed: readiness.failures.map((failure) => ({
              name: failure.name,
              message: summarizeTiltBuildError(failure.message)
            })),
            blocked: [],
            starting: [],
            stillBuilding: readiness.stillBuilding
          };
          if (readiness.stillBuilding && readiness.stillBuilding.length > 0) {
            report.stillBuilding = readiness.stillBuilding;
          }
          report.failed = await withLoggedReasons(report.failed, (name) => tiltResourceLogs(port, name));
          const machineFixes = await machineProblemFixes(report.failed, (name) => tiltResourceLogs(port, name));
          const reportLines = formatStartupReport(report, readiness.timedOut, (port2) => findPortContainer(port2) ?? findPortOccupant(port2), machineFixes, readiness.lastLogs);
          if (reportLines.length > 0) {
            showError(reportLines.join("\n"), void 0, upFailureHints({
              kind: "services",
              failed: report.failed.map((failure) => failure.name),
              timedOut: readiness.timedOut,
              stillBuilding: readiness.stillBuilding
            }));
          }
        } else if (gatewayEnabled) {
          const checks = await checkStackUrls(port, servicesToStart, hostPortPlan.ingressHttp, deferred);
          const failureLines = formatUrlFailures(checks);
          if (failureLines.length > 0) {
            startupFailed = true;
            showError(failureLines.join("\n"), void 0, urlFailureSuggestions(checks));
          }
        }
      }
      if (uiReady && !options.quiet && !startupFailed) {
        const deferred = getDeferredResourceNames(discoveredResources);
        const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
        const readiness = await waitForTiltResourcesReady(port, {
          deferred,
          isStalled: (text) => isStartupStalled(text, dependsOn, deferred)
        });
        const serviceHealth = readiness.enabled.map((name) => {
          const failed = readiness.failures.find((f) => f.name === name);
          const svc = discoveredResources.find((r) => r.name === name);
          const isReady = !failed && !readiness.failures.some((f) => f.name === name);
          const isStarting = !isReady && !failed;
          const url = svc && gatewayEnabled ? resolveServiceUrl(svc, hostPortPlan.ingressHttp) : void 0;
          return {
            name,
            status: failed ? "failed" : isStarting ? "starting" : "ready",
            url,
            ...svc && url ? { healthUrl: printedHealthUrl(svc, url) } : {}
          };
        });
        for (const line of formatUpSuccess(port, {
          serviceHealth,
          showLogsHint: true
        }))
          console.log(source_default.blue(line));
        printedSuccess = true;
        const ciWarning = attachedUpInCiWarning(process.env);
        if (ciWarning)
          console.log(source_default.yellow(ciWarning));
      }
      if (uiReady && smokePlans.length > 0 && (emit ? jsonReady : !startupFailed)) {
        if (!options.quiet) {
          console.log(source_default.gray(`Smoke check: ${smokePlans.map((p) => p.name).join(", ")}`));
        }
        const ignoreWarning = ensureSmokeRecordsIgnored(projectRoot);
        if (ignoreWarning)
          console.warn(source_default.yellow(ignoreWarning));
        const results = await runSmokePlans(smokePlans, {
          recordDir: join4(projectRoot, ".flisk", "smoke"),
          ...safeSmokeDeps(projectRoot, (message) => console.warn(source_default.yellow(message)), {
            // The selected env file holds secrets as much as the project .env.
            envFiles: envFileSelection ? [envFileSelection.path] : []
          })
        });
        const smokeFailures = [];
        for (const smokeResult of results) {
          if (smokeResult.ok) {
            if (!options.quiet)
              console.log(source_default.green(`Smoke check passed: ${smokeResult.name}`));
          } else {
            smokeFailed = true;
            smokeFailures.push(smokeResult.name);
            showError(formatSmokeFailure(smokeResult));
          }
        }
        if (smokeFailed) {
          stopTiltOnPort(port);
          const suggestions = upFailureHints({ kind: "smoke", failed: smokeFailures });
          showError("A smoke check failed; Tilt was stopped", void 0, suggestions);
          emit?.({ ok: false }, [
            {
              code: "UP_SMOKE_FAILED",
              message: "A smoke check failed; Tilt was stopped",
              suggestions
            }
          ]);
        }
      }
      if (uiReady && jsonReady && !smokeFailed) {
        emit?.({
          ok: true,
          stack: stackName ?? null,
          services: startedServices,
          ...options.only ? { requested: options.only, dependencies: startedDependencies } : {},
          tiltUrl: `http://localhost:${port}`,
          ...urlChecks ? { urls: urlChecks } : {}
        });
      }
      if (uiReady && !startupFailed && !smokeFailed) {
        recordHealthyRun({
          projectRoot,
          flags: fastFlags,
          tiltPort: port,
          stack: stackName ?? null,
          resources: servicesToStart,
          ingressPort: hostPortPlan.ingressHttp,
          gatewayEnabled
        });
      } else {
        clearFastNoopState(projectRoot);
      }
      if (startupFailed)
        signalStartupFailed();
    })();
    const result = await waitForTiltUnlessStartupFailed(tiltRun, startupFailure);
    await successOutput;
    if (smokeFailed) {
      process.exit(1);
    }
    if (result.exitCode !== 0) {
      showErrorAndExit(`tilt up failed with exit code ${result.exitCode}`, result.exitCode, upFailureHints({ kind: "tilt-exited" }));
    }
    if (startupFailed && result.exitCode === 0) {
      process.exit(1);
    }
    if (!options.quiet && result.exitCode === 0 && !printedSuccess) {
      const deferred = getDeferredResourceNames(discoveredResources);
      const dependsOn = Object.fromEntries(discoveredResources.map((r) => [r.name, dependsOnOf(r.config)]));
      const readiness = await waitForTiltResourcesReady(port, {
        deferred,
        isStalled: (text) => isStartupStalled(text, dependsOn, deferred)
      });
      const serviceHealth = readiness.enabled.map((name) => {
        const failed = readiness.failures.find((f) => f.name === name);
        const svc = discoveredResources.find((r) => r.name === name);
        const isReady = !failed && !readiness.failures.some((f) => f.name === name);
        const isStarting = !isReady && !failed;
        const url = svc && gatewayEnabled ? resolveServiceUrl(svc, hostPortPlan.ingressHttp) : void 0;
        return {
          name,
          status: failed ? "failed" : isStarting ? "starting" : "ready",
          url,
          ...svc && url ? { healthUrl: printedHealthUrl(svc, url) } : {}
        };
      });
      for (const line of formatUpSuccess(port, {
        serviceHealth,
        showLogsHint: true
      }))
        console.log(source_default.blue(line));
    }
  };
  if (options.dryRun) {
    await runCommand(action);
  } else {
    await withTiltCheck(action);
  }
});
async function checkStackUrls(tiltPort, resources, ingressPort, deferred, deps = {}) {
  const targets = buildPrintedUrlTargets(resources, ingressPort, deferred);
  if (targets.length === 0)
    return [];
  let uiResources;
  return (deps.check ?? checkPrintedUrls)(targets, {
    diagnosis: {
      hasExited: async (name) => {
        uiResources ??= tiltGetUiResources(tiltPort);
        const json = await uiResources;
        return json ? tiltResourceHasExited(json, name) : null;
      },
      logs: (name) => tiltResourceLogs(tiltPort, name)
    }
  });
}
function skippedProfilesNote(skipped) {
  return `Not starting ${describeSkipped(skipped)}: add --profile <name> to start them`;
}
function assertKnownProfiles(requested, resources, emit) {
  if (!requested || requested.length === 0)
    return;
  const known = declaredProfiles(resources);
  const unknown = requested.filter((name) => !known.includes(name));
  if (unknown.length === 0)
    return;
  const message = `No service declares the profile ${unknown.map((name) => `"${name}"`).join(", ")}.`;
  const suggestions = [
    known.length > 0 ? `Profiles in this project: ${known.join(", ")}` : 'No service has "profiles" in its service.json yet'
  ];
  emit?.({ ok: false }, [{ code: "UNKNOWN_PROFILE", message, suggestions }]);
  showErrorAndExit(message, 1, suggestions);
}

export {
  formatUpSuccess,
  nativeWindowsUpRefusal,
  hostUpRefusal,
  defaultDockerReachable,
  DRIFT_EXIT_CODE,
  driftReport,
  enforceDriftGate,
  enforceVersionFloor,
  waitForTiltUnlessStartupFailed,
  waitForTiltUi,
  selectRunEnvFile,
  selectNativeRun,
  fastNoopFlags,
  printFastNoopResult,
  upCommand,
  checkStackUrls
};
