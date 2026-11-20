// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from "node:fs";
import { SERVICE_MANIFEST_SCHEMA_VERSION, validateServiceManifest } from "./service-manifest.js";
import { discoverServiceManifestPaths } from "./services.js";

/** One `service.json` that would be rewritten by `flisk config migrate`. */
export interface PendingMigration {
  filePath: string;
  manifest: Record<string, unknown>;
}

/** The work `flisk config migrate` will do. Building it never writes to disk. */
export interface MigrationPlan {
  totalFiles: number;
  pending: PendingMigration[];
  failures: string[];
  warnings: string[];
}

/**
 * Builds the single migration plan used by both `flisk config migrate --dry-run` and a real run.
 * A failure for any file means nothing may be written, so planning is completely read-only.
 */
export function buildMigrationPlan(projectRoot: string): MigrationPlan {
  const plan: MigrationPlan = { totalFiles: 0, pending: [], failures: [], warnings: [] };
  const manifestPaths = discoverServiceManifestPaths(projectRoot);
  plan.totalFiles = manifestPaths.length;

  for (const filePath of manifestPaths) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (error) {
      plan.failures.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      plan.failures.push(`${filePath}: expected a JSON object`);
      continue;
    }

    const record = manifest as Record<string, unknown>;
    if (record.appType === undefined && typeof record.type === "string") {
      record.appType = record.type;
    }
    if (record.schemaVersion === SERVICE_MANIFEST_SCHEMA_VERSION) continue;
    if (record.schemaVersion !== undefined) {
      plan.failures.push(
        `${filePath}.schemaVersion: cannot migrate unsupported version ${String(record.schemaVersion)} automatically`,
      );
      continue;
    }

    const validation = validateServiceManifest(
      { ...record, schemaVersion: SERVICE_MANIFEST_SCHEMA_VERSION },
      filePath,
    );
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
export function applyMigrationPlan(plan: MigrationPlan): void {
  for (const migration of plan.pending) {
    writeFileSync(migration.filePath, `${JSON.stringify(migration.manifest, null, 2)}\n`);
  }
}
