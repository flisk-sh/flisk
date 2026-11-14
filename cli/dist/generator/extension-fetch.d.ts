/**
 * Fetches (with a local, time-limited cache) the premium bundle for the
 * configured license key and overlays its files onto the already-vendored
 * free engine at destDir. Best-effort: returns false (never throws) if
 * there's no key configured, the key doesn't grant anything, or the fetch
 * fails - the caller should keep going with the free engine either way.
 */
export declare function applyPremiumOverlay(projectRoot: string, destDir: string): Promise<boolean>;
/** Checks whether the configured license key grants the "verdaccio" resource. */
export declare function hasVerdaccioLicense(projectRoot: string): Promise<boolean>;
/**
 * Checks whether the configured license key grants the "ddd" resource
 * (domain-driven-design folder structure + path aliases for backend
 * resources - see generate_backend_path_aliases() in
 * engine/topologies/tilt/generators/vite/helpers.star).
 */
export declare function hasDddLicense(projectRoot: string, options?: {
    cachedOnly?: boolean;
}): Promise<boolean>;
/**
 * Checks whether the configured license key grants the "sablier" resource
 * (on-demand start/stop for idle resources via a `sablier: {enable: true}`
 * manifest block - see sablier_container_cycle.star in
 * engine/topologies/platform/docker/networking/).
 */
export declare function hasSablierLicense(projectRoot: string): Promise<boolean>;
