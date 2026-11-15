// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import {
  areMasterFilesStale,
  isVendoredEngineStale,
  isWrappedTiltfileStale,
  verifyMasterConfigs,
} from "../generator/template-engine.js";
import type { DiscoveredResource } from "../types/index.js";
import { writeTextFileAtomic } from "./atomic-write.js";
import { findStaleDisabledResources, getDeferredResourceNames } from "./doctor-runtime.js";
import { isNativeService } from "./native-service.js";
import { getPackageVersion } from "./paths.js";
import { applyProfiles } from "./profiles.js";
import { resolveServiceUrl } from "./service-urls.js";
import { discoverResourcesWithProblems, discoverServiceManifestPaths } from "./services.js";
import { tiltAnswerIsForeign } from "./tilt-answer-owner.js";
import { findTiltPortOwner, isOwnTilt, type TiltPortOwner } from "./tilt-port-owner.js";
import { evaluateTiltReadiness, tiltGetUiResources } from "./up-readiness.js";
import {
  buildPrintedUrlTargets,
  checkPrintedUrls,
  URL_PROBE_TIMEOUT_MS,
  type UrlCheck,
  type UrlTarget,
} from "./url-check.js";

/** The state a run leaves behind so the next `flisk up` can recognize an unchanged, healthy stack (#4193). */
export const UP_STATE_VERSION = 1;
export const UP_STATE_FILE = "up-state.json";

/** Flags whose presence means the caller asked for a fresh run rather than the current stack. */
export interface FastNoopFlags {
  force?: boolean;
  dryRun?: boolean;
  ignoreDrift?: boolean;
  ignoreVersion?: boolean;
  only?: string[];
  envFile?: string;
  profile?: string[];
  database?: boolean;
  gateway?: boolean;
  stackName?: string;
  /** The port the caller configured; a different one from the recorded run needs the normal path. */
  configuredTiltPort: number | undefined;
  /** Names and values of the environment variables that change the generated stack. */
  env: NodeJS.ProcessEnv;
}

export interface FastNoopState {
  version: typeof UP_STATE_VERSION;
  fingerprint: string;
  tiltPort: number;
  /** PID of the Tilt that served the recorded run: a different listener means the normal path. */
  tiltPid: number | null;
  stack: string | null;
  services: string[];
  ingressPort: number | null;
  urls: string[];
}

/** Environment variables that change what the generated stack runs, so a changed value is not a no-op. */
const STACK_ENV_VARS = [
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
  "TILT_PORT",
];

/**
 * Where a run records its fingerprint. It lives under `~/.flisk/`, away from the generated files Tilt watches, so
 * recording it cannot start a build. Keyed by the project root (not its name): two folders with one project name
 * must not borrow each other's answer.
 */
export function statePathFor(projectRoot: string, home: string = homedir()): string {
  // macOS /tmp -> /private/tmp: canonicalize so a run started through a symlink finds the same record.
  let canonical = projectRoot;
  try {
    canonical = realpathSync(projectRoot);
  } catch {
    // A gone directory has no healthy stack to reuse; the fingerprint check refuses it anyway.
  }
  const slug = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return join(home, ".flisk", "project-up", `${slug}.json`);
}

export function readFastNoopState(projectRoot: string): FastNoopState | null {
  try {
    const value = JSON.parse(readFileSync(statePathFor(projectRoot), "utf-8")) as FastNoopState;
    if (
      value.version !== UP_STATE_VERSION ||
      typeof value.fingerprint !== "string" ||
      !Number.isInteger(value.tiltPort) ||
      !(value.tiltPid === null || Number.isInteger(value.tiltPid)) ||
      !Array.isArray(value.services) ||
      !Array.isArray(value.urls)
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

/** Never throws: a read-only home only costs the next run its fast path. */
export function writeFastNoopState(projectRoot: string, state: FastNoopState): void {
  try {
    const path = statePathFor(projectRoot);
    mkdirSync(join(path, ".."), { recursive: true });
    writeTextFileAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // The normal path works without this record.
  }
}

export function clearFastNoopState(projectRoot: string): void {
  try {
    rmSync(statePathFor(projectRoot), { force: true });
  } catch {
    // Nothing to clear.
  }
}

/** A file's contents, or a marker no file content can equal, so a missing file is a change. */
function contentOrMissing(file: string): string {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "\u0000missing";
  }
}

function hashFiles(
  hash: ReturnType<typeof createHash>,
  files: readonly string[],
  projectRoot: string,
): void {
  for (const file of [...files].sort()) {
    // Relative paths, so a checkout reached through a symlink hashes the same as one reached directly.
    hash.update(file.slice(projectRoot.length).split(sep).join("/")).update("\0");
    hash.update(contentOrMissing(file)).update("\0");
  }
}

/**
 * A hash of every input that decides the generated stack: the project config, every service.json and its generated
 * outputs, the master files, the vendored engine, .env, package.json and the environment overrides that reach the
 * engine. A change to any of them must take the normal `up` path.
 */
export function stackFingerprint(projectRoot: string, flags: FastNoopFlags): string | null {
  const hash = createHash("sha256");
  hash.update(`flisk:${getPackageVersion()}:${UP_STATE_VERSION}\0`);
  hashFiles(
    hash,
    [
      join(projectRoot, ".flisk", "project.json"),
      join(projectRoot, ".env"),
      join(projectRoot, ".tiltignore"),
      join(projectRoot, "package.json"),
      ...discoverServiceManifestPaths(projectRoot),
    ],
    projectRoot,
  );

  const generatedDir = join(projectRoot, ".flisk", ".flisk-out");
  if (!existsSync(join(generatedDir, "Tiltfile"))) return null;
  const generatedFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Tilt's own bookkeeping and the per-run port plan do not describe the stack.
      if (entry.name === "host-ports.json" || entry.name === UP_STATE_FILE) continue;
      const file = join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) generatedFiles.push(file);
    }
  };
  walk(generatedDir);
  hashFiles(hash, generatedFiles, projectRoot);

  // Every file a service's build reads (Dockerfiles, compose files, generated tsconfig/vite configs).
  const generatedServiceFiles: string[] = [];
  for (const manifest of discoverServiceManifestPaths(projectRoot)) {
    const dir = join(manifest, "..", ".autogenerated");
    if (!existsSync(dir)) continue;
    const collect = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const file = join(current, entry.name);
        if (entry.isDirectory()) collect(file);
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
    if (value !== undefined) hash.update(`${name}=${value}\0`);
  }
  return hash.digest("hex");
}

/** The URL lines a fast no-op prints, so `--wait` reports the same URLs as a normal start. */
export function fastNoopUrls(
  resources: readonly DiscoveredResource[],
  ingressPort: number | undefined,
  gatewayEnabled: boolean,
): string[] {
  if (!gatewayEnabled) return [];
  return resources.flatMap((resource) => {
    const url = resolveServiceUrl(resource, ingressPort);
    return url ? [url] : [];
  });
}

/** Whether the flags describe a plain `flisk up` (or `flisk up --wait`) of the whole project. */
export function isPlainUp(flags: FastNoopFlags): boolean {
  return (
    !flags.force &&
    !flags.dryRun &&
    !flags.ignoreDrift &&
    !flags.ignoreVersion &&
    !flags.only?.length &&
    flags.envFile === undefined &&
    !flags.profile?.length &&
    flags.database !== false &&
    flags.gateway !== false &&
    flags.stackName === undefined
  );
}

interface FastNoopDeps {
  readState: (root: string) => FastNoopState | null;
  fingerprint: (root: string, flags: FastNoopFlags) => string | null;
  tiltJson: (port: number) => Promise<string | null>;
  /** Who owns the listener on the Tilt port. Null means ownership cannot be confirmed. */
  ownerOf: (port: number) => TiltPortOwner | null;
  masterStale: (root: string) => boolean;
  wrappedStale: (root: string) => boolean;
  vendoredStale: (root: string) => boolean;
  drift: (root: string, resources: DiscoveredResource[]) => string[];
  discovery: (root: string) => { resources: DiscoveredResource[]; problems: unknown[] };
  staleDisabled: (json: string, root: string) => string[];
  readiness: typeof evaluateTiltReadiness;
  deferred: (resources: DiscoveredResource[]) => Set<string>;
  checkUrls: (targets: readonly UrlTarget[]) => Promise<UrlCheck[]>;
}

const defaultDeps: FastNoopDeps = {
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
        skipManifestValidation: true,
      }).handEdited;
    } catch {
      return ["unverifiable"];
    }
  },
  discovery: discoverResourcesWithProblems,
  staleDisabled: findStaleDisabledResources,
  readiness: evaluateTiltReadiness,
  deferred: getDeferredResourceNames,
  checkUrls: (targets) => checkPrintedUrls(targets, { deadlineMs: URL_PROBE_TIMEOUT_MS }),
};

export interface FastNoopResult {
  ok: boolean;
  state: FastNoopState;
  services: string[];
  urls: string[];
}

/**
 * Answers whether the project's own Tilt is already running the unchanged, healthy stack this `flisk up` would start.
 * Every question is a cheap, read-only check; any doubt falls back to the normal path. Nothing is written here.
 */
export async function tryFastNoop(
  projectRoot: string,
  flags: FastNoopFlags,
  deps: Partial<FastNoopDeps> = {},
): Promise<FastNoopResult | null> {
  const d = { ...defaultDeps, ...deps };
  const state = d.readState(projectRoot);
  if (!state || !isPlainUp(flags)) return null;
  if (flags.configuredTiltPort !== undefined && flags.configuredTiltPort !== state.tiltPort) {
    return null;
  }
  const fingerprint = d.fingerprint(projectRoot, flags);
  if (!fingerprint || fingerprint !== state.fingerprint) return null;
  // The recorded Tilt must still be the listener on the recorded port. A foreign project, a restarted Tilt (new PID)
  // or a listener whose ownership cannot be confirmed all take the normal path.
  const owner = d.ownerOf(state.tiltPort);
  if (
    !isOwnTilt(owner, projectRoot) ||
    owner === null ||
    state.tiltPid === null ||
    owner.pid !== state.tiltPid
  ) {
    return null;
  }
  if (d.masterStale(projectRoot) || d.wrappedStale(projectRoot) || d.vendoredStale(projectRoot)) {
    return null;
  }

  const discovered = d.discovery(projectRoot);
  if (discovered.problems.length > 0) return null;
  // Apply default profile selection (no active `--profile` or `--only`) so optional profiled services stay excluded
  // consistently with startup and recorded state.
  const selectedResources = applyProfiles(discovered.resources, [], []).kept;
  // A project with any selected local-process service takes `flisk up`'s native path, not the Docker/Tilt stack this
  // fast path describes. Its own already-running check is cheap and needs no fingerprint.
  if (selectedResources.some(isNativeService)) return null;
  const services = selectedResources.map((r) => r.name);
  if (services.length === 0 || services.join("\0") !== state.services.join("\0")) return null;
  if (d.drift(projectRoot, selectedResources).length > 0) return null;

  const json = await d.tiltJson(state.tiltPort);
  if (!json) return null;
  let parsed: { items?: unknown[] };
  try {
    parsed = JSON.parse(json) as { items?: unknown[] };
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
  if (tiltAnswerIsForeign(parsed, new Set(services))) return null;
  if (d.staleDisabled(json, projectRoot).length > 0) return null;
  // Every expected service must be listed and enabled; a missing resource is not a healthy stack.
  const listed = new Set(
    parsed.items.flatMap((item) => {
      const record = item as {
        metadata?: { name?: string };
        status?: { disableStatus?: { state?: string } };
      };
      return record.metadata?.name && record.status?.disableStatus?.state !== "Disabled"
        ? [record.metadata.name]
        : [];
    }),
  );
  const deferred = d.deferred(selectedResources);
  if (services.some((name) => deferred.has(name) || !listed.has(name))) return null;
  const readiness = d.readiness(json, deferred, undefined, undefined, () => false).result;
  if (!readiness.ready || readiness.failures.length > 0 || readiness.pending > 0) return null;

  const urlTargets =
    state.urls.length > 0
      ? buildPrintedUrlTargets(selectedResources, state.ingressPort ?? undefined, deferred)
      : [];
  if (urlTargets.length > 0) {
    const urlChecks = await d.checkUrls(urlTargets);
    if (urlChecks.some((check) => !check.didAnswer)) return null;
  }

  return { ok: true, state, services, urls: state.urls };
}
