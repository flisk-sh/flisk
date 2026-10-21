/**
 * Defaults shared by project generation and CLI predicates.
 *
 * Source of truth for `always_enabled_infra` when `.tdk/project.json` omits
 * the field. The generator bakes this into the Tiltfile
 * (`Tiltfile.hbs` → `ALWAYS_ENABLED_INFRA`); `should_enable` then returns
 * `RESOURCE_DEFAULTS.get(name, True)` for names in that list — so an omitted
 * field means database-management is ON for `flisk up`.
 *
 * `flisk doctor` / `flisk config verify` must use the same default, otherwise
 * they report Postgres-will-start while the engine does not start it (or
 * the reverse). See shared-platform-postgres.ts.
 */
export declare const DEFAULT_ALWAYS_ENABLED_INFRA: readonly ["database-management", "proxy"];
