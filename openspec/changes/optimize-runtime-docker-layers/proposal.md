# Proposal

## Why

A full-landscape `tdk up` of `tdk-erp-system` (107 resources, 110 containers) saturated a 16 GB MacBook Air on 2026-09-25. Load average reached 30–43, only 99 MB of memory was free with 8 GB compressed, and `docker ps` took 6–13 s, which made `tdk doctor` and `tdk down` fail their own 10 s Docker check. A single idle backend is cheap (0.3–1.2% CPU, about 20 MiB in its cgroup). The overload comes from per-container overhead that the generated runtime layers multiply by 110: a redundant second Bun process, a 10 s exec-based healthcheck, and tooling nobody uses baked into the golden images. Cutting that overhead at the layer level makes large landscapes usable on the machines TDK targets.

## What Changes

- **Start the backend with one process.** The generated L4 backend runtime (and the Bun-static frontend runtime) now start the compiled entrypoint directly, e.g. `CMD ["bun", "dist/index.js"]`, instead of `bun run start`. `bun run start` launches a Bun wrapper that then spawns a second Bun runtime (about 10 MB + 52 MB resident per container). A service whose `start` script does more than run a single file keeps `bun run start`.
- **Add an init process for signals.** Generated runtime services run under Docker's minimal init (`init: true`) so `docker stop` still reaches the app once the wrapper is gone.
- **Slow down healthchecks.** The default steady-state healthcheck interval goes from 10 s to 30 s for generated compose services and golden images. A fast start interval keeps first-healthy time where it is today. The value stays configurable through the existing healthcheck config, and compose files now read that config instead of hard-coding 10 s.
- **BREAKING (environment):** the fast start interval needs Docker Engine 25+ and Compose 2.20.2+. `tdk doctor` gets a check for this.
- **Make the migrator healthcheck cheap.** The `l4_migrator_golden` healthcheck no longer runs `bunx prisma --version`, which starts a full bunx/Prisma process on every check. It checks the locally installed Prisma binary instead.
- **Remove hugo from the golden backend image.** `apk add hugo` is removed from the golden `l4_backend_bun` stage (about 57 MB per backend image). The per-service L4 layer already installs hugo only when a manifest lists the `hugo` feature, and that stays as is.
- **Document a per-container budget.** An idle generated backend has a documented footprint target, so regressions like these are visible.

Nothing here is breaking for service code. Services that relied on hugo being present without declaring the `hugo` feature must add it to `featuresEnabled`.

## Capabilities

### New Capabilities
- `runtime-container-footprint`: Requirements on generated runtime images and containers: one application process per container, healthcheck cadence and cost, golden image contents limited to what every service of that type needs, and an idle footprint budget.

### Modified Capabilities
- (none)

## Non-goals

- Changing which resources `tdk up` starts by default, or putting backends under Sablier scale-to-zero. Even with these fixes, starting all 107 services at once stays heavy on 16 GB machines. That is a separate product decision with its own change.
- Changing the Bun version, base OS, or Prisma version.

## Impact

- **Engine (Starlark):**
  - `engine/topologies/platform/docker/layers/l4_runtime_layers.star`: backend and Bun-static frontend `CMD`.
  - `engine/topologies/platform/docker/layers/infisical/infisical_docker.star`: `_runtime_setup` default command.
  - `engine/topologies/platform/docker/layers/l3_builder_layers.star`: `RUNTIME_CONFIG.bun.backend_start_command`.
  - `engine/topologies/platform/docker/dockerfile/dockerfile.star` and `generators/golden_docker_generator_v2.star`: default `cmd` parameters.
  - `engine/topologies/platform/docker/build/golden_image_dockerfile.star`: hugo removal, healthcheck interval, migrator healthcheck.
  - `engine/topologies/platform/docker/compose/compose.star`: compose healthcheck (lines 141, 264) reads the shared config; `init: true`.
- **CLI:** `cli/src/commands/doctor.ts` gets a Docker Engine / Compose minimum-version check.
- **Generated projects:** every project needs `tdk project --yes` (re-vendoring `.tdk/.tdk-out/tdk-cli-ext/`) and a golden image rebuild to pick up the change. Existing images keep working until then.
- **Behaviour:** after a failure, Docker marks a container unhealthy up to about 20 s later than today. Tilt readiness and dependency ordering still use the start period.
- **Tests:** starlark and generated-Dockerfile snapshot tests covering these files need updating.
