# Proposal

## Why

`dependsOn: ["postgres"]` (or `["database-management"]`) is currently only a name. It does not start the shared platform database. Postgres starts only when the platform `database-management` feature is on. A manifest that lists either name is accepted by `flisk config verify` and `flisk doctor` and is then a no-op when that feature is off: `flisk up` starts the service and leaves Postgres off. Issue [#643](https://github.com/flisk-sh/tdk-cli-core/issues/643) needs that dependency to be a start signal for the one shared platform Postgres.

## What Changes

- Treat `dependsOn` entries `postgres` and `database-management` as the same shared platform database. Resolve both to the existing `postgres` Tilt resource; do not fall through to `postgres-yaml`.
- When any **selected** resource lists either name, start that shared platform Postgres even if `database-management` is off. Materialize the platform files under `services/platform/database-management` (the same Compose the feature uses), register the existing `postgres` Tilt resource, and keep the service's dependency edge on `postgres`.
- Do not add a second database, image, port, network, or compose project. Reuse the existing Compose file and Tilt resource.
- Keep the dependency edge. Do not drop `postgres` / `database-management` when it is the reason Postgres should exist. Do not add the edge twice when `database-management` already carries it via `_build_infra_dependencies`.
- `flisk config verify` and `flisk doctor` MUST report that Postgres will start because an inspected project resource depends on it. They MUST NOT report these names as missing services. Verify/doctor evaluate the project resources they already inspect; they do **not** take the same resource filter as `flisk up` (that filter bounds only the engine start path).
- Bound the engine start signal to the current `flisk up` selection: a `dependsOn` on a service this run does not select MUST NOT start Postgres.
- Unknown `dependsOn` names stay errors. Only `postgres` and `database-management` mean the shared database. A typo such as `postgress` stays an error.
- With `database-management` already on, Postgres still starts via the feature (one `postgres` resource, same Compose and port). This change still applies: both names resolve to that `postgres` resource (they do **not** fall through to `postgres-yaml`, which `_resolve_dependency_to_resource` can do on main today even when the feature is on), and verify/doctor gain a new "will start" report instead of silent accept.
- Starting Postgres because of `dependsOn` MUST NOT enable, launch, or scaffold Prisma, migrators, or any other `featuresEnabled` entry. If Prisma is not enabled on a resource, Prisma jobs/services MUST NOT start as a side effect of this dependency.

**BREAKING (none for start order when the feature is on without those names):** Postgres still starts the same way when `database-management` is on and no one lists the names. What **does** change when either name is present: dependency resolution maps both to Tilt `postgres` (no `postgres-yaml` fall-through) in **both** feature states, and verify/doctor report Postgres-will-start instead of accepting the name silently. Feature off + no such `dependsOn` keeps today's "Postgres does not start" path.

## Non-goals

- Prisma, migrators, and `featuresEnabled` as a product change. [#531](https://github.com/flisk-sh/tdk-cli-core/issues/531) is "Prisma should require Postgres." Regression tests still assert that this change does **not** start Prisma when Prisma is not enabled.
- A per-service database, a custom image, or a different port.
- Changing what `flisk resource` scaffolds (`dependsOn: []` remains).

## Capabilities

### New Capabilities

- `shared-platform-postgres`: when a selected Flisk resource depends on the shared platform database via `dependsOn: ["postgres"]` or `["database-management"]`, the CLI and engine start that one shared platform Postgres (materializing the platform Compose files when needed) and keep the dependent's Tilt edge on the `postgres` resource. Covers verify/doctor reporting (project resource set, no `flisk up` filter), name resolution in **both** feature states, no-duplicate edges, engine selection bound, unchanged feature-off path when nothing depends on either name, no second DB/image/port, and Prisma-not-enabled non-start.

### Modified Capabilities

- (none — no existing `openspec/specs/` capability documents this `dependsOn`-starts-Postgres behavior.)

## Impact

- **Engine (Starlark):** `engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star` — name resolution and resource registration. When a selected resource depends on either shared-DB name, ensure the `postgres` resource exists (materialize `services/platform/database-management/docker-compose.yml` via the same path `_load_database_management` uses, or force the `database-management` feature path for that run) and attach the edge exactly once. Do not fall through to `postgres-yaml` for these two names.
- **Engine (Starlark):** `engine/topologies/tilt/resources/infra-loader.star` — Postgres startup today is gated on `should_enable('database-management')`. Starting Postgres because of a selected `dependsOn` must reuse this loader and its existing Compose/Tilt registration — not a second image or port.
- **CLI:** verify/doctor report Postgres-will-start when any resource they inspect (the project set they already evaluate; they do **not** take a `flisk up` resource filter) depends on either name, or when the feature is on; do not treat these names as missing services when that dependency is present. The engine start path stays bounded by the current `flisk up` selection.
- **CLI:** `flisk up` — selected resource with either name starts shared Postgres and `resource_deps` includes `postgres` (Tilt start order, not a new health contract).
- **CLI:** `flisk resource` — still writes `"dependsOn": []` (Prisma scaffold remains out of scope under #531).
- **Manifest schema / validators:** accept the two shared-DB names as known dependencies when present; unknown names stay errors.
- **Tests:** `tests/tilt-engine/` for resolution, materialize, single edge, selection bound, Prisma non-start; `bun test` CLI units for verify/doctor messages, agreement, typo/near-miss errors.
- **No production / schema / event-contract impact.**
