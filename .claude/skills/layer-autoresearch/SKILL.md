---
name: layer-autoresearch
description: Autonomous keep/discard experiment loop (after karpathy/autoresearch) that optimises Flisk's L1-L4 Docker layers toward the north star of 100 services on a 16 GB machine. Use when asked to run autoresearch on the Docker layers or to optimise the golden/runtime layers experimentally.
license: MIT
compatibility: Contributor skill. Requires a flisk checkout, Docker and git. Does not deploy.
metadata:
  author: flisk-sh
  version: "1.0"
---

# Layer autoresearch

Adapted from karpathy/autoresearch `program.md`. You are an autonomous researcher making the Flisk runtime layers cheaper **without removing features**.

## Setup (with the user, once)

1. Agree a run tag (e.g. `sep25`). Create `git checkout -b autoresearch/<tag>` from `main`. The branch must be new.
2. Warn the user: this workspace has an external tool that auto-commits and pushes working-tree edits. Ask them to pause it for the run, because experiment resets must not reach `origin/main`.
3. Read the in-scope files in full:
   - Editable: `engine/topologies/platform/docker/layers/*.star`, `engine/topologies/platform/docker/layers/prisma/*.star`, `engine/topologies/platform/docker/build/golden_image_dockerfile.star`, `engine/topologies/platform/docker/config/healthcheck.star`.
   - Read-only ground truth: `scripts/autoresearch/layer-eval.sh`, `scripts/benchmark/container-scale.ts`, `tests/tilt-engine/test_runtime_container_footprint.py`, and the spec `openspec/specs/runtime-container-footprint` (or its change under `openspec/changes/`).
4. Check that `../tdk-erp-system` exists with built images (`docker images | grep finance_`). If not, ask the human to run `flisk up` there once.
5. Create an untracked `autoresearch-results.tsv` with the header `commit	mem_mib	image_mib	status	description`.
6. Confirm with the user, then start.

## Experiment

Run `scripts/autoresearch/layer-eval.sh > run.log 2>&1` (about 5-10 minutes). Read the results with `grep -A20 '^---' run.log`.

- **Primary metric: `mem_per_service_mib`, lower is better.** This is idle memory per real ERP service, and it is what limits 100 services on 16 GB.
- **Tie-breaker:** if memory is within 0.5 MiB of the best, a lower `unique_per_service_mib` or `service_image_mib` wins, then simpler code.
- **Hard constraints.** `status: ok` requires all 20 services healthy, zero crashes, and passing feature tests. Anything else is a discard, or a crash if it didn't run.
- **Never** edit the eval harness, benchmark, tests or spec. Never remove a user-facing feature: Prisma, Infisical entrypoint, hugo-as-feature, healthchecks, signal handling. Don't add dependencies.

Candidate ideas, from real measurements on 2026-09-25:
- Duplicate `node_modules` copy in the L4 backend runtime (4.2 MB twice per service).
- L1 installs `file`, `bash` and `openssl` into every runtime image (30 MB apk layer). Check what actually needs them first.
- Bun runtime memory flags (e.g. `--smol`) in the resolved `CMD`.
- Distroless or slimmer Bun base for L4.
- Per-service unique layer size.

## Loop (never stop until the human interrupts)

1. Note the current commit.
2. Change the editable files with one idea.
3. `git commit -m "<idea>"`.
4. Run the eval, redirected to `run.log` (don't flood context).
5. If there's no `---` block, `tail -n 50 run.log`. Fix trivial mistakes, otherwise log `crash`.
6. Append a row to `autoresearch-results.tsv` (untracked).
7. If the metric improved and `status: ok`, keep the commit. Otherwise `git reset --hard HEAD~1`.
8. An eval that runs longer than 20 minutes counts as a failure.

The first run is always the unmodified baseline.
