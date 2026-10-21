# Spec Delta

## Purpose

Makes `dependsOn: ["postgres"]` / `["database-management"]` a start signal for the one shared platform Postgres when a selected resource lists either name, reusing the existing platform Compose and Tilt resource.

## ADDED Requirements

### Requirement: Shared platform database via dependsOn
When any resource in the current selection has `dependsOn` containing `postgres` or `database-management`, the system SHALL treat those two names as the same shared platform database and SHALL start that database as the `database-management` feature does: reuse the existing platform Compose under `services/platform/database-management` and the existing Tilt resource `postgres`. The system MUST NOT introduce a second database image, host port, or resource for this dependency.

#### Scenario: Feature off, selected resource depends on postgres
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["postgres"]`
- **THEN** `flisk up` MUST start the shared platform Postgres using the existing platform Compose and the existing `postgres` Tilt resource
- **AND** the selected service MUST have a Tilt `resource_deps` edge on `postgres` (start order)

#### Scenario: Feature off, selected resource depends on database-management
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["database-management"]`
- **THEN** the system MUST resolve that name to the same shared platform Postgres as `postgres`
- **AND** `flisk up` MUST start that shared Postgres and the service MUST have a Tilt `resource_deps` edge on `postgres`

#### Scenario: Feature on keeps one shared resource; resolution and reporting still change
- **WHEN** `database-management` is on
- **AND** a selected resource has `dependsOn: ["postgres"]` or `["database-management"]`
- **THEN** there MUST be exactly one `postgres` Tilt resource (same Compose/image/port as today's feature path)
- **AND** the dependent MUST have a Tilt `resource_deps` edge on `postgres`
- **AND** the system MUST NOT add a second database, image, or port
- **AND** both names MUST resolve to that `postgres` resource, not to `postgres-yaml` (on main today, `_resolve_dependency_to_resource` has no special case and can fall through to `postgres-yaml` even when the feature is on — this spec changes resolution in **both** feature states)
- **AND** verify/doctor MUST report Postgres-will-start when a listed dependency is present, instead of the current silent accept

#### Scenario: Starting Postgres materializes platform files
- **WHEN** Postgres starts because a selected resource depends on `postgres` or `database-management`
- **AND** `database-management` is off
- **THEN** the system MUST materialize the platform files under `services/platform/database-management` (the same Compose the feature uses) before or as it registers the `postgres` Tilt resource
- **AND** the Tilt resource MUST have a compose definition so `flisk up` does not wait on a resource with no compose

#### Scenario: Materialized compose reuses feature path image and port
- **WHEN** platform files are materialized because of a selected `dependsOn`
- **THEN** the generated/existing `services/platform/database-management/docker-compose.yml` MUST declare the same Postgres image, network, and host port convention as the `database-management` feature path
- **AND** the system MUST NOT write a second compose file or a second host port for the same database

#### Scenario: No fall-through to postgres-yaml
- **WHEN** a selected resource has `dependsOn: ["postgres"]` or `["database-management"]`
- **THEN** the system MUST resolve both names to the existing `postgres` Tilt resource
- **AND** MUST NOT resolve them to `postgres-yaml` or any other resource name

#### Scenario: Mixed names in one dependsOn list
- **WHEN** a selected resource has `dependsOn: ["postgres", "database-management"]`
- **THEN** both entries MUST resolve to the same `postgres` Tilt resource
- **AND** Postgres MUST start once
- **AND** the service MUST wait on `postgres` exactly once

#### Scenario: Multiple selected resources depending on postgres
- **WHEN** `database-management` is off
- **AND** two or more selected resources each have `dependsOn: ["postgres"]` or `["database-management"]`
- **THEN** Postgres MUST start once
- **AND** each selected resource MUST wait on the single `postgres` Tilt resource

#### Scenario: Dependent has resource_deps on postgres (start order)
- **WHEN** a selected resource has `dependsOn: ["postgres"]` or `["database-management"]`
- **THEN** the dependent MUST have a Tilt `resource_deps` edge on `postgres`
- **AND** Tilt MUST order the dependent's start after the `postgres` resource starts
- **AND** any readiness/health gate MUST be the existing `database-management` path on that resource (compose healthcheck / whatever that loader already registers) — this change MUST NOT invent a new health contract beyond `resource_deps` on `postgres`

### Requirement: Keep the dependency edge without duplication
The system SHALL keep the Tilt dependency edge from the selected resource to `postgres` when Postgres starts because of that `dependsOn`. It MUST NOT drop the edge when it is the reason Postgres should exist. It MUST NOT add a second `postgres` edge when `database-management` already carries `postgres` on that service.

#### Scenario: Edge kept when dependency starts Postgres
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["postgres"]`
- **THEN** the resource's Tilt `resource_deps` MUST include `postgres`

#### Scenario: Edge kept when dependency name is database-management
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["database-management"]`
- **THEN** the resource's Tilt `resource_deps` MUST include `postgres` (not `database-management` as a Tilt resource name)

#### Scenario: No duplicate edge when feature already adds postgres
- **WHEN** `database-management` is on
- **AND** `_build_infra_dependencies` already adds `postgres` to the service
- **AND** the same service also has `dependsOn: ["postgres"]`
- **THEN** the service's Tilt `resource_deps` MUST contain `postgres` exactly once

#### Scenario: No duplicate edge when feature and dependency-name alias both present
- **WHEN** `database-management` is on
- **AND** a selected service has `dependsOn: ["database-management"]`
- **THEN** the service's Tilt `resource_deps` MUST contain `postgres` exactly once
- **AND** MUST NOT contain a second `postgres` entry and MUST NOT wait on a Tilt resource named `database-management`

#### Scenario: Other edges unchanged
- **WHEN** a selected resource has non-shared-DB `dependsOn` entries (other services) plus `postgres`
- **THEN** non-DB edges MUST remain as they resolve today
- **AND** `postgres` MUST be present exactly once among the DB edges

### Requirement: Verify and doctor report the start reason
`flisk config verify` and `flisk doctor` SHALL report that Postgres will start because an inspected project resource depends on `postgres` or `database-management`, when that dependency is present (or when the feature is already on). They MUST NOT report `postgres` or `database-management` as a missing service when that dependency is present.

**Resource set rule:** verify/doctor do **not** take a `flisk up` resource filter. They evaluate the project resources they already inspect (full project discovery for those commands). The engine start path is selection-bounded; verify/doctor reporting is project-scoped. "Unselected" therefore does **not** apply to verify/doctor — a dependency on any inspected resource is enough for a will-start report.

#### Scenario: Verify reports Postgres will start because of dependsOn
- **WHEN** `database-management` is off
- **AND** an inspected project resource has `dependsOn: ["postgres"]`
- **THEN** `flisk config verify` MUST report that Postgres will start because of that dependency
- **AND** MUST NOT report `postgres` as a missing service

#### Scenario: Doctor reports Postgres will start because of dependsOn
- **WHEN** `database-management` is off
- **AND** an inspected project resource has `dependsOn: ["database-management"]`
- **THEN** `flisk doctor` MUST report that Postgres will start because of that dependency
- **AND** MUST NOT report `database-management` as a missing service

#### Scenario: Verify and doctor agree on the start predicate
- **WHEN** `database-management` is off
- **AND** an inspected project resource has `dependsOn: ["postgres"]`
- **THEN** both `flisk config verify` and `flisk doctor` MUST report Postgres-will-start
- **AND** neither MUST claim Postgres will not start

#### Scenario: Verify and doctor do not report Postgres-will-start when nothing inspected depends on it
- **WHEN** `database-management` is off
- **AND** no inspected project resource depends on `postgres` or `database-management`
- **THEN** `flisk config verify` and `flisk doctor` MUST NOT report that Postgres will start because of a dependency

#### Scenario: Feature on plus dependency still reports will-start
- **WHEN** `database-management` is on
- **AND** an inspected project resource has `dependsOn: ["postgres"]`
- **THEN** verify/doctor MUST report Postgres will start
- **AND** MUST NOT report `postgres` as a missing service

### Requirement: Selection bounds the engine start signal only
The engine SHALL start Postgres because of `dependsOn` only when at least one **selected** resource in the current `flisk up` run lists `postgres` or `database-management`. A `dependsOn` on a resource this run does not select MUST NOT start Postgres. This bound applies to the engine start path; it is not the verify/doctor reporting rule (see the resource set rule above).

#### Scenario: Unselected dependency does not start Postgres (engine)
- **WHEN** `database-management` is off
- **AND** resource A (not selected by this `flisk up`) has `dependsOn: ["postgres"]`
- **AND** no selected resource depends on `postgres` or `database-management`
- **THEN** Postgres MUST NOT start

#### Scenario: Selected dependency does start Postgres (engine)
- **WHEN** `database-management` is off
- **AND** resource B (selected by this `flisk up`) has `dependsOn: ["postgres"]`
- **THEN** Postgres MUST start

#### Scenario: Partial selection starts Postgres for selected dependents only
- **WHEN** `database-management` is off
- **AND** the run selects resources S1 (`dependsOn: []`) and S2 (`dependsOn: ["postgres"]`)
- **THEN** Postgres MUST start
- **AND** S2 MUST have a Tilt `resource_deps` edge on `postgres`
- **AND** S1 MUST NOT gain a `postgres` edge solely because S2 listed it

#### Scenario: Engine selection bound does not change verify/doctor project scope
- **WHEN** resource A is not selected by `flisk up`
- **AND** resource A has `dependsOn: ["postgres"]`
- **AND** `database-management` is off
- **THEN** the engine MUST NOT start Postgres for that run when nothing selected depends on either name
- **AND** verify/doctor MUST still report Postgres-will-start because they inspect the whole project (no `flisk up` filter)

### Requirement: Unchanged paths when the dependency is absent or invalid
With no selected `dependsOn` on `postgres` or `database-management` and `database-management` off, Postgres MUST NOT start, and the existing behavior of not registering a `postgres` resource MUST remain unchanged. Unknown `dependsOn` names remain missing-service errors. Only `postgres` and `database-management` mean the shared database.

#### Scenario: No such dependency and feature off
- **WHEN** `database-management` is off
- **AND** no selected resource has `dependsOn` containing `postgres` or `database-management`
- **THEN** Postgres MUST NOT start
- **AND** the system MUST NOT register a `postgres` Tilt resource solely because of `dependsOn`

#### Scenario: Empty dependsOn does not start Postgres
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: []`
- **THEN** Postgres MUST NOT start

#### Scenario: Typo stays an error
- **WHEN** a selected resource has `dependsOn: ["postgress"]`
- **THEN** `flisk config verify`, `flisk doctor`, and dependency resolution MUST report `postgress` as a missing/unknown dependency
- **AND** MUST NOT treat it as the shared platform database
- **AND** Postgres MUST NOT start because of the typo

#### Scenario: Near-miss names stay errors
- **WHEN** a selected resource has `dependsOn: ["Postgres"]`, `["postgres "]`, or `["postgresql"]`
- **THEN** each MUST be reported as unknown/missing
- **AND** MUST NOT be silently mapped to the shared platform database

#### Scenario: Other unknown names stay errors
- **WHEN** a selected resource has `dependsOn: ["my-db"]` and no such service exists
- **THEN** verify/doctor/resolution MUST report it as missing
- **AND** MUST NOT start platform Postgres because of it

### Requirement: Prisma and other features are not started by this dependency
Starting shared platform Postgres because of `dependsOn: ["postgres"]` or `["database-management"]` SHALL NOT enable, launch, or scaffold Prisma, migrators, or any other `featuresEnabled` entry. If Prisma is not enabled on a resource, this change MUST NOT start Prisma jobs, Prisma migrate services, or Prisma-related Tilt resources as a side effect of the Postgres dependency.

#### Scenario: Prisma not enabled — Postgres starts, Prisma does not
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["postgres"]`
- **AND** that resource does **not** list `prisma` in `featuresEnabled`
- **THEN** shared platform Postgres MUST start
- **AND** the system MUST NOT start any Prisma service, Prisma migrator job, or Prisma-related Tilt resource
- **AND** the resource's `featuresEnabled` MUST remain unchanged

#### Scenario: Prisma not enabled with database-management alias — still no Prisma
- **WHEN** `database-management` is off
- **AND** a selected resource has `dependsOn: ["database-management"]`
- **AND** `prisma` is not in `featuresEnabled`
- **THEN** shared platform Postgres MUST start
- **AND** Prisma-related resources/jobs MUST NOT start
- **AND** `featuresEnabled` MUST NOT gain `prisma`

#### Scenario: dependsOn postgres does not imply Prisma
- **WHEN** a selected resource has `dependsOn: ["postgres"]`
- **AND** `featuresEnabled` is absent or does not contain `prisma`
- **THEN** the system MUST NOT infer that Prisma is enabled
- **AND** MUST NOT rewrite `featuresEnabled` to include `prisma`
- **AND** MUST NOT scaffold Prisma files or Prisma `dependsOn` output as a result of this dependency alone

#### Scenario: Feature off, no dependsOn, no prisma — nothing starts
- **WHEN** `database-management` is off
- **AND** `prisma` is not in `featuresEnabled`
- **AND** a selected resource has `dependsOn: []`
- **THEN** Postgres MUST NOT start
- **AND** Prisma MUST NOT start
- **AND** no migrator jobs MUST start

#### Scenario: Prisma enabled elsewhere is out of scope but must not be started by this path
- **WHEN** resource R1 has `featuresEnabled: ["prisma"]` but is **not** selected
- **AND** selected resource R2 has `dependsOn: ["postgres"]` and no `prisma` in `featuresEnabled`
- **THEN** shared Postgres MUST start for R2
- **AND** Prisma resources for R1 MUST NOT start solely because R2 depends on `postgres`
- **AND** #531 behavior (Prisma should require Postgres) remains a separate concern

#### Scenario: Resource scaffold output unchanged
- **WHEN** `flisk resource` scaffolds a service without Prisma enabled
- **THEN** the scaffolded `service.json` MUST still write `"dependsOn": []`
- **AND** MUST NOT write `"dependsOn": ["postgres"]` solely because this change exists

### Requirement: No second database, image, port, or network
This change SHALL NOT create a second Postgres database, container image, host port, Docker network, or volume beyond the one the shared platform path already uses.

#### Scenario: Single container name convention
- **WHEN** Postgres starts via feature or via selected `dependsOn`
- **THEN** the container must use the existing platform naming convention for the project Postgres container
- **AND** MUST NOT register a second postgres container under a different project compose name for the same DB

#### Scenario: Single host port
- **WHEN** Postgres starts because of a selected `dependsOn`
- **THEN** the host port MUST match the existing platform Postgres port convention
- **AND** MUST NOT allocate a second host port for Postgres in the same run

#### Scenario: No alternate compose project for shared Postgres
- **WHEN** Postgres starts because of a selected `dependsOn`
- **THEN** it MUST use the existing platform Compose path, not a new per-service `docker-compose.yml` for the app's private database
