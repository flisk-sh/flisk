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
export declare function buildMigrationPlan(projectRoot: string): MigrationPlan;
/** Applies a previously built plan. Callers must refuse to apply a plan that has failures. */
export declare function applyMigrationPlan(plan: MigrationPlan): void;
