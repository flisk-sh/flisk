import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError
} from "./chunk-NKTINEF4.js";

// dist/generator/extension-fetch.js
import { randomUUID } from "node:crypto";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// dist/utils/tar.js
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function extractTarball(data, destDir) {
  const tempDir = mkdtempSync(join(tmpdir(), "flisk-ext-"));
  try {
    const tmpFile = join(tempDir, "bundle.tar.gz");
    writeFileSync(tmpFile, data);
    mkdirSync(destDir, { recursive: true });
    const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
    const result = spawnSync(tarBin, ["xzf", tmpFile, "-C", destDir, "--strip-components=1"], {
      stdio: "pipe",
      windowsHide: true
    });
    if (result.status !== 0) {
      const fallbackDir = join(tempDir, "fallback");
      mkdirSync(fallbackDir, { recursive: true });
      const fallback = spawnSync(tarBin, ["xzf", tmpFile, "-C", fallbackDir], {
        stdio: "pipe",
        windowsHide: true
      });
      if (fallback.status !== 0) {
        throw new FliskError(`tar extraction failed: ${fallback.stderr?.toString() || result.stderr?.toString() || "unknown error"}`, ["Check that tar is installed and the download finished", "Run the command again"]);
      }
      const entries = readdirSync(fallbackDir);
      const [only] = entries;
      const sourceDir = entries.length === 1 && only !== void 0 && existsSync(join(fallbackDir, only)) && statSync(join(fallbackDir, only)).isDirectory() ? join(fallbackDir, only) : fallbackDir;
      for (const entry of readdirSync(sourceDir)) {
        renameSync(join(sourceDir, entry), join(destDir, entry));
      }
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

// dist/generator/extension-fetch.js
var DEFAULT_ENDPOINT = "https://tdk-extension-dist.oranguman.workers.dev/v1/premium/bundle.tar.gz";
var KNOWN_RESOURCES = [
  "playwright",
  "c4-diagram",
  "logging",
  "agents-md",
  "sablier",
  "verdaccio"
];
var CACHE_TTL_MS = 12 * 60 * 60 * 1e3;
var PREMIUM_PATH_MAP = {
  "typescript/playwright_config.star": "engine/topologies/tilt/generators/typescript/playwright_config.star",
  "generators/agents_md.star": "engine/topologies/tilt/generators/agents_md.star",
  "c4_diagram.star": "engine/topologies/tilt/generators/c4_diagram.star",
  "observability/logging.star": "engine/topologies/platform/observability/logging.star",
  "generators/database_provisioner.star": "engine/topologies/tilt/generators/database_provisioner.star",
  "generators/dependency_manifest.star": "engine/topologies/tilt/generators/dependency_manifest.star",
  "generators/fixed_frontend_tsconfig.star": "engine/topologies/tilt/generators/typescript/fixed_frontend_tsconfig.star",
  "synthetic_monitor.star": "engine/resources/synthetic_monitor.star",
  "synthetic-monitor-topology.star": "engine/topologies/platform/services/synthetic-monitor.star",
  "database-management-service.yaml": "platform/services/platform/database-management/service.yaml",
  "networking/sablier_container_cycle.star": "engine/topologies/platform/docker/networking/sablier_container_cycle.star",
  "registries/verdaccio_loader.star": "engine/topologies/platform/registries/verdaccio_loader.star"
};
function getLicenseKey() {
  return process.env.FLISK_LICENSE_KEY?.trim() || null;
}
function getEndpoint() {
  return process.env.FLISK_PREMIUM_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}
function getOrCreateProjectId(projectRoot) {
  const idPath = join2(projectRoot, ".flisk", ".project-id");
  if (existsSync2(idPath)) {
    return readFileSync(idPath, "utf-8").trim();
  }
  const id = randomUUID();
  mkdirSync2(join2(projectRoot, ".flisk"), { recursive: true });
  writeFileSync2(idPath, `${id}
`);
  return id;
}
function cacheTarballPath(key) {
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join2(homedir(), ".flisk", "cache", `premium-${safeName}`, "premium.tar.gz");
}
function isCacheFresh(path) {
  if (!existsSync2(path))
    return false;
  return Date.now() - statSync2(path).mtimeMs < CACHE_TTL_MS;
}
async function fetchPremium(key, resource, projectId) {
  const url = `${getEndpoint()}?resource=${encodeURIComponent(resource)}&projectId=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status !== 401)
    return res;
  await res.arrayBuffer().catch(() => void 0);
  return fetch(`${url}&key=${encodeURIComponent(key)}`);
}
async function fetchPremiumBundle(key, projectId) {
  const attempts = [];
  for (const resource of KNOWN_RESOURCES) {
    let res;
    try {
      res = await fetchPremium(key, resource, projectId);
    } catch (err) {
      console.warn(`\u26A0\uFE0F  Premium fetch failed (network error): ${err.message}`);
      return null;
    }
    if (res.ok) {
      const bundle = Buffer.from(await res.arrayBuffer());
      console.info(`\u{1F50E} Premium entitlement probe: granted resource=${resource} (HTTP ${res.status}); prior denials=${attempts.join(", ") || "none"}`);
      console.info(`\u{1F50E} Premium bundle download: ${bundle.byteLength} bytes`);
      return bundle;
    }
    if (res.status === 401 || res.status === 403) {
      attempts.push(`${resource}=${res.status}`);
      continue;
    }
    console.warn(`\u26A0\uFE0F  Premium fetch failed: ${resource} returned HTTP ${res.status}; prior entitlement probes: ${attempts.join(", ") || "none"}`);
    return null;
  }
  console.warn(`\u26A0\uFE0F  Premium entitlement probes denied: ${attempts.join(", ")}`);
  return null;
}
async function applyPremiumOverlay(projectRoot, destDir) {
  const key = getLicenseKey();
  if (!key)
    return false;
  const tarballPath = cacheTarballPath(key);
  if (!isCacheFresh(tarballPath)) {
    console.info("\u{1F50E} Premium bundle cache: miss; requesting bundle from distribution service");
    const projectId = getOrCreateProjectId(projectRoot);
    const bundle = await fetchPremiumBundle(key, projectId);
    if (!bundle) {
      console.warn("\u26A0\uFE0F  No premium resources unlocked for this key - using free tier only.");
      return false;
    }
    mkdirSync2(join2(tarballPath, ".."), { recursive: true });
    writeFileSync2(tarballPath, bundle);
  } else {
    console.info("\u{1F50E} Premium bundle cache: hit (cached bundle reused)");
  }
  try {
    const extractDir = join2(tarballPath, "..", "extracted");
    mkdirSync2(extractDir, { recursive: true });
    extractTarball(readFileSync(tarballPath), extractDir);
    let applied = 0;
    const missing = [];
    for (const [src, dest] of Object.entries(PREMIUM_PATH_MAP)) {
      const from = join2(extractDir, src);
      if (!existsSync2(from)) {
        missing.push(src);
        continue;
      }
      const to = join2(destDir, dest);
      mkdirSync2(join2(to, ".."), { recursive: true });
      writeFileSync2(to, readFileSync(from));
      applied++;
    }
    const sablierPath = join2(extractDir, "networking/sablier_container_cycle.star");
    console.info(`\u{1F50E} Premium bundle contents: mapped=${applied}/${Object.keys(PREMIUM_PATH_MAP).length}; sablier_overlay=${existsSync2(sablierPath) ? "present" : "MISSING"}`);
    if (missing.length > 0) {
      console.info(`\u{1F50E} Premium bundle missing mapped files: ${missing.join(", ")}`);
    }
    if (!existsSync2(sablierPath) && process.env.FLISK_PREMIUM_DIAGNOSTICS === "1") {
      const sablierGranted = await hasSablierLicense(projectRoot);
      console.info(`\u{1F50E} Sablier entitlement check: ${sablierGranted ? "granted" : "not confirmed"}; compare with sablier_overlay above to distinguish license access from bundle contents`);
    }
    if (applied > 0) {
      console.log(`\u2713 Premium resources unlocked (${applied} file${applied === 1 ? "" : "s"})`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`\u26A0\uFE0F  Failed to apply premium overlay: ${err.message}`);
    return false;
  }
}
function liveResourceAccessCachePath(key, resource) {
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join2(homedir(), ".flisk", "cache", `premium-${safeName}`, `${resource}-access.json`);
}
async function hasLiveResourceLicense(projectRoot, resource) {
  const key = getLicenseKey();
  if (!key)
    return false;
  const cachePath = liveResourceAccessCachePath(key, resource);
  if (isCacheFresh(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
      console.info(`\u{1F50E} ${resource} entitlement probe: cache=${cached.granted === true ? "granted" : "denied"}`);
      return cached.granted === true;
    } catch {
    }
  }
  const projectId = getOrCreateProjectId(projectRoot);
  let granted = false;
  try {
    const res = await fetchPremium(key, resource, projectId);
    granted = res.ok;
    console.info(`\u{1F50E} ${resource} entitlement probe: HTTP ${res.status} (${granted ? "granted" : "denied"})`);
    if (res.body) {
      await res.arrayBuffer().catch(() => void 0);
    }
  } catch (err) {
    console.warn(`\u26A0\uFE0F  ${resource} license check failed (network error): ${err.message}`);
    return false;
  }
  try {
    mkdirSync2(join2(cachePath, ".."), { recursive: true });
    writeFileSync2(cachePath, JSON.stringify({ granted, checked: (/* @__PURE__ */ new Date()).toISOString() }));
  } catch {
  }
  return granted;
}
async function hasVerdaccioLicense(projectRoot) {
  return hasLiveResourceLicense(projectRoot, "verdaccio");
}
async function hasDddLicense(projectRoot) {
  return hasLiveResourceLicense(projectRoot, "ddd");
}
async function hasSablierLicense(projectRoot) {
  return hasLiveResourceLicense(projectRoot, "sablier");
}

export {
  extractTarball,
  applyPremiumOverlay,
  hasVerdaccioLicense,
  hasDddLicense,
  hasSablierLicense
};
