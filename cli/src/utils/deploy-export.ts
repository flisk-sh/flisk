// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Builds the text of the deploy files `flisk export` writes: a Render Blueprint (render.yaml) and a Cloudflare
 * Workers config (wrangler.toml), from service.json.
 *
 * This is the export scope agreed in AGENTS.md ("Local-only by default"): these functions only return text. Nothing
 * here deploys, creates DNS records or calls a cloud API, and no environment value is ever copied, only the names
 * (Render asks for each value itself because of `sync: false`). Kubernetes manifests stay out of scope.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DiscoveredResource } from "../types/index.js";
import { FliskError } from "./errors.js";

/** The resource types that serve HTTP, which is what a Render web service and a Worker are. */
export const EXPORTABLE_TYPES: readonly string[] = [
  "backend",
  "frontend",
  "agent",
  "mcp",
  "bring-your-own",
];

/** Health check path a service gets when service.json sets none (the same default the container healthcheck uses). */
export const DEFAULT_HEALTH_CHECK_PATH = "/health";

/** Candidate Worker entry points, relative to the resource directory, tried in order when package.json has no main. */
export const WORKER_ENTRY_CANDIDATES: readonly string[] = [
  "src/index.ts",
  "src/index.js",
  "src/worker.ts",
  "src/worker.js",
  "index.ts",
  "index.js",
];

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HOSTNAME = /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** A name Render and Cloudflare both accept: lowercase letters, digits and dashes. */
export function deployName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "service";
}

/** The environment variable names a service declares in service.json `env`. Values are never read out. */
export function envVarNames(resource: DiscoveredResource): string[] {
  const env = resource.config?.env;
  if (!env || typeof env !== "object") return [];
  return Object.keys(env)
    .filter((name) => ENV_NAME.test(name))
    .sort();
}

/** A string quoted the way both YAML and TOML read it (a JSON string is a valid double-quoted scalar in each). */
function quote(value: string): string {
  return JSON.stringify(value);
}

/** A project-relative path written with forward slashes and a leading `./`. */
function repoPath(projectRoot: string, absolute: string): string {
  const rel = relative(projectRoot, absolute).split(sep).join("/");
  return rel ? `./${rel}` : ".";
}

function readPackageJson(
  dir: string,
): { main?: unknown; scripts?: Record<string, unknown> } | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as { main?: unknown }) : null;
  } catch {
    return null;
  }
}

function dockerfileOf(resource: DiscoveredResource): string | null {
  const declared = resource.config?.dockerfile;
  const file = join(resource.path, typeof declared === "string" ? declared : "Dockerfile");
  return existsSync(file) ? file : null;
}

/** Refuses a resource that does not serve HTTP, so the export never writes a web service for a library or a job. */
export function assertExportable(resource: DiscoveredResource): void {
  const type = resource.config?.appType ?? resource.type;
  if (type && !EXPORTABLE_TYPES.includes(type)) {
    throw new FliskError(
      `Resource "${resource.name}" is a ${type}, which does not serve HTTP, so it is not exported`,
      [`Exported types: ${EXPORTABLE_TYPES.join(", ")}`, "flisk resources"],
    );
  }
}

/** One service block of a Render Blueprint, indented for the `services:` list. */
function renderService(projectRoot: string, resource: DiscoveredResource): string[] {
  assertExportable(resource);
  const lines = ["  - type: web", `    name: ${quote(deployName(resource.name))}`];
  const dockerfile = dockerfileOf(resource);
  const pkg = readPackageJson(resource.path);
  if (dockerfile) {
    lines.push(
      "    runtime: docker",
      `    dockerfilePath: ${quote(repoPath(projectRoot, dockerfile))}`,
      `    dockerContext: ${quote(repoPath(projectRoot, resource.path))}`,
    );
  } else if (pkg) {
    const hasBuild = typeof pkg.scripts?.build === "string";
    lines.push(
      "    runtime: node",
      `    rootDir: ${quote(relative(projectRoot, resource.path).split(sep).join("/") || ".")}`,
      `    buildCommand: ${quote(hasBuild ? "npm install && npm run build" : "npm install")}`,
      `    startCommand: ${quote("npm start")}`,
    );
  } else {
    throw new FliskError(
      `Resource "${resource.name}" has neither a Dockerfile nor a package.json, so Render has nothing to build`,
      ["Add a Dockerfile to the resource directory, or set dockerfile in service.json"],
    );
  }
  const health = resource.config?.healthCheckPath;
  lines.push(
    `    healthCheckPath: ${quote(typeof health === "string" && health ? health : DEFAULT_HEALTH_CHECK_PATH)}`,
  );
  const names = envVarNames(resource);
  if (names.length > 0) {
    lines.push("    envVars:");
    for (const name of names) lines.push(`      - key: ${name}`, "        sync: false");
  }
  return lines;
}

/** A Render Blueprint for the given resources. Every env var is listed by name with `sync: false`, never a value. */
export function buildRenderBlueprint(
  projectRoot: string,
  resources: readonly DiscoveredResource[],
): string {
  const header = [
    "# Render Blueprint written by `flisk export render` from service.json. Nothing was deployed.",
    "# Review it, commit it, then on render.com: New -> Blueprint. Render asks for every envVars value (sync: false);",
    "# no value is in this file.",
    "services:",
  ];
  const blocks = resources.flatMap((resource) => renderService(projectRoot, resource));
  return `${[...header, ...blocks].join("\n")}\n`;
}

/** The Worker entry point, relative to the resource directory. */
export function workerEntry(resource: DiscoveredResource): string {
  const pkg = readPackageJson(resource.path);
  if (typeof pkg?.main === "string" && pkg.main && existsSync(join(resource.path, pkg.main))) {
    return pkg.main.replace(/^\.\//, "");
  }
  const found = WORKER_ENTRY_CANDIDATES.find((candidate) =>
    existsSync(join(resource.path, candidate)),
  );
  if (!found) {
    throw new FliskError(`Resource "${resource.name}" has no Worker entry point`, [
      `Set "main" in its package.json, or add one of: ${WORKER_ENTRY_CANDIDATES.join(", ")}`,
    ]);
  }
  return found;
}

/** Validates a --route value: a bare host name such as api.example.com, no scheme, port or path. */
export function assertRouteHost(host: string): void {
  if (!HOSTNAME.test(host)) {
    throw new FliskError(`--route must be a host name such as api.example.com, got "${host}"`, [
      "Leave out https:// and any path",
    ]);
  }
}

/**
 * A wrangler.toml for one resource. `outDir` is where the file will be written, so `main` is relative to it.
 * Secrets are listed by name in a comment, for `wrangler secret put`; no value is ever written.
 */
export function buildWranglerToml(
  resource: DiscoveredResource,
  outDir: string,
  options: { route?: string; now?: Date } = {},
): string {
  assertExportable(resource);
  const entry = join(resource.path, workerEntry(resource));
  const main = relative(outDir, entry).split(sep).join("/");
  const date = (options.now ?? new Date()).toISOString().slice(0, 10);
  const lines = [
    "# Written by `flisk export wrangler` from service.json. Nothing was deployed and no DNS record was created.",
    `name = ${quote(deployName(resource.name))}`,
    `main = ${quote(main)}`,
    `compatibility_date = ${quote(date)}`,
  ];
  if (options.route) {
    assertRouteHost(options.route);
    lines.push("", `routes = [{ pattern = ${quote(options.route)}, custom_domain = true }]`);
  }
  const names = envVarNames(resource);
  if (names.length > 0) {
    lines.push(
      "",
      "# Environment from service.json, by name only. Set each one with `wrangler secret put <NAME>`:",
    );
    for (const name of names) lines.push(`#   ${name}`);
  }
  return `${lines.join("\n")}\n`;
}
