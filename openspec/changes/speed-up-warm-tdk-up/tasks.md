## 1. Baseline

- [x] 1.1 Add a small script (or `flisk` debug command) that prints per-resource build durations from Tilt's `uiresources` build history for a running project. (`scripts/benchmark/tilt-build-durations.mjs`)
- [x] 1.2 Record a baseline on `tdk-restaurant-example`: one cold-cache and three warm `flisk up` runs, with machine, Docker CPU/memory and Flisk version. Post it on #1023. (posted: cold 63 s, warm 10 to 18 s)

## 2. Golden images: skip when unchanged, bake when not

- [x] 2.1 Compute the golden hash over the golden Dockerfile content and pinned base images.
- [x] 2.2 Generate a bake file from `GOLDEN_LAYERS` with one target per image, tags, and the `tdk.golden.hash` label.
- [x] 2.3 Change `build_golden_layers` to skip when every tag exists with the matching label, otherwise run `docker buildx bake --load`, falling back to the serial `docker build` loop with a log line when bake is unavailable.
- [x] 2.4 Add a way to force a golden rebuild and document it.
- [x] 2.5 Tests: bake targets and tags match `GOLDEN_LAYERS`; command text contains the skip check, bake call and fallback. (`cli/src/utils/__tests__/golden-build-tilt.test.ts` runs the generated script with a fake docker)
- [ ] 2.6 Measure warm and changed-Dockerfile runs on the restaurant example and post on #1023.

## 3. Tilt build concurrency

- [x] 3.1 Emit `update_settings(max_parallel_updates=N)` in the generated Tiltfile, computed from `docker info` with the clamp in the design, honoring `TDK_MAX_PARALLEL_BUILDS`.
- [x] 3.2 Log the chosen value and its source at Tiltfile load; keep Tilt's default when `docker info` fails.
- [x] 3.3 Update golden Tiltfile snapshots in `cli/src/generator/__tests__/golden/` and add a test for the override and failure paths. (snapshots updated; the value and the override/failure wiring are tested in `build-performance-tilt.test.ts`)
- [x] 3.4 Measure peak Docker memory during a restaurant warm start at the chosen `N` and adjust the per-build budget if needed. (Docker VM sampling is not a per-start measure: the VM's resident memory rises during the cold build and stays high (4.8 GB peak in the cold run, 2.5 to 2.9 GB in warm runs). An earlier 1.9 GB figure came from a smaller starting VM and is not comparable. The 1.5 GiB budget is unchanged. See benchmarks/results/tdk-up-warm-start-2026-10-11/README.md.)
- [x] 3.5 Measure and post on #1023. (posted)

## 4. Frontend builds

- [x] 4.1 Detect the standard `tsc --noEmit && vite build[ ...]` build-script form (non-emitting type-check only); for it, emit a direct `bunx vite build --config <generated build config>` step in the L3 frontend stage. Leave other script forms unchanged.
- [x] 4.2 Register a non-blocking `<service>-typecheck` local resource for those frontends.
- [x] 4.3 Tests for the detection (standard forms, custom scripts, missing script) and the generated Dockerfile step. (`build-performance-tilt.test.ts`, evaluated by Tilt)
- [x] 4.5 Name `<service>-typecheck` in the focus filter so focus mode enables it (regression test in template-engine.test.ts).
- [x] 4.4 Measure frontend build time and the end-to-end warm start; post on #1023. (floor-app and reservation-app: about 22 s cold, 2.5 to 5.6 s warm)

## 5. Docs and follow-ups

- [x] 5.1 Document the golden skip, the force-rebuild option, `TDK_MAX_PARALLEL_BUILDS`, and the type-check resource. (`engine/docs/GOLDEN_IMAGE_INTEGRATION.md`)
- [x] 5.2 Open follow-up issues for registry-backed golden images and caches, and for L2 lockfile handling. (#1027, #1028)
