# Tasks

## 1. Foundation

- [x] 1.1 Extract shared helpers from `scripts/agent-e2e.sh` and `scripts/agent-e2e/*.mjs` into `tests/e2e/lib/` (`lib.sh`, `assert-json.mjs`, `mcp-client.mjs`, `stub.mjs`, `traefik` helper, `wait_restarted`), with unit tests for the `.mjs` helpers (#1280)
- [x] 1.2 Define `suite.json` (paths, cases, triggers, timeoutMinutes, needsSecrets) and a validator (#1280)
- [x] 1.3 Move the agent suite to `tests/e2e/resource-types/agent/` (`run.sh` + `suite.json`) using the shared library (#1280)
- [x] 1.4 Add `make test-e2e GROUP=<group> SUITE=<suite> [CASES=...]` (#1280)
- [ ] 1.5 Prove the moved agent suite green on CI and red on one deliberate break; post both outputs on the PR (agent suite moved in #1280; the green run and the deliberate-break run are still owed)

## 2. Group workflows

- [ ] 2.1 Add `e2e-resource-types.yml`: changes job from `suite.json` paths, matrix of selected suites, failure artifacts, always-running `e2e-resource-types` gate (`e2e-resource-types.yml` with plan, matrix and gate jobs is in this PR; failure artifacts are per suite; the `changes` job for path selection is still the workflow's own paths filter)
- [ ] 2.2 Make the gate also report the currently required check names until branch protection is switched
- [ ] 2.3 Remove `agent-e2e.yml` once the group workflow runs the agent suite (`agent-e2e.yml` is removed in this PR; the agent suite runs through the matrix as `run.sh all`)

## 3. Resource-type coverage

- [ ] 3.1 Add the coverage unit test (valid resource types vs `tests/e2e/resource-types/*` and `allowlist.json` with issue links)
- [ ] 3.2 Move `scripts/verify-mcp.sh` into `resource-types/mcp` and run it in CI
- [ ] 3.3 Move `scripts/verify-frontend-frameworks.sh` into `resource-types/frontend` (one matrix leg per framework group)
- [ ] 3.4 Move `tests/e2e/byo-python*.test.sh` and `scripts/verify-byo-{example,job,pair,tdk}.sh` into `resource-types/bring-your-own`
- [ ] 3.5 Add a `resource-types/backend` suite from the backend parts of quickstart (scaffold, routed health, restart, error envelope)
- [ ] 3.6 Add `resource-types/worker` (processes a job) and `resource-types/migrator` (migration completes before the API, per the migrator rule)
- [ ] 3.7 Add `resource-types/library` and `resource-types/sdk` (consumed build), or allowlist them with tracking issues

## 3b. Matrix axes (appType, language, framework, and the rest)

- [ ] 3b.1 Write `tests/e2e/resource-types/common.sh` with the shared cases (scaffold, status wait, restart with replaced-container wait, one error envelope), parameterized by `appType` (`common.sh` is in this PR with the four shared cases; the agent suite does not use it yet, so 3b.4 is still open and nothing is proved live)
- [ ] 3b.2 Make `e2e-resource-types.yml` a single job with an `appType` matrix built from the selected `suite.json` files, with `max-parallel` set (the `appType` matrix is in this PR as the suite matrix; the per-type axis waits on `common.sh` (3b.1))
- [ ] 3b.3 Add the combined leg (one stack, every compatible type) to nightly and release runs, with its own diagnostics
- [x] 3b.4 Move the agent suite's common cases onto `common.sh`; keep sessions, MCP, drain and durability as agent contract cases (#1319: A1 and A6 use `common.sh`; the live agent leg passed; sessions, MCP, drain and durability stay as contract cases)
- [ ] 3b.5 Generate the matrix axes from the registries (`VALID_RESOURCE_TYPES`, backend languages, frontend frameworks) in the `changes` job, and extend the coverage check to every registry with an allowlist (in this PR: `tests/e2e/lib/registry-axes.mjs` reads the registries and the `changes` job exposes them as the `axes` output; the matrix consumes them in 3b.6)
- [ ] 3b.6 Add the `backend` × language axis (bun, python, go, rust, and node once #1276 merges) with fail-fast off and max-parallel set
- [ ] 3b.7 Write `tests/e2e/axes.json` (axis, source, groups, defaults, known interactions with reasons) and extend the coverage check to every axis with a source (`axes.json` and its coverage check are in #1306; still to do: extend the check to every registry)

## 4. Other groups (one suite per PR)

- [ ] 4.1 journeys: quickstart, smoke, dev-loop-go, cold-start (keep its never-on-PR secret rule)
- [ ] 4.2 examples: one `example` axis (default, real-apps, python) replacing three workflows; the dev-loop journey gets a language axis, with `go` as its first value
- [ ] 4.3 platforms: windows, wsl2
- [ ] 4.4 scale: erp, benchmarks (manual, weekly, main)
- [ ] 4.5 Each move PR lists cases before and after, and shows a passing run plus a deliberate-break run

## 4b. Every CI job

- [ ] 4b.1 Write `.github/ci-inventory.json` for all 36 workflows and their 62 jobs (tier, `required`, trigger reason, owner) and a check that fails on missing or stale entries, duplicate check names, a required set that differs from branch protection, and rule violations; generate `docs/ci.md` from it (inventory and check merged in #1304, with a snapshot of the required checks and a daily drift job; `docs/ci.md` generation still to do)
- [ ] 4b.2 Add composite actions `setup-bun` (cache keyed on `bun.lock`), `setup-tilt`, `free-postgres-port` and `install-tdk`; replace the 14 inline Tilt blocks and 7 port 5432 blocks (`setup-bun`, `setup-tilt` and `free-postgres-port` are in #1305; `install-tdk` and the WSL2 Tilt block remain)
- [ ] 4b.3 Set `timeout-minutes` on every job from measured p90; add concurrency groups to `dco.yml`, `oss-score-gate.yml` and `windows-smoke.yml` (concurrency groups for the five pull request workflows are in #1307; every job already has `timeout-minutes` except reusable-workflow callers)
- [ ] 4b.4 Replace `docs-only.yml` and every per-workflow detection job with one `changes` job in `ci.yml`; make `summary` the single aggregate gate, still reporting `example-e2e` and `windows-smoke`
- [ ] 4b.5 Pack the CLI once per pull request run and have package smoke and e2e legs install the artifact
- [ ] 4b.6 Path-gate Trivy, OSV-Scanner, Semgrep and CodeQL's `actions` leg on pull requests; keep full runs on `main` and nightly. Enable or remove the always-skipped dependency review
- [ ] 4b.7 Move benchmarks off `push` (nightly on latest `main`, after release, manual); Scorecard to weekly and manual; `code-health` off `push`; open an issue for the warm-run timeout
- [ ] 4b.8 Merge the Windows smoke in `release-binaries.yml` and `windows-smoke.yml` into `e2e-platforms / windows`, called by the release workflow
- [ ] 4b.9 Narrow bot event types (`ai-review-buttons`, `ai-conflict-buttons`, `ai-spec-buttons`, `hall-of-fame`, `contributor-*`, `journey-map`) (`ai-review-buttons` and `ai-conflict-buttons` were already narrow; concurrency added in #1307; `hall-of-fame` and `contributor-merged` listen for `closed` and cannot narrow further)
- [ ] 4b.10 Make `update-pr-branches.yml` update only approved or auto-merge pull requests until the merge queue is on; add a `merge_group` trigger to the gate workflows
- [ ] 4b.11 Add a secret preflight that ends with a neutral result and a warning; add the red-job tracker (three consecutive failures open an issue, three passes close it) (secret preflight for `cold-start-e2e` is in #1308 and the red-job tracker in #1309; the preflight skips with a warning because GitHub has no neutral job result)
- [ ] 4b.12 Add the weekly `ci-report` workflow (p50/p90, failure, cancellation and skip rates, flaky cases, time to aggregate result, per-tier budgets)
- [ ] 4b.13 Each pull request in this section posts before and after numbers for the jobs it changes

## 5. Contributor guide and skill

- [ ] 5.1 Write `docs/contributing/05-write-e2e.md`: when an e2e is required, choosing the group, suite anatomy, shared helpers, running a case, CI triggers, deliberate break and evidence, with the agent suite as the worked example
- [ ] 5.2 Link it from `CONTRIBUTING.md` (Tests) and `docs/contributing/README.md`. Add an "E2E" line to each recipe in `docs/contributing/02-feature-recipes.md`
- [ ] 5.3 Write `.claude/skills/tdk-e2e-author/SKILL.md` and link it from `.agents/skills/`
- [ ] 5.4 Make `scripts/sync-tdk-skills.sh` keep skills listed in `.claude/skills/LOCAL`, and extend the D2 fixture test to cover it
- [ ] 5.5 Run the docs link check over the new pages

## 6. Cutover

- [ ] 6.1 Maintainers switch branch protection to the single aggregate gate, enable the merge queue, and configure `TDK_LICENSE_KEY` or accept a neutral `cold-start`
- [ ] 6.2 Remove the compatibility check names and the old workflow files and scripts
- [ ] 6.3 Run `openspec validate organize-e2e-suites --strict`
