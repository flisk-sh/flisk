// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { DISK_SAFE_CLEANUP } from "./disk-guard.js";
import { defaultDockerRunner, parseDockerBuildCache, } from "./docker-build-cache.js";
const GIB = 1024 ** 3;
/** Below this much held space `flisk down` says nothing. */
const NOTABLE_GIB = 0.5;
/**
 * What `flisk down` leaves on the disk: the project's images (it keeps images, volumes and cache) and the shared
 * build cache. Returns null when Docker cannot be asked.
 */
export async function collectLeftovers(images, run = defaultDockerRunner) {
    try {
        const sizes = await Promise.all(images.map(async (ref) => {
            try {
                return (Number((await run(["image", "inspect", "--format", "{{.Size}}", ref])).trim()) || 0);
            }
            catch {
                return 0;
            }
        }));
        const df = await run([
            "system",
            "df",
            "--format",
            "{{.Type}}\t{{.TotalCount}}\t{{.Size}}\t{{.Reclaimable}}",
        ]);
        return {
            imageCount: images.length,
            imageGib: sizes.reduce((sum, bytes) => sum + bytes, 0) / GIB,
            cacheGib: parseDockerBuildCache(df)?.sizeGib ?? 0,
        };
    }
    catch {
        return null;
    }
}
/** The lines `flisk down` prints; empty when nothing notable is held. */
export function formatLeftovers(left, projectName) {
    const out = [];
    if (left.imageGib >= NOTABLE_GIB) {
        out.push(`${projectName} still holds ${left.imageGib.toFixed(1)} GiB in ${left.imageCount} ${left.imageCount === 1 ? "image" : "images"}. Free it (also deletes the project's volumes): flisk down --purge`);
    }
    if (left.cacheGib >= NOTABLE_GIB) {
        out.push(`The build cache, shared by every project, holds ${left.cacheGib.toFixed(1)} GiB. Free it: ${DISK_SAFE_CLEANUP}`);
    }
    return out;
}
