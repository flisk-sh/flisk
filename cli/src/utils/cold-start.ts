// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { DiscoveredResource } from "../types/index.js";
import { type DockerRunner, defaultDockerRunner } from "./docker-build-cache.js";

/** App types Tilt never runs `docker_build` for (see `_register_single_resource` in the engine). */
const NO_IMAGE_APP_TYPES = new Set(["library", "sdk", "bring-your-own"]);

/** Services `flisk up` builds an image for: everything but libraries, SDKs, bring-your-own and services that name an `image`. */
export function countBuiltImages(services: readonly DiscoveredResource[]): number {
  return services.filter((service) => {
    const appType = service.config?.appType ?? service.type;
    if (appType && NO_IMAGE_APP_TYPES.has(appType)) return false;
    return !service.config?.image;
  }).length;
}

/**
 * Docker `reference` filters that match the images this run builds: `<project>_<stack>_<app>:dev` and the stack's
 * `<project>_<stack>-db-migrator:dev` (`app_image_name` / `migrator_image_name` in the engine's docker constants).
 * The engine lowercases the project name and turns `-` into `_`.
 */
export function projectImageFilters(
  projectName: string,
  services: readonly DiscoveredResource[],
): string[] {
  const project = projectName.toLowerCase().replaceAll("-", "_");
  const stacks = [...new Set(services.map((s) => s.stack).filter((s): s is string => Boolean(s)))];
  if (stacks.length === 0) return [`${project}_*`];
  return stacks.flatMap((stack) => [`${project}_${stack}_*`, `${project}_${stack}-db-migrator`]);
}

/**
 * True when none of the project's images exist yet, so the run builds every image with no cache to reuse.
 * Returns false when Docker cannot be asked: the notice is a hint, never a reason to slow or fail `flisk up`.
 */
export async function isColdStart(
  filters: readonly string[],
  run: DockerRunner = defaultDockerRunner,
): Promise<boolean> {
  if (filters.length === 0) return false;
  try {
    const args = ["images", "-q", ...filters.flatMap((f) => ["--filter", `reference=${f}`])];
    const stdout = await run(args);
    return stdout.trim() === "";
  } catch {
    return false;
  }
}

/** The one line `flisk up` prints before a cold start (#3201). */
export function formatColdStartNotice(imageCount: number): string {
  const images = imageCount === 1 ? "1 image" : `${imageCount} images`;
  return `First start: building ${images} from scratch. This takes a few minutes; later starts reuse the cache.`;
}

/** The notice for this run, or null on a warm start or when nothing is built. */
export async function coldStartNotice(
  projectName: string,
  services: readonly DiscoveredResource[],
  run: DockerRunner = defaultDockerRunner,
): Promise<string | null> {
  const imageCount = countBuiltImages(services);
  if (imageCount === 0) return null;
  const isCold = await isColdStart(projectImageFilters(projectName, services), run);
  return isCold ? formatColdStartNotice(imageCount) : null;
}
