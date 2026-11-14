// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFile } from "node:child_process";
const defaultTiltResourceReader = (port) => new Promise((resolve) => {
    execFile("tilt", ["get", "uiresources", "-o", "json", "--port", String(port)], { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : stdout));
});
/** Tilt rows that only exist to run a service. They are never counted as a service. */
const HELPER_NAME = /^(\(Tiltfile\)|service-discovery-daemon)$|-(yaml|run-only|typecheck)$/;
/** Setup steps that run before the services. They get their own phase label instead of a count. */
function infraLabel(name) {
    if (name === "golden-layers-build")
        return "Building base images";
    if (name === "init-networks")
        return "Preparing networks";
    if (name.startsWith("provision-db-"))
        return "Preparing databases";
    return undefined;
}
/** Reads the resource states from the Tilt UI API. */
export async function readStackProgress(port, read = defaultTiltResourceReader) {
    const json = await read(port);
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
    let total = 0;
    let infraPhase;
    for (const item of items) {
        const name = item.metadata?.name ?? "unknown";
        const update = item.status?.updateStatus ?? "";
        const runtime = item.status?.runtimeStatus ?? "";
        if (HELPER_NAME.test(name))
            continue;
        const infra = infraLabel(name);
        if (infra) {
            // An infrastructure step that fails is still a failure the user must see.
            if (update === "error" || runtime === "error") {
                failed += 1;
                broken.push({
                    name,
                    message: (item.status?.buildHistory?.[0]?.error ?? "the resource failed")
                        .replace(/\s+/g, " ")
                        .slice(0, 160),
                });
            }
            else if (update === "in_progress") {
                infraPhase ??= infra;
            }
            continue;
        }
        total += 1;
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
        // "none" is a resource Tilt never builds: it is not building, and it is up when it runs fine.
        if (update === "none") {
            if (runtime === "ok" || runtime === "not_applicable") {
                ready += 1;
            }
            else {
                pending += 1;
                working.push({ name, state: runtime || "pending" });
            }
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
    return { ready, building, pending, failed, total, infraPhase, working, broken };
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
