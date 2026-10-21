# Design

## Context

Flisk local orchestration registers a `postgres` Tilt resource only from the platform `database-management` stack feature. On `main` of this repo:

- `_load_database_management` in `engine/topologies/tilt/resources/infra-loader.star` returns immediately when `should_enable('database-management')` is false. When the feature is on, it ensures `services/platform/database-management/docker-compose.yml` (generating it if missing) and registers `dc_resource('postgres', ...)`.
- `_build_infra_dependencies` in `engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star` appends `postgres` to every service's `resource_deps` only when `should_enable('database-management')` is true.
- `_resolve_dependency_to_resource` maps a `dependsOn` short name through the services map, then a `-yaml` suffix, then stack/prefix matching, and finally returns `dep_name + '-yaml'` as a last resort. It has no special case for `postgres` or `database-management`.
- Manifest validation and `flisk doctor` accept `postgres` / `database-management` in `dependsOn` without reporting a missing service (the name is treated as known even when no Postgres resource exists). They do **not** report that Postgres will start because of that dependency.
- `flisk resource` still writes `"dependsOn": []` except when Prisma is enabled (which writes `["postgres"]`). That scaffold path is issue [#531](https://github.com/flisk-sh/flisk/issues/531) and is out of scope here.

Issue [#533](https://github.com/flisk-sh/flisk/pull/533) was closed without merging. Its proposed resolution (map both names to the Tilt `postgres` resource, drop the entry when the resource does not exist, Prisma scaffolding, doctor availability checks) is **not** on `main`. This spec must not cite #533 as shipped behavior. The source for the current path is [#531](https://github.com/flisk-sh/flisk/issues/531).

Problem on main: with `database-management` off, a manifest such as

```json
{ "name": "orders-api", "dependsOn": ["postgres"] }
```

is valid, accepted by verify/doctor, ignored at start: `flisk up` starts the service and does not start Postgres. With the feature on, Postgres starts because of the feature, not because of the dependency name.

Stakeholders: Flisk CLI users writing `service.json` manifests; maintainers of the Starlark engine and CLI doctor/verify.

## Goals / Non-Goals

**Goals:**

- Make `dependsOn: ["postgres"]` and `dependsOn: ["database-management"]` a start signal for the **one shared platform database** when at least one **selected** resource lists either name.
- Reuse the existing platform Compose (`services/platform/database-management/docker-compose.yml`) and the existing `postgres` Tilt resource — no second image, port, or volume.
- Keep the dependent's Tilt edge on `postgres`, without adding a duplicate edge when `database-management` already carries it.
- Materialize platform files when starting Postgres because of a dependency, not only a Tilt edge (so `flisk up` does not wait on a resource with no compose).
- Make verify/doctor report Postgres-will-start because of that dependency; keep unknown names as errors.
- Bound the start signal to the current `flisk up` / resource selection.
- Ensure this path does **not** start Prisma or rewrite `featuresEnabled` when Prisma is not enabled.

**Non-Goals:**

- Prisma, migrators, `featuresEnabled`, or changing what `flisk resource` scaffolds (`dependsOn: []`). See #531.
- Per-service databases, custom Postgres images, or alternate host ports.
- Production deployment changes; this is local orchestration only.
- Changing how `database-management` itself starts Postgres when the feature is already on.

## Decisions

- **Decision: Both names mean the one shared platform database.** `postgres` and `database-management` resolve to the same Tilt resource (`postgres`) and the same platform Compose. Do not fall through to `postgres-yaml` for these two names. *Rationale:* #531 already documents the dual naming (feature name vs Tilt resource name); users should not need to know which surface they are on. *Alternative:* treat only `postgres` as special — rejected: leaves `database-management` as a silent no-op when the feature is off.
- **Decision: Start signal is "any selected resource depends on it," not "feature on."** If any resource in the current selection lists either name, Postgres starts even when `database-management` is off. If no selected resource lists either name and the feature is off, Postgres stays off. *Rationale:* the dependency is the user's explicit request for the database; the feature is a project-wide switch that may be off. *Alternative:* enable the project feature globally when any manifest lists the name — rejected: expands scope to every service in the project and blurs selection.
- **Decision: "Start Postgres" materializes platform files, then registers the existing resource.** Starting because of `dependsOn` must ensure `services/platform/database-management/docker-compose.yml` exists (same generation/path as `_ensure_database_management_compose` / `_load_database_management`) and register the existing `postgres` Tilt resource (same image, same host port, same network). *Rationale:* a Tilt edge without compose makes `flisk up` wait forever; a second compose/image/port fragments the shared database. *Alternative:* only add a resource_deps edge — rejected: nothing starts Postgres. *Alternative:* invent a new resource name (`postgres-dependency`) — rejected: breaks wait-on-`postgres` and duplicates infra.
- **Decision: Selection bound is engine-only.** A `dependsOn` on a service this `flisk up` does not select MUST NOT start Postgres. Verify/doctor do **not** take that filter — they evaluate the project resources they already inspect. *Rationale:* keep the start signal honest to what is being brought up; keep diagnostics project-scoped so CLI and engine are not forced into one selection model. *Alternative:* make verify/doctor accept the same filter as `flisk up` — rejected for now: they are project health commands; if that filter exists later, it must match this rule exactly. *Alternative:* engine starts Postgres for any project `dependsOn` regardless of selection — rejected: over-starts infra.
- **Decision: Feature-on path is not "unchanged" for resolution or doctor reporting.** When `database-management` is on, Postgres still starts via the feature (one `postgres` resource, same Compose/port). This change still special-cases both names in `_resolve_dependency_to_resource` in **both** feature states (main can fall through to `postgres-yaml` even with the feature on) and adds a verify/doctor "will start" report instead of silent accept. *Rationale:* claiming "unchanged" would hide two real behavior changes reviewers asked us to name.
- **Decision: Keep the edge; do not drop or double-add.** When Postgres exists (feature on or dependency-triggered), the selected resource's Tilt `resource_deps` includes `postgres` exactly once. `resource_deps` is Tilt **start order**, not a new health contract — readiness stays whatever the existing `database-management` path already does on that resource. Do not drop the entry when it is the reason Postgres should exist. When `database-management` already adds `postgres` via `_build_infra_dependencies`, do not append it again from `dependsOn`. When neither the feature nor a selected dependency starts Postgres, the existing no-`postgres`-resource path is unchanged (no wait on a missing name). *Rationale:* dropping the entry when it is the start reason is the bug; double edges are noise; overclaiming "healthy" invents a contract this change does not own. *Alternative:* always rewrite manifests — rejected: no need; Tilt only needs the resolved edge.
- **Decision: Verify/doctor report the start reason.** When any inspected project resource depends on either name and Postgres will start (feature on, or this new dependency path), report that Postgres will start because of that dependency. Do not report `postgres` / `database-management` as missing services in that case. Unknown names (e.g. `postgress`) stay missing-service errors. *Rationale:* today verify/doctor accept the name silently and never say Postgres will start — the DX gap in #643. *Alternative:* only fail when Postgres would not start — rejected: leaves the user without the "it will start" signal when the path is valid.
- **Decision: Do not treat a Compose file alone as proof Postgres starts.** For the **engine start path**, availability is: feature on **or** a selected resource depends on either shared-DB name. For **verify/doctor reporting**, availability is: feature on **or** any inspected project resource depends on either name (no `flisk up` filter). A hand-written `services/platform/database-management/docker-compose.yml` with the feature off and no such `dependsOn` does not start Postgres (unchanged today). *Rationale:* Tilt skips `_load_database_management` when the feature is off, regardless of files on disk; CLI and engine share the same predicate shape but different resource sets.
- **Decision: Implementation home.** Engine owns resolution + materialize + single edge + engine selection bound. CLI verify/doctor reuse the same predicate shape over their project resource set. `flisk up` selection is the existing resource-selection path; no new CLI surface. *Rationale:* one predicate for "will Postgres start," two explicit resource sets (run selection vs project inspect).
- **Decision: Prisma and other features are not started by this dependency.** Starting shared Postgres because of `dependsOn` MUST NOT enable, launch, or scaffold Prisma, migrators, or any other `featuresEnabled` entry. If `prisma` is not in `featuresEnabled`, this path starts Postgres only. Scaffold output from `flisk resource` stays `"dependsOn": []`. *Rationale:* #643 is only about `dependsOn` starting Postgres; coupling it to Prisma would blur #531 and risk accidental feature enablement. *Alternative:* auto-enable Prisma when Postgres starts — rejected: wrong signal, out of scope.
- **Decision: Expanded test matrix is part of the spec, not a follow-up.** The capability spec carries scenarios for feature on/off, both names, materialization, edge duplication, selection bound, verify/doctor agreement, typos/near-misses, no second DB/image/port, and Prisma-not-enabled non-start. Tasks require unit + CLI + manual coverage for those cases. *Rationale:* the bug is "valid manifest is ignored"; regression tests must pin every bound.

## Risks / Trade-offs

- **Feature already on + dependency also lists Postgres** → Edge and start path must converge on one `postgres` resource and one edge. Mitigate: idempotent registration (if `postgres` already in `resource_deps`, do not append) and reuse `_load_database_management` rather than a second loader.
- **Partial `flisk up` selection vs verify/doctor project scope** → Engine must not start Postgres for unselected dependents; verify/doctor must still report when any inspected project resource depends on either name. Mitigate: document both resource sets; test engine selection-bound separately from CLI project-scope reporting.
- **Compose materialization writes generated files into the project** → Same behavior as the existing feature path when the feature is on; new only when the feature is off. Mitigate: reuse the existing generator and path; document that generated files are TDK-owned.
- **Doctor/verify drift from engine** → Reporting "will start" while Tilt does not, or vice versa. Mitigate: shared predicate shape; document that resource sets differ (project inspect vs run selection); cover both in tasks as one unit of work; require verify/doctor agreement tests.
- **Accidental Prisma enablement / side-start** → Starting Postgres must not imply Prisma. Mitigate: explicit non-goal + regression scenarios that Prisma jobs/services/`featuresEnabled` stay untouched when Prisma is not enabled.
- **Citing unmerged #533 as current** → Spec would describe behavior that does not exist on main. Mitigate: problem statement sourced from #531 + main code; #533 explicitly non-sourced.
- **Scope creep into #531 (Prisma scaffold / migrators)** → Mitigate: explicit non-goal; `flisk resource` output unchanged; tests pin non-start.

## Migration Plan

1. Implement engine resolution: map `postgres` / `database-management` in selected `dependsOn` to the shared `postgres` Tilt resource (no `postgres-yaml` fall-through for these names) in **both** feature states.
2. Implement start path: when a selected resource depends on either name and `database-management` is off, ensure platform Compose files under `services/platform/database-management` and register the existing `postgres` Tilt resource via the existing loader path.
3. Implement edge building: attach `postgres` to the selected resource exactly once as Tilt start order (`resource_deps`); no drop when it is the start reason; no duplicate when feature already adds it. Do not invent a new health contract beyond the existing `database-management` path.
4. Implement engine selection bound: only selected resources' `dependsOn` values trigger the start path.
5. Implement verify/doctor reporting over the project resources those commands already inspect (no `flisk up` filter); keep unknown-name errors; do not report these names as missing when the dependency is present.
6. Implement Prisma non-start guardrails: this path never enables or launches Prisma/migrators/`featuresEnabled` entries.
7. Tests: engine unit tests for resolution (both feature states), materialize, single edge, engine selection bound, Prisma non-start; CLI tests for verify/doctor messages, project-scope reporting, agreement, typo/near-miss errors, Prisma non-report; manual/e2e check that `flisk up` starts Postgres with feature off + `dependsOn: ["postgres"]` and `resource_deps` includes `postgres`, and that Prisma does not start when not enabled.
8. **Rollback:** revert the change; behavior returns to main (feature-only Postgres start; `dependsOn` names remain accepted no-ops when the feature is off; resolution can fall through to `postgres-yaml`). No schema or production rollback.

## Open Questions

- Should `flisk config verify` fail (non-zero) when a selected resource depends on either name but Postgres cannot be started, or only warn? Spec requires reporting "will start" on the valid path and errors only for unknown names; exit-code policy for other degraded cases can follow existing verify/doctor conventions.
- When the feature is off and a dependency triggers Postgres, should generated `services/platform/database-management/docker-compose.yml` be gitignored the same way TDK-generated files are, or always regenerated? Prefer the existing feature-path convention unless maintainers decide otherwise.
