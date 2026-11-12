import { type DockerRunner } from "./docker-build-cache.js";
export interface TiltImagePruneResult {
    removed: string[];
    kept: string[];
    /** Bytes of image size the removed tags referenced (shared layers may free less). */
    removedBytes: number;
}
interface TiltImage {
    repo: string;
    tag: string;
    created: number;
    bytes: number;
}
/** Tilt tags every build `tilt-<hash>`, so superseded builds stay tagged and never count as dangling. */
export declare function selectSupersededTiltImages(rows: string, keep: number): {
    remove: TiltImage[];
    kept: TiltImage[];
};
/**
 * Removes every `tilt-<hash>` tag except the newest `keep` per repository. `docker rmi <repo:tag>` only untags
 * and refuses an image a container still uses, so a running stack is never touched. Never throws.
 */
export declare function pruneSupersededTiltImages(keep?: number, run?: DockerRunner): Promise<TiltImagePruneResult>;
export {};
