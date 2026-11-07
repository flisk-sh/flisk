import type { DiscoveredResource } from "../types/index.js";
import { type DockerRunner } from "./docker-build-cache.js";
/** Services `flisk up` builds an image for: everything but libraries, SDKs, bring-your-own and services that name an `image`. */
export declare function countBuiltImages(services: readonly DiscoveredResource[]): number;
/**
 * Docker `reference` filters that match the images this run builds: `<project>_<stack>_<app>:dev` and the stack's
 * `<project>_<stack>-db-migrator:dev` (`app_image_name` / `migrator_image_name` in the engine's docker constants).
 * The engine lowercases the project name and turns `-` into `_`.
 */
export declare function projectImageFilters(projectName: string, services: readonly DiscoveredResource[]): string[];
/**
 * True when none of the project's images exist yet, so the run builds every image with no cache to reuse.
 * Returns false when Docker cannot be asked: the notice is a hint, never a reason to slow or fail `flisk up`.
 */
export declare function isColdStart(filters: readonly string[], run?: DockerRunner): Promise<boolean>;
/** The one line `flisk up` prints before a cold start (#3201). */
export declare function formatColdStartNotice(imageCount: number): string;
/** The notice for this run, or null on a warm start or when nothing is built. */
export declare function coldStartNotice(projectName: string, services: readonly DiscoveredResource[], run?: DockerRunner): Promise<string | null>;
