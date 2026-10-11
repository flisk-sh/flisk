## Why

A warm `tdk up` on `tdk-restaurant-example` takes about 2 minutes even when nothing changed ([#1023](https://github.com/tdk-landscape/tdk-cli-core/issues/1023)). Measured on TDK 1.3.144, Docker Desktop with 8 CPUs:

- `golden-layers-build` takes ~21s with every step cached, because it runs nine `docker build --target` commands one after another. Every service build waits for it.
- Tilt builds at most 3 images at once by default, so the fourth backend and both frontends queue behind the first three.
- Each frontend image build takes ~60s, of which ~12s is `tsc --noEmit` and ~25s is `vite build` for 36 modules, while competing for CPU with the other builds.

An unchanged rebuild of kitchen-api with a warm cache takes 11s, so most of the 2 minutes is scheduling and repeated work, not real build work.

## What Changes

- Skip `golden-layers-build` when the golden Dockerfile and its images are unchanged, and when it does need to build, build all targets in one `docker buildx bake` so independent stages run in parallel. Fall back to the current serial builds when bake is unavailable.
- Emit `update_settings(max_parallel_updates=N)` in the generated Tiltfile, with `N` derived from the Docker engine's CPU count and memory and overridable by the user.
- In frontend images, run Vite directly when the service's `build` script is the standard `tsc[ --noEmit] && vite build` form, and run the type-check as a separate Tilt resource that reports errors without blocking the image.
- Record before/after timings for the restaurant example on #1023.

## Capabilities

### New Capabilities

- `tdk-up-build-performance`: How `tdk up` schedules and skips image builds so a warm start does only the work that changed.

### Modified Capabilities

None.

## Impact

- Affected code: `engine/topologies/platform/docker/build/golden_image_build.star` (and its constants), the CLI Tiltfile generator in `cli/src/generator/` with its golden snapshots, and `engine/topologies/platform/docker/layers/l3_builder_layers.star` plus the TypeScript/frontend Tilt resource registration.
- Generated projects change on the next `tdk project` / `tdk up`: the Tiltfile gains an `update_settings` call, frontend Dockerfiles change their build step, and a `<service>-typecheck` resource appears in Tilt.
- No change to runtime images, ports, routing, or service metadata. User-owned `package.json` scripts are not rewritten.
- Out of scope, tracked as a follow-up: publishing golden images to a registry and using registry build caches to speed up the first start on a new machine; lockfile handling in the L2 dependency layer (see design Open Questions).
