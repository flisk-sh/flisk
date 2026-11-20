/**
 * The resource folder, relative to the project root, as a portable `/`-separated path.
 *
 * Discovery stores the absolute path of each `service.json` because it needs to read the file, but
 * machine-readable output must be the same for the same project wherever it is checked out. Use
 * this helper for every JSON field that names a resource by location.
 */
export declare function relativeResourceFolder(projectRoot: string, configPath: string): string;
/**
 * The `service.json` manifest, relative to the project root, as a portable `/`-separated path.
 *
 * A separate field from `path` so callers that need the manifest can find it without putting an
 * absolute, machine-specific path in the output.
 */
export declare function relativeResourceManifest(projectRoot: string, configPath: string): string;
