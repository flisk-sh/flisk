# Design

## Context

See `proposal.md` (Why) for the measurements. Current runtime layer behaviour relevant to the approach:

- The backend runtime Dockerfile is `ENTRYPOINT ["/entrypoint.sh"]` + `CMD ["bun", "run", "start"]`. `infisical-entrypoint.sh` ends in `exec "$@"`, so the `bun run start` wrapper becomes PID 1 and spawns the real `bun run dist/index.js` child. The wrapper is currently what receives `SIGTERM` from `docker stop` and passes it on to the child.
- The start command is set in several places: `RUNTIME_CONFIG.bun.backend_start_command` (`l3_builder_layers.star`), default `cmd` parameters in `dockerfile.star`, `golden_docker_generator_v2.star` and `l4_runtime_layers.star`, the `_runtime_setup` default (`infisical_docker.star`), and a hard-coded `CMD` for the Bun-static frontend (`l4_runtime_layers.star:213`). The Node runtime already uses `node dist/index.js` directly.
- Healthcheck timing lives in `get_docker_healthcheck_config` (`golden_image_dockerfile.star:6`), but `compose.star` (lines 141, 264) hard-codes `interval: 10s` with `retries: 6`.
- The per-service L4 layer already installs hugo only when a service's `featuresEnabled` contains `hugo`. The golden `l4_backend_bun` stage installs it for every backend anyway.

## Goals / Non-Goals

**Goals:**
- Meet every requirement in `specs/runtime-container-footprint/spec.md` without changing any service's source files or `package.json`.
- Keep a single source of truth for healthcheck timing.

**Non-Goals:**
- Reworking the entrypoint script beyond what signal handling needs.
- Default startup scope and Sablier scale-to-zero (see proposal Non-goals).

## Decisions

### D1: Resolve the start command at generation time, exec the entry file directly

When generating a Bun backend or Bun-static frontend runtime, the generator reads the service's `package.json` `scripts.start`. If it is exactly `bun run <file>` or `bun <file>` (one file path, no `&&`, `;`, pipes or env assignments), the runtime gets `CMD ["bun", "<file>"]`. In every other case it falls back to `CMD ["bun", "run", "start"]`. The resolver (`resolve_bun_start_command` in `l4_runtime_layers.star`) runs at the single point where the backend and Bun-static frontend `CMD` are emitted, both on the plain path and the Infisical-entrypoint path. Upstream defaults (`cmd='bun run start'` in `dockerfile.star`, `golden_docker_generator_v2.star` and `infisical_docker.star`) stay as they are and act as the "no explicit override" value. An explicit different `cmd` passed by a caller is always kept.

*Alternatives considered:*
- Rewriting `start` in each service's `package.json`: rejected because it edits user-owned files and breaks `bun run start` locally.
- Always emitting `bun <file>` from a fixed path: rejected because it silently ignores custom start scripts.
- `bun run --bun start`: rejected because it still keeps the wrapper process.

### D2: Add `init: true` to generated runtime services

With direct exec, Bun becomes PID 1. The kernel does not apply default signal actions to PID 1, so an app without a `SIGTERM` handler would ignore `docker stop` and be killed only after the stop timeout. Generated compose services get `init: true` (Docker's bundled tini, about 1 MB resident). Tini passes signals on and reaps zombies. It is not a Bun process, so the "exactly one Bun process" requirement still holds.

*Alternative:* inject a `SIGTERM` handler into generated service templates. Rejected because it doesn't cover existing services or custom servers.

### D3: One healthcheck config, 30 s interval with a 2 s start interval

A new shared module, `engine/topologies/platform/docker/config/healthcheck.star`, replaces the per-file inlined `get_docker_healthcheck_config` copies. The copies had drifted: `l4_runtime_layers.star`'s copy lacked keys its own code read. Defaults: `interval 30s`, `start_period 30s` (unchanged), `start_interval 2s`, `timeout 5s`, `retries 3`. Golden images, the L4 runtime layer, `compose.star` and `traefik_standalone.star` all read it. Each value can be overridden per run with `TDK_HEALTHCHECK_INTERVAL_SECONDS`, `TDK_HEALTHCHECK_START_INTERVAL_SECONDS`, `TDK_HEALTHCHECK_TIMEOUT_SECONDS`, `TDK_HEALTHCHECK_START_PERIOD_SECONDS` and `TDK_HEALTHCHECK_RETRIES`. Environment variables are used because there is no per-project healthcheck setting today, and `flisk up` does not pass the project `.env` through to Tilt.

During the start period Docker probes every 2 s, so a service is marked healthy right after it starts answering (see the spec's "Startup readiness is not delayed" scenario). After that, probes drop to every 30 s. With `retries 3`, a failing service is marked unhealthy within about 90 s, compared with about 60 s today.

*Alternative:* 30 s interval with no start interval. Rejected because first-healthy time would move from about 10 s to about 30 s per container, which slows every dependency chain in `flisk up`.

`start_interval` needs Docker Engine 25+ and Compose 2.20.2+. `flisk doctor` gets a check that fails with an upgrade hint on older versions.

### D4: Golden migrator stage declares `HEALTHCHECK NONE`

Resolved by task 1.2. Migrators are one-shot jobs: every migrator container is built from the per-service `l4_migrator_runtime` stage (`prisma_runtime.star`), which already sets `HEALTHCHECK NONE` and runs `ENTRYPOINT ["/app/migrate.sh"]` to completion. The golden `l4_migrator_golden` stage's `bunx prisma --version` healthcheck is therefore always overridden and never protects anything. It only runs if someone starts the bare golden image, and then it starts a bunx/Prisma process every interval. The golden stage now sets `HEALTHCHECK NONE` too, so both layers agree.

Evidence (2026-09-25): `grep -rn L4_generate_migrator_runtime engine/` shows a single caller (`golden_docker_generator_v2.star:57`), and that stage emits `HEALTHCHECK NONE` before `ENTRYPOINT`. No project in the workspace declares `"appType": "migrator"`.

*Alternative (original plan):* a `test -x` check on a symlinked Prisma binary. Dropped because a healthcheck on a run-to-completion container has no meaning.

### D5: Remove hugo from the golden backend stage only

Delete `RUN apk add --no-cache hugo` from `l4_backend_bun` in `golden_image_dockerfile.star`. The per-service feature-gated install stays, but it never actually ran: `manifest_resource.star` called `Docker.backend(...)` without `manifest`, so `featuresEnabled` was always empty in the L4 layer. The manifest is now passed through, which makes the per-service install work and makes removing hugo from the golden stage safe.

Evidence (task 1.1, 2026-09-25): no service in `tdk-erp-system`, `tdk-saas-starter`, `tdk-restaurant-example` or `tdk-user-management` lists `"hugo"` in `service.json`, and no source, script or config file mentions hugo (search excluded `node_modules`, `.autogenerated`, `dist` and `.tdk`). Removal affects no existing project.

### D6: Verifying the idle budget

`tests/tilt-engine/test_runtime_container_footprint.py` executes the real Starlark generators through `tilt alpha tiltfile-result` (skipped when Tilt isn't installed) rather than inspecting source text. Those tests assert the generated `CMD`, `init: true` and healthcheck values. The idle budget is checked by a smoke script that generates a template backend, runs it, waits for healthy, samples `docker stats` for 60 s, and fails if memory is over 64 MiB or CPU averages 2% or more. It's run manually and in the release checklist rather than on every CI run, because it needs Docker.

## Risks / Trade-offs

- [The start-script parser misreads a script, e.g. `bun run dist/index.js --port 4000`] → Only a single file argument qualifies. Anything with extra tokens falls back to `bun run start`, so the fallback is always the current behaviour.
- [Docker Engine / Compose is older than 25 / 2.20.2 and rejects `start_interval`] → New `flisk doctor` version check; the release notes state the minimum version.
- [Unhealthy detection is slower (about 90 s vs 60 s)] → Acceptable for local dev. `retries` stays configurable.
- [A project relied on hugo without declaring the feature] → The build fails loudly (`hugo: not found`). Migration note: add `"hugo"` to `featuresEnabled`. No project in this workspace is affected (see D5 evidence).
- [Background auto-commit tooling in this workspace pushes partial engine edits] → Make each decision's edits in one sitting and run the snapshot tests before moving on, so every intermediate push is still consistent.

## Migration Plan

1. Ship the engine changes in a Flisk release.
2. In each project: run `flisk project --yes` to re-vendor `.tdk/.tdk-out/tdk-cli-ext/` and regenerate compose files and Dockerfiles, touch the Tiltfile, then rebuild golden layers with the `golden-layers-build` resource or a fresh `flisk up`.
3. Existing images keep working until they are rebuilt, and nothing needs to change inside services.

**Rollback:** revert the engine change, re-run `flisk project --yes`, and rebuild the golden layers.
