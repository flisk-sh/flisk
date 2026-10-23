# Tasks

## 1. Engine: Name Resolution

- [x] 1.1 In `apply_compose_resource_registration.star`, treat `postgres` and `database-management` in a selected resource's `dependsOn` as aliases for the shared platform Postgres Tilt resource `postgres`.
- [x] 1.2 Do not fall through to `postgres-yaml` (or any other name) for these two aliases.
- [x] 1.3 Keep unknown names (e.g. `postgress`, `Postgres`, `postgresql`, `my-db`) on the existing missing/unknown-dependency error path.
- [x] 1.4 Add Starlark unit tests for alias resolution to `postgres`, non-alias fall-through, and typo/near-miss errors.
- [x] 1.5 Add tests: mixed `dependsOn: ["postgres", "database-management"]` resolves both to one `postgres` edge; unknown names do not resolve to platform Postgres.

## 2. Engine: Start Path (Feature Off + Selected dependsOn)

- [x] 2.1 When `database-management` is off but any **selected** resource depends on `postgres` or `database-management`, start Postgres for that run (orchestrator calls `Infra.force_start_postgres` when feature off).
- [x] 2.2 Materialize platform files under `services/platform/database-management` using the existing Compose generation/path. Force path MUST pass `ctx.write_file`; missing write_fn or missing compose after ensure **fails the run** (no silent skip that leaves Tilt waiting on a bare name).
- [x] 2.3 Register the existing `postgres` Tilt resource through the same infra loader path the feature uses.
- [x] 2.4 Feature-on start path stays: one `postgres` resource, same compose, same port (when the feature is on). Do **not** claim feature-on is fully unchanged — resolution and verify/doctor still change when either name is present.
- [x] 2.5 Leave the feature-off + no such `dependsOn` path unchanged: Postgres does not start; no `postgres` resource registered solely because of `dependsOn`.
- [x] 2.6 Add tests: feature off + `dependsOn: ["postgres"]` starts Postgres with platform files present; feature off + `dependsOn: ["database-management"]` same; feature off + no dependency does not start Postgres. Full Tilt register and materialize paths now run in `test_dependson_platform_postgres.py`.
- [x] 2.6b Force-start is idempotent across selected services: guard on `ctx['_shared_platform_postgres_force_started']` (Tilt freezes module globals). Two selected dependents call `force_start_shared_platform_postgres_once` once.
- [x] 2.7 Add tests: empty `dependsOn: []` does not start Postgres; two selected dependents start Postgres once; feature on + either name does not create a second DB/image/port. Tilt tests cover empty and two dependents; manual 7.3 covers feature-on registration.
- [x] 2.8 Add tests: materialized compose uses existing image/host-port/network conventions; no second host port; no per-service compose project for shared Postgres. The real force-path test checks one platform Compose with the existing image, port, container, and network.
- [x] 2.9 Add tests: with feature **on**, `dependsOn: ["postgres"]` / `["database-management"]` resolve to Tilt `postgres`, not `postgres-yaml` (resolution changes in both feature states).

## 3. Engine: Dependency Edge

- [x] 3.1 Keep `postgres` in the selected resource's Tilt `resource_deps` when Postgres starts because of that `dependsOn`.
- [x] 3.2 Do not add a second `postgres` edge when `_build_infra_dependencies` already added it because `database-management` is on.
- [x] 3.3 Do not drop the edge when it is the reason Postgres should exist.
- [x] 3.4 Express the edge as Tilt `resource_deps` on `postgres` (start order), not a Tilt resource named `database-management`. Do not invent a health contract beyond the existing `database-management` path.
- [x] 3.5 Add tests: single edge with feature on + dependsOn; edge present with feature off + dependsOn (`postgres` and `database-management` names); no edge when neither feature nor selected dependency starts Postgres; no duplicate when feature + alias both present; other non-DB edges unchanged.

## 4. Engine: Selection Bound (start path only)

- [x] 4.1 Evaluate `dependsOn` for the **engine start path** only against resources in the current `flisk up` selection.
- [x] 4.2 A dependency on an unselected resource MUST NOT start Postgres when no selected resource depends on either name.
- [x] 4.3 Unselected dependents MUST NOT receive a `postgres` edge solely because another selected resource listed it.
- [x] 4.4 Add tests: unselected `dependsOn: ["postgres"]` does not start Postgres; selected one does; partial selection starts Postgres for selected dependents only and does not edge S1 because of S2. The multi-service Tilt registration test covers selected and unselected siblings; manual 7.7 covers the generated Tiltfile focus filter.

## 5. Engine: Prisma Non-Start Regression

- [x] 5.1 Ensure starting shared Postgres via `dependsOn` does not enable, launch, or scaffold Prisma, migrators, or other `featuresEnabled` entries.
- [x] 5.2 Assert `featuresEnabled` is not rewritten to include `prisma` when a resource only lists `dependsOn: ["postgres"]`.
- [x] 5.3 Assert no Prisma Tilt resource/job starts when `prisma` is not in `featuresEnabled`, even if shared Postgres starts.
- [x] 5.4 Assert unselected Prisma resources do not start solely because a selected resource depends on `postgres`.
- [x] 5.5 Add Starlark/unit tests for 5.1–5.4 (resource registration + feature predicates).
  - Force path source guards pin that `force_start_platform_postgres` / `_register_platform_postgres` register no Prisma/migrator resources.
  - CLI: `shared-platform-postgres` + doctor tests assert willStart is unaffected by missing prisma and that doctor does not claim Prisma starts.
  - Full register_compose Prisma non-start harness remains desirable alongside 2.6–2.8.

## 6. CLI: Verify and Doctor Reporting (project resource set)

- [x] 6.1 Predicate shape matches the engine: Postgres will start when the feature is on **or** an inspected project resource depends on `postgres` / `database-management`. Resource set is what verify/doctor already inspect — **not** a `flisk up` filter.
- [x] 6.1b Feature-on predicate uses `DEFAULT_ALWAYS_ENABLED_INFRA` from `project-config-defaults.ts` — the same default the generator bakes into the Tiltfile when `always_enabled_infra` is omitted (omitted field = feature ON, matching `should_enable`).
- [x] 6.2 `flisk config verify`: when Postgres will start because of a project resource's `dependsOn`, report that it will start because of that dependency. Feature-on-only case prints gray (not yellow); dependsOn reason prints green; both note project resource set vs `flisk up` selection.
- [x] 6.3 `flisk doctor`: same reporting for `dependsOn: ["postgres"]` and `["database-management"]`. Unknown-name failures still state whether Postgres will start (project scope).
- [x] 6.3b `--json` verify envelope: `sharedPlatformPostgres` is **additive**; consumers that only read the old shape are unaffected unless they require a closed schema.
- [x] 6.4 Do not report `postgres` or `database-management` as missing services when that dependency is present.
- [x] 6.5 Keep unknown names (e.g. `postgress`, `Postgres`, `postgresql`) as errors; they must not report Postgres-will-start.
- [x] 6.6 Verify and doctor MUST agree on the will-start predicate for the same project state.
- [x] 6.7 When no inspected project resource depends on either name and the feature is off, verify/doctor MUST NOT report Postgres-will-start because of a dependency.
- [x] 6.8 Add CLI tests for verify/doctor messages, missing-service suppression, typo/near-miss errors, agreement, and negative will-start cases.
- [x] 6.9 Add CLI tests that doctor/verify do **not** claim Prisma will start when `prisma` is not enabled, even when Postgres will start because of `dependsOn`.
- [x] 6.10 Add CLI tests that verify/doctor report will-start from a project resource even when that resource would not be selected by a hypothetical `flisk up` filter (project scope, not run scope).
- [x] 6.11 Do not change `flisk resource` scaffold output (`dependsOn: []` remains; Prisma stays under #531).

## 7. Verification and Evidence

- [x] 7.1 Manual/e2e: `database-management` off, one resource with `dependsOn: ["postgres"]` — `flisk up` starts shared Postgres (platform files materialized) and the service's `resource_deps` includes `postgres`.
  - **Force path proven on `560e5ca`** (scratch `/tmp/tdk-force-560b-5TEQ`):
    - `project.json`: `always_enabled_infra: ["proxy"]`; `pre_alpha`: `["proxy","app","orders-api","billing-api"]`; no `database-management`.
    - Regenerated Tiltfile: `ALWAYS_ENABLED_INFRA = ["proxy"]`; extension includes `force_start_shared_platform_postgres_once`.
    - Scratch Tiltfile only: `FOCUS_MODE = False` after `Config.apply_focus` (default focus expands `CORE_INFRA` → `database-management`).
    - Evidence (`/tmp/f560b-up.log`):
      - `DEBUG INFRA: database-management not enabled`
      - `DEBUG COMPOSE: force-starting shared platform Postgres once (selected 'billing-api' dependsOn)`
      - `Force-starting shared platform Postgres (selected dependsOn postgres/database-management)`
      - **No** `Loading database management services...`
      - **No** second force-start for `orders-api` (ctx guard); both resources still get `postgres` in `resource_deps`
    - `ctx` identity: Tiltfile builds `TILT_CONTEXT` once and passes the same dict to every `Orchestrator.apply_service` (`cli/templates/Tiltfile.hbs`). The ctx guard holds across services for that run.
  - **Implication for default `flisk up`:** focus mode enables `database-management` via `CORE_INFRA`, so Postgres still starts (feature path) and the edge is correct; the dependsOn force path runs when that feature is actually off (focus off / non-focus bring-up).
- [x] 7.2 Manual/e2e: feature off + only `orders-api` listing `dependsOn: ["database-management"]`. In a scratch project with the platform Compose removed, `tilt alpha tiltfile-result` materialized it, registered one `postgres` resource, and gave `orders-api` one `postgres` edge; `billing-api` had none. Verify and doctor reported the dependency reason.
- [x] 7.3 Manual: explicit feature on + `dependsOn: ["postgres", "database-management"]` in one resource. Tilt registered exactly one `postgres`, no `postgres-yaml`, and one `postgres` edge; the sole platform Compose used `postgres:16-alpine`, host port `15432`, and the project database network.
- [x] 7.4 Manual: both `dependsOn` lists empty, feature off, platform Compose removed. Tilt registered no `postgres` or `postgres-yaml`, no app Postgres edges, and did not recreate the Compose. Verify's `sharedPlatformPostgres.willStart` was false.
- [x] 7.5 Manual: `dependsOn: ["postgress"]`, feature off. Verify returned an unknown-name error; doctor named `postgress` and said Postgres will not start. Tilt's verbose evaluation reported `Missing service: postgress` and an ignored unknown `postgress-yaml` edge; no Postgres resource or Compose appeared. Tilt evaluation itself exited 0, consistent with its existing unknown-resource warning path.
- [x] 7.6 Manual/e2e: `dependsOn: ["postgres"]`, `featuresEnabled: []`, feature off. Tilt materialized the one platform Compose and registered `postgres` with one dependent edge; no Prisma or migrator Tilt manifest appeared, and `service.json` kept `featuresEnabled: []`.
- [x] 7.7 Manual: scratch focus with `--focus=billing-api`, where only unselected `orders-api` depends on Postgres and database-management is held off. Tilt enabled only `billing-api`, registered no Postgres, and did not create its Compose; verify still reported `willStart: true` and doctor said Postgres will start for the project resource set. Selecting `orders-api` instead registered Postgres; selecting both with only `billing-api` dependent gave only billing the Postgres edge. The scratch Tiltfile held database-management off because normal focus adds `CORE_INFRA` and turns that feature on; these runs verify the selection-bound force path when the feature is actually off.
- [x] 7.8 Run `tests/tilt-engine/` unit tests, `bun test` for CLI, typecheck and Biome for touched packages; record evidence against this change.
  - CLI: `bun test src/utils/__tests__/shared-platform-postgres.test.ts src/utils/__tests__/doctor-wiring.test.ts` — 65 pass
  - Engine: `pytest tests/tilt-engine/test_dependson_platform_postgres.py` — 21 pass
  - Biome: clean on touched CLI files
  - typecheck: pre-existing `ajv` resolution failure in `service-schema-contract.test.ts` (also fails on main; unrelated)
  - Force-path live evidence: see 7.1 (focus-off scratch Tiltfile).
