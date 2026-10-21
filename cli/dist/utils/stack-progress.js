// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
/** Reads the resource states from the Tilt UI API. */
export async function readStackProgress(port, tiltBin = "tilt") {
    const json = await new Promise((resolve) => {
        execFile(tiltBin, ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
    });
    if (!json)
        return undefined;
    let items = [];
    try {
        const parsed = JSON.parse(json);
        items = parsed.items ?? [];
    }
    catch {
        return undefined;
    }
    const working = [];
    const broken = [];
    let ready = 0;
    let building = 0;
    let pending = 0;
    let failed = 0;
    for (const item of items) {
        const name = item.metadata?.name ?? "unknown";
        const update = item.status?.updateStatus ?? "";
        const runtime = item.status?.runtimeStatus ?? "";
        if (update === "error" || runtime === "error") {
            failed += 1;
            broken.push({
                name,
                message: (item.status?.buildHistory?.[0]?.error ?? "the resource failed")
                    .replace(/\s+/g, " ")
                    .slice(0, 160),
            });
            continue;
        }
        if (update === "ok" && (runtime === "ok" || runtime === "not_applicable" || runtime === "")) {
            ready += 1;
            continue;
        }
        if (update === "pending" || update === "") {
            pending += 1;
            working.push({ name, state: runtime || "pending" });
            continue;
        }
        building += 1;
        working.push({ name, state: update });
    }
    return { ready, building, pending, failed, total: items.length, working, broken };
}
/** A one-line summary of the progress, for the progress line. */
export function formatProgress(progress) {
    const minutes = Math.floor(progress.elapsed / 60);
    const seconds = Math.round(progress.elapsed % 60);
    const elapsed = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    const parts = [`${progress.ready}/${progress.total} resources ready`, elapsed];
    if (progress.building > 0)
        parts.push(`${progress.building} building`);
    if (progress.pending > 0)
        parts.push(`${progress.pending} queued`);
    if (progress.failed > 0)
        parts.push(`${progress.failed} failed`);
    return parts.join(" · ");
}
