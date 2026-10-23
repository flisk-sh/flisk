// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Fetches the paid-tier "premium" resource bundle (playwright, c4-diagram,
// logging, agents-md, sablier, verdaccio, and a few other extras - see
// tdk-cli-extensions/premium/) from the gated distribution worker, when a
// license key is configured. The free engine never needs this for its own
// resources - docker-compose, npm, bun, etc. are already public in this
// repo, no key required.
//
// DDD (domain-driven-design scaffolding) is the one paid feature that is
// NOT a file overlay: it's gated separately by hasDddLicense() below, via
// the shared hasLiveResourceLicense() helper, since its code stays in this
// public repo and is turned on/off by a runtime check rather than swapped
// in - see that helper's own comment for why it can't just be added to
// KNOWN_RESOURCES. hasVerdaccioLicense()/hasSablierLicense() also use that
// same helper, but only to print a "this needs a license" warning in
// template-engine.ts - Verdaccio and Sablier's real gate is the file
// overlay above (their public files are disabled stubs, not gated code).
//
// The worker (flisk-extension-dist) is the real access-control boundary: it
// checks the key against BUNDLES_REPO/keys/*.json - existence, activation/
// expiry dates, granted resources, and a per-key project limit - before
// serving anything. This client just asks and, if granted, unpacks the
// result over the vendored stub files so the generator pipeline picks up
// the real implementations transparently. See
// flisk-extension-dist/src/index.ts for the server-side enforcement and
// flisk-extension-dist/src/project-limit.ts for the project-limit logic.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { extractTarball } from "../utils/tar.js";

const DEFAULT_ENDPOINT =
  "https://tdk-extension-dist.oranguman.workers.dev/v1/premium/bundle.tar.gz";

// Tried in order until one is granted - the worker unlocks the whole
// bundle on the first resource name a key is found to grant, since
// premium.tar.gz ships all paid resources together. Keep in sync with
// what issue-key.yml/update-key.yml accept as `resources` entries.
const KNOWN_RESOURCES = [
  "playwright",
  "c4-diagram",
  "logging",
  "agents-md",
  "sablier",
  "verdaccio",
];

// Re-check the license periodically rather than trusting a local cache
// forever - an expired or revoked key shouldn't keep unlocking premium
// content indefinitely just because it worked once.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// Maps each file's path inside premium.tar.gz to where it belongs in the
// vendored engine output, so the generator pipeline finds it in the same
// place the free stub (or, for the never-wired items, nothing at all)
// used to be.
const PREMIUM_PATH_MAP: Record<string, string> = {
  "typescript/playwright_config.star":
    "engine/topologies/tilt/generators/typescript/playwright_config.star",
  "generators/agents_md.star": "engine/topologies/tilt/generators/agents_md.star",
  "c4_diagram.star": "engine/topologies/tilt/generators/c4_diagram.star",
  "observability/logging.star": "engine/topologies/platform/observability/logging.star",
  "generators/database_provisioner.star":
    "engine/topologies/tilt/generators/database_provisioner.star",
  "generators/dependency_manifest.star":
    "engine/topologies/tilt/generators/dependency_manifest.star",
  "generators/fixed_frontend_tsconfig.star":
    "engine/topologies/tilt/generators/typescript/fixed_frontend_tsconfig.star",
  "synthetic_monitor.star": "engine/resources/synthetic_monitor.star",
  "synthetic-monitor-topology.star": "engine/topologies/platform/services/synthetic-monitor.star",
  "database-management-service.yaml": "platform/services/platform/database-management/service.yaml",
  "networking/sablier_container_cycle.star":
    "engine/topologies/platform/docker/networking/sablier_container_cycle.star",
  "registries/verdaccio_loader.star": "engine/topologies/platform/registries/verdaccio_loader.star",
};

function getLicenseKey(): string | null {
  return process.env.TDK_LICENSE_KEY?.trim() || null;
}

function getEndpoint(): string {
  return process.env.TDK_PREMIUM_ENDPOINT?.trim() || DEFAULT_ENDPOINT;
}

// A stable per-project id for the worker's project-limit tracking - not a
// device or user id. Generated once and persisted alongside the rest of
// the project's .tdk/ state.
function getOrCreateProjectId(projectRoot: string): string {
  const idPath = join(projectRoot, ".tdk", ".project-id");
  if (existsSync(idPath)) {
    return readFileSync(idPath, "utf-8").trim();
  }
  const id = randomUUID();
  mkdirSync(join(projectRoot, ".tdk"), { recursive: true });
  writeFileSync(idPath, `${id}\n`);
  return id;
}

function cacheTarballPath(key: string): string {
  // Cache is per-key (not shared across different keys on the same
  // machine) so switching license keys doesn't serve a stale bundle
  // fetched under a different plan.
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(homedir(), ".tdk", "cache", `premium-${safeName}`, "premium.tar.gz");
}

function isCacheFresh(path: string): boolean {
  if (!existsSync(path)) return false;
  return Date.now() - statSync(path).mtimeMs < CACHE_TTL_MS;
}

// Sends the key as `Authorization: Bearer`, never in the URL, where request
// logs and proxies record it. A worker deployed before it read the header
// answers 401 "missing key" (a current one only returns 401 when it gets no
// key at all), so retry that once with the old `?key=` - premium keeps
// working until the worker is updated. Drop the retry once it is.
async function fetchPremium(key: string, resource: string, projectId: string): Promise<Response> {
  const url =
    `${getEndpoint()}?resource=${encodeURIComponent(resource)}` +
    `&projectId=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (res.status !== 401) return res;
  await res.arrayBuffer().catch(() => undefined);
  return fetch(`${url}&key=${encodeURIComponent(key)}`);
}

async function fetchPremiumBundle(key: string, projectId: string): Promise<Buffer | null> {
  const attempts: string[] = [];
  for (const resource of KNOWN_RESOURCES) {
    let res: Response;
    try {
      res = await fetchPremium(key, resource, projectId);
    } catch (err) {
      console.warn(`⚠️  Premium fetch failed (network error): ${(err as Error).message}`);
      return null;
    }

    if (res.ok) {
      const bundle = Buffer.from(await res.arrayBuffer());
      console.info(
        `🔎 Premium entitlement probe: granted resource=${resource} (HTTP ${res.status}); prior denials=${attempts.join(", ") || "none"}`,
      );
      console.info(`🔎 Premium bundle download: ${bundle.byteLength} bytes`);
      return bundle;
    }
    if (res.status === 401 || res.status === 403) {
      // Not granted for this specific resource name - try the next one
      // before concluding the key has nothing to offer.
      attempts.push(`${resource}=${res.status}`);
      continue;
    }
    // Anything else (404 missing bundle release, 502 upstream failure,
    // etc.) won't be fixed by trying a different resource name.
    console.warn(
      `⚠️  Premium fetch failed: ${resource} returned HTTP ${res.status}; prior entitlement probes: ${attempts.join(", ") || "none"}`,
    );
    return null;
  }
  console.warn(`⚠️  Premium entitlement probes denied: ${attempts.join(", ")}`);
  return null;
}

/**
 * Fetches (with a local, time-limited cache) the premium bundle for the
 * configured license key and overlays its files onto the already-vendored
 * free engine at destDir. Best-effort: returns false (never throws) if
 * there's no key configured, the key doesn't grant anything, or the fetch
 * fails - the caller should keep going with the free engine either way.
 */
export async function applyPremiumOverlay(projectRoot: string, destDir: string): Promise<boolean> {
  const key = getLicenseKey();
  if (!key) return false;

  const tarballPath = cacheTarballPath(key);

  if (!isCacheFresh(tarballPath)) {
    console.info("🔎 Premium bundle cache: miss; requesting bundle from distribution service");
    const projectId = getOrCreateProjectId(projectRoot);
    const bundle = await fetchPremiumBundle(key, projectId);
    if (!bundle) {
      console.warn("⚠️  No premium resources unlocked for this key - using free tier only.");
      return false;
    }
    mkdirSync(join(tarballPath, ".."), { recursive: true });
    writeFileSync(tarballPath, bundle);
  } else {
    console.info("🔎 Premium bundle cache: hit (cached bundle reused)");
  }

  try {
    const extractDir = join(tarballPath, "..", "extracted");
    mkdirSync(extractDir, { recursive: true });
    extractTarball(readFileSync(tarballPath), extractDir);

    let applied = 0;
    const missing: string[] = [];
    for (const [src, dest] of Object.entries(PREMIUM_PATH_MAP)) {
      const from = join(extractDir, src);
      if (!existsSync(from)) {
        missing.push(src);
        continue;
      }
      const to = join(destDir, dest);
      mkdirSync(join(to, ".."), { recursive: true });
      writeFileSync(to, readFileSync(from));
      applied++;
    }

    const sablierPath = join(extractDir, "networking/sablier_container_cycle.star");
    console.info(
      `🔎 Premium bundle contents: mapped=${applied}/${Object.keys(PREMIUM_PATH_MAP).length}; sablier_overlay=${existsSync(sablierPath) ? "present" : "MISSING"}`,
    );
    if (missing.length > 0) {
      console.info(`🔎 Premium bundle missing mapped files: ${missing.join(", ")}`);
    }
    if (!existsSync(sablierPath) && process.env.TDK_PREMIUM_DIAGNOSTICS === "1") {
      const sablierGranted = await hasSablierLicense(projectRoot);
      console.info(
        `🔎 Sablier entitlement check: ${sablierGranted ? "granted" : "not confirmed"}; compare with sablier_overlay above to distinguish license access from bundle contents`,
      );
    }

    if (applied > 0) {
      console.log(`✓ Premium resources unlocked (${applied} file${applied === 1 ? "" : "s"})`);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`⚠️  Failed to apply premium overlay: ${(err as Error).message}`);
    return false;
  }
}

function liveResourceAccessCachePath(key: string, resource: string): string {
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(homedir(), ".tdk", "cache", `premium-${safeName}`, `${resource}-access.json`);
}

/**
 * Checks whether the configured license key grants a given "live" premium
 * resource. Originally added for resources with nothing to swap on disk
 * (ddd is still exactly that: gated code baked into the free engine, no
 * file overlay). verdaccio and sablier also use this - not because they
 * lack a PREMIUM_PATH_MAP entry (they have one now), but because their
 * public files are already disabled stubs regardless of license, so this
 * check only ever drives a "you need a license for this" warning in
 * template-engine.ts, never an actual enable/disable decision. Can't reuse
 * KNOWN_RESOURCES/fetchPremiumBundle for that warning either: that loop
 * stops at the FIRST resource the key grants and would report false for a
 * key that grants this resource but not, say, playwright (or vice versa).
 *
 * Best-effort: returns false (never throws) if there's no key, the fetch
 * fails, or the worker denies the resource - the caller decides what "not
 * licensed" means. Caches the grant/deny outcome (not the bundle itself,
 * which we never need here) for CACHE_TTL_MS so repeated checks don't
 * re-download the full premium.tar.gz just to read a status code.
 */
async function hasLiveResourceLicense(projectRoot: string, resource: string): Promise<boolean> {
  const key = getLicenseKey();
  if (!key) return false;

  const cachePath = liveResourceAccessCachePath(key, resource);
  if (isCacheFresh(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as { granted: boolean };
      console.info(
        `🔎 ${resource} entitlement probe: cache=${cached.granted === true ? "granted" : "denied"}`,
      );
      return cached.granted === true;
    } catch {
      // Corrupt/unreadable cache - fall through and re-check live.
    }
  }

  const projectId = getOrCreateProjectId(projectRoot);

  let granted = false;
  try {
    const res = await fetchPremium(key, resource, projectId);
    granted = res.ok;
    console.info(
      `🔎 ${resource} entitlement probe: HTTP ${res.status} (${granted ? "granted" : "denied"})`,
    );
    // Drain the body (a full premium.tar.gz on success) so we don't leave
    // it dangling - we only need the status, not the content.
    if (res.body) {
      await res.arrayBuffer().catch(() => undefined);
    }
  } catch (err) {
    console.warn(`⚠️  ${resource} license check failed (network error): ${(err as Error).message}`);
    return false;
  }

  try {
    mkdirSync(join(cachePath, ".."), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ granted, checked: new Date().toISOString() }));
  } catch {
    // Best-effort cache; a write failure just means we re-check next time.
  }

  return granted;
}

/** Checks whether the configured license key grants the "verdaccio" resource. */
export async function hasVerdaccioLicense(projectRoot: string): Promise<boolean> {
  return hasLiveResourceLicense(projectRoot, "verdaccio");
}

/**
 * Checks whether the configured license key grants the "ddd" resource
 * (domain-driven-design folder structure + path aliases for backend
 * resources - see generate_backend_path_aliases() in
 * engine/topologies/tilt/generators/vite/helpers.star).
 */
export async function hasDddLicense(projectRoot: string): Promise<boolean> {
  return hasLiveResourceLicense(projectRoot, "ddd");
}

/**
 * Checks whether the configured license key grants the "sablier" resource
 * (on-demand start/stop for idle resources via a `sablier: {enable: true}`
 * manifest block - see sablier_container_cycle.star in
 * engine/topologies/platform/docker/networking/).
 */
export async function hasSablierLicense(projectRoot: string): Promise<boolean> {
  return hasLiveResourceLicense(projectRoot, "sablier");
}
