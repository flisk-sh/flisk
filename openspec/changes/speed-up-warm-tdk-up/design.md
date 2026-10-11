## Context

`tdk up` registers one Tilt `local_resource`, `golden-layers-build`, that builds the project's shared base images (L1 OS, L2 dependencies, L3 build tools, L4 runtimes) from `.tdk/.tdk-out/golden-layers.Dockerfile`. Every service `docker_build` lists it as a resource dependency. Its command is nine `docker build -f ... --target <stage> -t <prefix>-<layer>:latest` calls joined with `&&`, so even a fully cached run pays nine CLI invocations, context loads and image exports (~21s measured).

The generated Tiltfile never calls `update_settings`, so Tilt's default concurrency applies. In the measured run three backends started together and kitchen-worker started only when kitchen-api finished.

Frontend Dockerfiles run the service's `build` script with `--config <vite build config>` appended. The CLI scaffolds that script as `tsc && vite build ...` (`cli/src/commands/resource.ts`), and the restaurant example uses `tsc --noEmit && vite build`. The type-check therefore runs inside the image build and blocks the image.

Measured timeline (2026-10-10, restaurant example, warm cache except for regenerated Dockerfiles):

| Resource | Start → finish |
|---|---|
| (Tiltfile) | 20:33:17 → 20:33:25 |
| golden-layers-build | 20:33:28 → 20:33:49 |
| kitchen-api, menu-api, reservation-api | 20:33:49 → ~20:34:21 |
| kitchen-worker | 20:34:21 → 20:34:40 |
| floor-app | 20:34:21 → 20:35:21 |
| reservation-app | 20:34:23 → 20:35:23 |

## Goals / Non-Goals

**Goals:**

- A warm `tdk up` with no source or generator changes does not rebuild golden images.
- Golden images, when they must be built, build their independent stages in parallel.
- Service image builds use the CPU the Docker engine has, without oversubscribing memory.
- Frontend images are not blocked by type-checking, while type errors stay visible.
- Each change can be measured, and the measurement is recorded on #1023.

**Non-Goals:**

- Faster first start on a new machine through a shared image registry or `--cache-from type=registry`. This is a separate, larger change.
- Changing runtime images, image contents, or what services run.
- Rewriting user-owned `package.json` scripts.
- Reducing the per-rebuild overhead inside Tilt or BuildKit (the ~10s floor measured on an unchanged kitchen-api rebuild).

## Decisions

### Skip golden builds by content hash

The `golden-layers-build` command computes a SHA-256 of the golden Dockerfile plus the base-image references it pins, then checks with `docker image inspect` that every golden tag exists and carries the label `tdk.golden.hash=<hash>`. If all match, it prints that the golden images are up to date and exits 0. Otherwise it builds and applies the label to every target.

The label is applied at build time (bake `labels` attribute or `--label`), not written into the Dockerfile, because the hash covers the Dockerfile itself.

Alternative considered: rely on BuildKit's cache. It already makes every step a cache hit, and the measured run still took ~21s, so the cost is the invocations, not the steps.

Alternative considered: a Tilt `deps=` trigger only. Tilt still runs `local_resource` commands once on startup, so it does not avoid the startup cost.

### Build golden targets with one `docker buildx bake`

The generator writes a bake file (JSON, next to the golden Dockerfile) with one target per golden image, each with its `target`, tag and hash label, and a default group containing all of them. The resource runs `docker buildx bake -f <file> --load`. BuildKit then solves the shared stages once and builds independent stages (L3 backend/frontend/migrator, L4 variants) in parallel.

If `docker buildx` is not installed, the command falls back to the existing serial `docker build` loop and says so in the resource log. A bake failure fails the resource; it is not retried serially.

Alternative considered: run the existing `docker build` calls in the background with `&` and `wait`. That parallelizes but keeps nine context loads and gives poor error reporting.

### Derive Tilt build concurrency from the Docker engine

The generated Tiltfile calls `update_settings(max_parallel_updates=N)`. `N` is computed at Tiltfile load from `docker info` (`NCPU`, `MemTotal`): `N = clamp(min(NCPU - 2, floor(MemTotal / 1.5 GiB)), 3, 8)`. The `TDK_MAX_PARALLEL_BUILDS` environment variable overrides it (no project setting). If `docker info` fails, `N` stays at Tilt's default and the Tiltfile logs why.

Using the engine's numbers instead of the host's matters on macOS, where the Docker VM usually has fewer CPUs and much less memory than the host.

The 1.5 GiB-per-build budget is a starting estimate from frontend builds (Vite plus `tsc`). The task list includes checking it against measured peak memory.

### Type-check frontends outside the image build

When a frontend's `build` script matches the standard form `tsc --noEmit && vite build[ ...]` (a non-emitting type-check; a plain `tsc` that emits output stays in the image), the L3 frontend stage runs `bunx vite build --config <generated build config>` directly instead of `bun run build`. TDK also registers a `<service>-typecheck` Tilt `local_resource` that runs `bunx tsc --noEmit` in the service directory on file changes. It does not gate the service, and it shows errors in Tilt.

When the script has any other form, the image keeps running `bun run build --config ...` exactly as today, because the script may run codegen or other steps TDK cannot see.

Alternative considered: always bypass the script. That would silently skip custom build steps in user projects.

Alternative considered: keep the type-check in the image as a parallel stage. It still blocks the final image and keeps CPU pressure during the build window.

## Risks / Trade-offs

- **A stale hash label skips a needed rebuild** (for example the user deletes and retags images by hand). → The check requires every golden tag to exist with the matching label; any missing or mismatched tag triggers a full build. `tdk up --rebuild-golden` (or removing the images) forces it.
- **Higher concurrency exhausts Docker memory and causes OOM-killed builds.** → Memory-based cap, minimum of 3 (today's behavior), and a user override. The memory budget is checked against measurements before release.
- **Frontend type errors no longer fail `tdk up`.** → They show as a failed `<service>-typecheck` resource in Tilt and in `tdk status`. CI and `bun run build` outside Docker still run the full script.
- **Bake output differs from the serial builds.** → Same Dockerfile and targets. A test compares the bake file's targets and tags with `GOLDEN_LAYERS`.

## Migration Plan

1. Golden skip-by-hash and bake build, with serial fallback.
2. `update_settings` in the generated Tiltfile, with golden snapshot updates.
3. Frontend direct-Vite build step and `<service>-typecheck` resource.

Each step lands separately with its own before/after timing on #1023. Existing projects pick changes up on the next `tdk project` / `tdk up`. Rollback is a revert; the hash label is harmless on older versions.

## Open Questions

- The L2 dependency layer does not copy `bun.lock`, while the Prisma build path does (`prisma_build.star`). The restaurant example's committed Dockerfiles, made by an older generator, did copy it. Should L2 copy the root lockfile so installs resolve locked versions, and does that work for services that are not workspace members of the root `package.json`? This affects reproducibility more than speed, so it should get its own issue.
- Should `tdk status` treat a failed `<service>-typecheck` as degraded, or report it separately?
