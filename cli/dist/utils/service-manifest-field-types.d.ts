/**
 * An absolute path or a Windows drive. Build paths are relative to the service directory (the loader joins them to it), so an
 * absolute one can never resolve. `..` is allowed on purpose: a service.json inside the project may build from a source tree
 * outside it (docs/layout.md, docs/byo.md), and `flisk import` writes exactly that for a Compose service whose Dockerfile stays
 * where it was.
 */
export declare function isAbsoluteBuildPath(value: string): boolean;
/** Errors for a field of the wrong type, an enum value that does not exist, an escaping path, or a conflicting source. */
export declare function fieldTypeErrors(manifest: Record<string, unknown>, displayPath: string): string[];
