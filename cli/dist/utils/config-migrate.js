// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from "node:fs";
import { SERVICE_MANIFEST_SCHEMA_VERSION, validateServiceManifest } from "./service-manifest.js";
import { discoverServiceManifestPaths } from "./services.js";
/**
 * Builds the single migration plan used by both `flisk config migrate --dry-run` and a real run.
 * A failure for any file means nothing may be written, so planning is completely read-only.
 */
export function buildMigrationPlan(projectRoot) {
    const plan = { totalFiles: 0, pending: [], failures: [], warnings: [] };
    const manifestPaths = discoverServiceManifestPaths(projectRoot);
    plan.totalFiles = manifestPaths.length;
    for (const filePath of manifestPaths) {
        let manifest;
        try {
            manifest = JSON.parse(readFileSync(filePath, "utf-8"));
        }
        catch (error) {
            plan.failures.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
            plan.failures.push(`${filePath}: expected a JSON object`);
            continue;
        }
        const record = manifest;
        if (record.appType === undefined && typeof record.type === "string") {
            record.appType = record.type;
        }
        if (record.schemaVersion === SERVICE_MANIFEST_SCHEMA_VERSION)
            continue;
        if (record.schemaVersion !== undefined) {
            plan.failures.push(`${filePath}.schemaVersion: cannot migrate unsupported version ${String(record.schemaVersion)} automatically`);
            continue;
        }
        const validation = validateServiceManifest({ ...record, schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION }, filePath);
        if (validation.errors.length > 0) {
            plan.failures.push(...validation.errors);
            continue;
        }
        plan.warnings.push(...validation.warnings);
        record.schemaVersion = SERVICE_MANIFEST_SCHEMA_VERSION;
        plan.pending.push({ filePath, manifest: record });
    }
    return plan;
}
/** Applies a previously built plan. Callers must refuse to apply a plan that has failures. */
export function applyMigrationPlan(plan) {
    for (const migration of plan.pending) {
        writeFileSync(migration.filePath, `${JSON.stringify(migration.manifest, null, 2)}\n`);
    }
}
