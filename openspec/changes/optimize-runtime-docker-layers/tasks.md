# Tasks

## 1. Preflight checks

- [x] 1.1 Search every Flisk project in the workspace (`tdk-erp-system`, `tdk-saas-starter`, `tdk-restaurant-example`, `tdk-user-management`) for services that use `hugo` without listing it in `featuresEnabled`. Record the result under design D5. Verify by attaching the search command and its (expected empty) output to the design note.
- [x] 1.2 Determine whether any `l4_migrator_golden`-based container runs long-lived or all are one-shot jobs. Record the answer under design D4 and keep or switch the D4 decision accordingly. Verify that design.md is updated with the evidence (compose `restart` policy and Tilt resource type).

## 2. Single-process runtime (D1, D2)

- [x] 2.1 Add one start-command resolver to the engine. It returns `bun <file>` for a `start` script of exactly `bun run <file>` or `bun <file>`, and `bun run start` otherwise. Verify with a new pytest in `tests/tilt-engine/` that generates Dockerfiles for fixture services with these start scripts: `bun run dist/index.js`, `bun dist/index.js`, `bun run dist/index.js --port 4000`, `NODE_ENV=x bun run dist/index.js`, `tsc && bun dist/index.js`, and no `start`. Assert the resulting `CMD` for each.
- [x] 2.2 Apply the resolver where every Bun `CMD` is emitted: the backend runtime (plain and Infisical-entrypoint paths) and the Bun-static frontend in `l4_runtime_layers.star`. Upstream `cmd` defaults stay as the no-override value and explicit overrides are kept (design D1). Verify with `test_backend_cmd_follows_start_script` (both paths) and `test_explicit_cmd_override_is_kept`.
- [x] 2.3 Emit `init: true` for generated backend and frontend runtime services in `compose.star`. Verify with a pytest asserting `init: true` on both service kinds in a generated compose file.
- [ ] 2.4 Build one real backend (`cash-management-api` in `tdk-erp-system`) from the new layers. Verify that `docker top` lists exactly one Bun process running `dist/index.js`, and that `docker stop` finishes in under 3 s.

## 3. Healthchecks (D3, D4)

- [x] 3.1 Set `get_docker_healthcheck_config` to `interval 30`, `start_interval 2`, `start_period 30`, `retries 3`, and add `--start-interval` to every golden `HEALTHCHECK`. Verify with a pytest on the generated `golden-layers.Dockerfile` asserting `--interval=30s --start-interval=2s` on each stage.
- [x] 3.2 Make `compose.star` (lines 141, 264) and `traefik_standalone.star` read the shared healthcheck config instead of hard-coding `10s`. Verify with a pytest asserting that generated compose files contain `interval: 30s` and `start_interval: 2s` and no `interval: 10s` for app services.
- [ ] 3.3 Replace the golden migrator `bunx prisma --version` healthcheck with `HEALTHCHECK NONE` (design D4). Verify with a pytest asserting that no generated golden stage or migrator runtime contains `bunx` or `npx` in a `HEALTHCHECK`, and that after a golden rebuild `docker inspect <prefix>-l4-migrator:latest` shows `Healthcheck.Test` = `["NONE"]`.
- [x] 3.4 Add a `flisk doctor` check for Docker Engine 25+ and Compose 2.20.2+ in `cli/src/commands/doctor.ts`, with vitest cases in `cli/src/commands/__tests__/doctor.test.ts` for an old version (fails, with an upgrade hint) and a current one (passes). Verify with `bun run test -- doctor.test.ts`.
- [ ] 3.5 Verify startup readiness with `docker events`: a freshly started backend is marked `healthy` within 5 s of its first successful `/health` response.

## 4. Golden image contents (D5)

- [ ] 4.1 Remove `RUN apk add --no-cache hugo` from the `l4_backend_bun` stage in `golden_image_dockerfile.star`. Verify that `docker run --rm <prefix>-l4-backend:latest which hugo` exits non-zero, and that `docker image inspect` shows the image about 57 MB smaller than before.
- [x] 4.2 Pass the manifest from `manifest_resource.star` to `Docker.backend` so the feature-gated install actually runs (design D5), then verify: a service with `"featuresEnabled": ["hugo"]` gets `apk add --no-cache hugo` in its generated Dockerfile and a service without it does not (`test_hugo_installed_only_for_services_declaring_it`).

## 5. Footprint budget and docs (D6)

- [ ] 5.1 Add `scripts/measure-idle-footprint.sh <container>`. It waits for the running backend container to be `healthy`, counts Bun processes, samples `docker stats` for 60 s, and exits non-zero if it finds more than one Bun process, memory over 64 MiB, or average CPU of 2% or more. (It measures an existing container instead of generating a template backend, because generation needs a whole project. The ERP backends are generated from the default template.) Verify it passes against a finance backend built from the new layers.
- [ ] 5.2 Document the minimum Docker Engine / Compose versions, the `TDK_HEALTHCHECK_*` overrides, the `featuresEnabled: ["hugo"]` migration note, and how to run the footprint script in `cli/README.md` (the repo has no root README). Verify the documented commands run as written.

## 6. Integration

- [ ] 6.1 Re-vendor into `tdk-erp-system` (`flisk project --yes`, touch the Tiltfile, rebuild golden layers) and run `flisk up finance`. Verify that every finance service is healthy and answers HTTP 200, and record per-container idle memory next to the baseline in proposal.md.
- [ ] 6.2 Measurement only: start the full `tdk-erp-system` landscape on the 16 GB reference machine. Record load average, free memory, and `docker ps` latency against the 2026-09-25 baseline, then add the numbers to proposal.md. This informs the separate default-startup-scope change and is not a pass/fail gate.
