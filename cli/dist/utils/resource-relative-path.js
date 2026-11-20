// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { dirname, relative, sep } from "node:path";
/** Convert a path relative to the project root into the portable `/`-separated form used in JSON. */
function toPortableRelative(projectRoot, absolutePath) {
    const relativePath = relative(projectRoot, absolutePath);
    return (relativePath === "" ? "." : relativePath).split(sep).join("/");
}
/**
 * The resource folder, relative to the project root, as a portable `/`-separated path.
 *
 * Discovery stores the absolute path of each `service.json` because it needs to read the file, but
 * machine-readable output must be the same for the same project wherever it is checked out. Use
 * this helper for every JSON field that names a resource by location.
 */
export function relativeResourceFolder(projectRoot, configPath) {
    return toPortableRelative(projectRoot, dirname(configPath));
}
/**
 * The `service.json` manifest, relative to the project root, as a portable `/`-separated path.
 *
 * A separate field from `path` so callers that need the manifest can find it without putting an
 * absolute, machine-specific path in the output.
 */
export function relativeResourceManifest(projectRoot, configPath) {
    return toPortableRelative(projectRoot, configPath);
}
