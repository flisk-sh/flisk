import { type DockerRunner } from "./docker-build-cache.js";
export interface Leftovers {
    imageCount: number;
    imageGib: number;
    /** The BuildKit cache, shared by every project on the machine. */
    cacheGib: number;
}
/**
 * What `flisk down` leaves on the disk: the project's images (it keeps images, volumes and cache) and the shared
 * build cache. Returns null when Docker cannot be asked.
 */
export declare function collectLeftovers(images: readonly string[], run?: DockerRunner): Promise<Leftovers | null>;
/** The lines `flisk down` prints; empty when nothing notable is held. */
export declare function formatLeftovers(left: Leftovers, projectName: string): string[];
