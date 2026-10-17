## Context

See proposal.md for why. This is the inventory on `origin/main` (5194a45a plus later releases) and where each item goes:

| Today | What it proves | Group / suite | Runs in CI today |
|---|---|---|---|
| `quickstart-e2e.yml` | README quickstart: backend + React + Vue, routed `/health` | journeys / quickstart | PR, nightly, after release |
| `smoke-e2e.yml` + `scripts/verify-smoke.sh` | smoke runner pass/fail records | journeys / smoke | PR (path-filtered) |
| `go-dev-loop-e2e.yml` + `tests/e2e/journeys/dev-loop/go-dev-loop.sh` | Go backend live reload | journeys / dev-loop-go | PR |
| `cold-start-e2e.yml` + `scripts/e2e/cold-start.sh` | licensed deferred start | journeys / cold-start (secret, never on PR) | nightly, after release |
| `example-e2e.yml` | default example boots | examples / default | PR, main |
| `examples-e2e.yml` | saas-starter + restaurant real routes | examples / real-apps | daily |
| `python-example-e2e.yml` | Python provider example | examples / python | PR (path-filtered) |
| `byo-e2e.yml` + `tests/e2e/resource-types/bring-your-own/verify-byo-python.sh` | BYO dry run | resource-types / bring-your-own | PR |
| `byo-boot-e2e.yml` + `tests/e2e/resource-types/bring-your-own/verify-byo-python-boot.sh` | BYO boot | resource-types / bring-your-own | daily |
| `scripts/verify-byo-{example,job,pair,tdk}.sh` | BYO variants | resource-types / bring-your-own | **never** |
| `scripts/verify-mcp.sh` | MCP resource | resource-types / mcp | **never** |
| `scripts/verify-frontend-frameworks.sh` | every frontend framework | resource-types / frontend | **never** |
| `agent-e2e.yml` + `scripts/agent-e2e.sh` (#1272) | agent resource, sessions, restart, MCP tools | resource-types / agent (reference) | PR, nightly, after release |
| `windows-smoke.yml`, `wsl2-smoke.yml` | host support | platforms / windows, wsl2 | PR, push |
| `erp-scale-e2e.yml`, `benchmarks.yml` | 100-service boot, start-up timing | scale / erp, benchmarks | manual, weekly, main |
| `cli/src/commands/__tests__/*-e2e.test.ts` | CLI against temp projects | cli-integration (stays in vitest) | every PR via `make test-ts` |

### Required checks, today and after cutover

Branch protection requires two checks today: `example-e2e` (job `example-e2e` in `example-e2e.yml`) and `windows-smoke` (job `windows-smoke` in `windows-smoke.yml`; the same name also appears on `release-binaries.yml`, which is why that duplicate is removed). Every other job is non-required. Both required jobs are skipped on docs-only pull requests, and a skipped required check counts as passing, which is why they report on every pull request.

The inventory marks each job `required: true|false`. The required set in the inventory must equal the branch-protection contexts (checked with `gh api repos/{owner}/{repo}/branches/main/protection/required_status_checks`, which the check runs in CI). A change to one side without the other fails the check. After cutover the required set is the `ci.yml` `summary` job plus the `e2e-<group>` gates, and the two names above are dropped.

### Every CI job (all 36 workflows)

Measured over 1,000 workflow runs from 2026-10-16 21:32 to 2026-10-17 11:54 UTC (about 14 hours, a busy merge day), with job timings from 400 of those runs. The repository is public, so Actions minutes cost nothing. What does cost something is the time until a pull request goes green, the 20 concurrent job slots everyone shares, and checks that stay red until nobody reads them. "Med" is the median successful job duration in minutes.

| Workflow / job | Triggers today | Measured | Tier | Decision |
|---|---|---|---|---|
| `ci.yml` / `docs` (calls `docs-only.yml`) | PR, push, dispatch | 29 runs, 0.1 med | gate | Merge into one `changes` job |
| `ci.yml` / `changes` | same | 0.1 med | gate | Becomes the run's only detection job: docs-only, scanners, e2e selection, release build |
| `ci.yml` / `spellcheck` | same | 0.1 med | gate | Keep |
| `ci.yml` / `lint` | same | 0.2 med | gate | Keep; Bun cache through the composite action |
| `ci.yml` / `typecheck` | same | 0.1 med | gate | Keep; Bun cache |
| `ci.yml` / `fuzz` | same | 0.1 med | test | Keep |
| `ci.yml` / `published-schema` | same | 0.1 med | gate | Keep |
| `ci.yml` / `test` | same | 1.6 med, 2 cancelled | test | Keep; setup through composite actions |
| `ci.yml` / `package-smoke` | same | 0.4 med | test | Becomes the job that packs the CLI once and uploads it for e2e legs |
| `ci.yml` / `secret-scan` | same | 0.2 med | gate | Keep |
| `ci.yml` / `dependency-review` ("Dependency Audit") | PR, lockfile only, `vars.DEPENDENCY_REVIEW` | skipped 29 of 29 | security | Variable is unset: enable it or remove the job, and record which in the inventory |
| `ci.yml` / `workflow-audit` | PR, workflow changes | 0.3 med, skipped 18 of 29 | gate | Keep |
| `ci.yml` / `trivy` | every run | 0.5 med | security | Path-gate on PR (Dockerfiles, IaC, lockfile); full on `main` and nightly |
| `ci.yml` / `osv-scanner` | every run | 0.4 med | security | Path-gate on PR (lockfiles); full on `main` and nightly |
| `ci.yml` / `semgrep` | every run | 0.9 med | security | Path-gate on PR (source); full on `main` and nightly |
| `ci.yml` / `summary` | always | 0.1 med | gate | Becomes the single required aggregate check, fed by the e2e group gates |
| `codeql.yml` / `analyze` (2 legs) | PR, push, weekly | 1.0 and 0.7 med | security | Skip on docs-only PRs; `actions` leg only when workflows change |
| `code-health.yml` / `health` | PR, push | 0.5 med | report | Keep on PR (it posts a report); no `push` run |
| `dco.yml` / `dco` | PR | 0.1 med, 15 failures (missing sign-off) | gate | Add a concurrency group |
| `oss-score-gate.yml` / `gate` | PR | 0.1 med | gate | Add a concurrency group |
| `release-binaries.yml` / `changes` | every PR, push of `package.json` | 0.1 med | release | Use `ci.yml`'s `changes` outputs on PRs |
| `release-binaries.yml` / `build` | same, gated | 1.2 med, skipped 7 of 25 | release | Keep on release-relevant PRs |
| `release-binaries.yml` / `windows-smoke` | same, gated | 0.2 med | platforms | Duplicate of `windows-smoke.yml`, and it reports a check with the same name (`windows-smoke`), so the required name is ambiguous today. One Windows suite in `e2e-platforms`, called by the release workflow against the built binary |
| `release-binaries.yml` / `publish` | push to `main` | 1.6 med | release | Keep |
| `windows-smoke.yml` / `docs`, `windows-smoke` | PR, push | no concurrency group | platforms | Into `e2e-platforms`; required name kept until the switch |
| `wsl2-smoke.yml` / `wsl2-smoke` | PR, push | skipped 70 of 74 | platforms | Into `e2e-platforms`, selected by the same paths it uses today |
| `example-e2e.yml` / `docs`, `example-e2e` | PR, push | 1.2 med | e2e | `e2e-examples / default`; required name kept until the switch |
| `examples-e2e.yml` / `example` (matrix) | daily | 2.4 | e2e | `e2e-examples / real-apps`, nightly |
| `python-example-e2e.yml` | PR (paths) | 1.6 med, 3 of 8 cancelled | e2e | `e2e-examples / python` |
| `quickstart-e2e.yml` / `quickstart` | PR, daily, after release | 1.3 med | e2e | `e2e-journeys / quickstart` |
| `smoke-e2e.yml` | PR (paths) | rare in window | e2e | `e2e-journeys / smoke` |
| `go-dev-loop-e2e.yml` / `go-dev-loop` | PR (paths) | rare in window | e2e | `e2e-journeys / dev-loop-go` |
| `cold-start-e2e.yml` / `cold-start` | daily, after release | failed 8 of 8: `TDK_LICENSE_KEY` not configured | e2e | `e2e-journeys / cold-start`; neutral with a warning when the secret is missing, plus a tracking issue |
| `agent-e2e.yml` / `agent-e2e` | PR (paths), daily, after release | 3.1 med, failed 9 of 17 (A7 ordering, fixed in #1273; A4 failed again on `main`) | e2e | `e2e-resource-types / agent`; A4 tracked as flaky |
| `byo-e2e.yml` / `byo-python` | PR (paths) | 0.3 med | e2e | `e2e-resource-types / bring-your-own` |
| `byo-boot-e2e.yml` / `byo-python-boot` | daily | 1.2 | e2e | `e2e-resource-types / bring-your-own`, nightly case |
| `erp-scale-e2e.yml` / `erp` | manual, weekly | none in window | e2e (scale) | `e2e-scale / erp` |
| `benchmarks.yml` / `measure` | every push to `main` touching `cli/`, `engine/` and more | 14 runs in 14 hours, 65 min median, 6 failed (warm run timed out at 1,861 s with 7 of 8 services healthy), 7 cancelled | report | `e2e-scale / benchmarks`: nightly on the latest `main`, after release, manual. The timeout gets a tracking issue |
| `benchmarks.yml` / `publish` | after `measure` | skipped | report | Keep |
| `scorecard.yml` / `scorecard` | every push to `main`, weekly | 18 runs, 0.8 med | report | Weekly and manual only |
| `publish-service-schema.yml` / `publish` | push (paths), dispatch | 0.1 | release | Keep |
| `publish-tdk-import.yml` / `build`, `publish` | manual | none | release | Keep |
| `sync-tdk-skills.yml` / `sync` | dispatch, repository_dispatch | none | bot | Keep; keeps repo-local skills (see below) |
| `npm-downloads-graph.yml` / `graph` | schedule | none in window | report | Keep |
| `ai-conflict-buttons.yml` / `comment` | PR target: opened, reopened, synchronize, edited | 68 runs | bot | Keep `synchronize` (conflicts change with commits); drop `edited` |
| `ai-conflict-buttons.yml` / `backfill` | dispatch | skipped 28 of 28 | bot | Keep (manual) |
| `ai-review-buttons.yml` / `append`, `backfill` | PR target | 36 runs | bot | Run on `opened`, `reopened` and `ready_for_review` only |
| `ai-spec-buttons.yml` / `append` | issues | 11 of 17 cancelled | bot | Narrow `types:` to the events that change the spec block |
| `pr-area-labels.yml` / `label` | PR target | 62 runs | bot | Keep `synchronize` (labels follow changed paths) |
| `hall-of-fame.yml` / `update` | PR target | 19 runs | bot | `closed` with merged only |
| `contributor-merged.yml` / `thank` | PR target | skipped 13 of 19 | bot | `closed` only |
| `contributor-welcome.yml` / `welcome`, `not-fixed` | PR target, issues | skipped 22 of 22 | bot | `opened` only |
| `update-pr-branches.yml` / `update` | every push to `main`, PR target | 72 runs | bot | Biggest multiplier: each merge rebases every stale PR, and each rebase re-runs that PR's full CI. Replace with the merge queue, or update only approved and auto-merge PRs |
| `issue-claims.yml` / `claim`, `sweep` | issue comment, schedule | mostly skipped | bot | Keep |
| `journey-map.yml` / `map` | schedule, issues | 4 cancelled, 9 skipped | bot | Narrow `types:` |
| `docs-only.yml` / `detect` (reusable) | called | three callers | gate | Removed; replaced by `ci.yml`'s `changes` job |

Setup duplication found while taking the inventory: 14 workflows download Tilt with the same checksum block, 7 free port 5432, 15 run `bun install`, and none caches Bun's install directory. Three PR workflows (`dco`, `oss-score-gate`, `windows-smoke`) have no concurrency group, so superseded runs keep their slots.

There is no live-stack coverage for `worker`, `migrator`, `library` or `sdk`. `make test-shell` runs `bash -n` on `scripts/verify-*.sh`, which only checks syntax.

## Goals / Non-Goals

**Goals:**
- One obvious home and one shape for every e2e suite, so the guide and the skill can describe a single procedure.
- Coverage gaps become failing checks or tracked allowlist entries, not silence.
- No assertion is lost in the move, and required checks keep reporting throughout.

**Non-Goals:**
- Rewriting assertions in the stackless `*-e2e.test.ts` files. They are classified as `cli-integration` and stay in vitest. A rename to `*.integration.test.ts` is optional and done only if the group check needs it.
- New product features, or making Windows run full live-stack suites.
- Changing which suites need secrets. `cold-start` keeps its never-on-PR rule.

## Decisions

### Group by what a suite proves, not by trigger or tool
Alternatives were grouping by trigger (PR / nightly / manual) or by runner (bash / vitest). Both scatter one feature's tests and change when costs change. Grouping by what is proven (a resource type, a user journey, a real app, a host, scale) maps directly to the question a contributor asks: "I changed X, where is its e2e?" Triggers become per-suite metadata instead.

### `tests/e2e/<group>/<suite>/run.sh`, modeled on the agent suite
The agent suite already has the needed properties: case ids runnable alone, `list` / `diagnostics` / `cleanup`, bounded `poll_until`, a `run` wrapper recording exit code and elapsed time, `assert envelope` for single-envelope checks, Traefik requests that resolve `*.localhost` to loopback, and stubs pointed at by `TDK_SERVICE_BASE_URL`. Bash plus small Node helpers was chosen over vitest for live stacks because each case maps to one CI step with its own log, contributors can run a case by hand, and nothing has to be built before a run. Vitest stays for stackless tests.

### Shared helpers extracted, not copied
`scripts/agent-e2e/{assert-json,mcp-client,stub,check-docs}.mjs` and the shell helpers in `scripts/agent-e2e.sh` move to `tests/e2e/lib/` (`lib.sh` sourced by every `run.sh`, plus the `.mjs` files). The agent suite is migrated first and must stay green. Lessons it already encodes become library behavior: wait for a *replaced* container after a restart (the old one answers `/ready` until Tilt swaps it); use `node:http` for requests that set `Host` (`fetch` drops it); and fail a setup request on any non-2xx status. In CI order, A7 ran after B0 had stopped the agent, and its checkpoint write got Traefik's `404 page not found` without failing. The later durability assertion then blamed the agent.

### One workflow per group with a matrix and a gate job
Alternatives were one workflow per suite (today's sprawl) or one workflow for everything (one slow red X for any failure). Per group, a `changes` job computes which suites the PR touches from each suite's declared paths. The matrix runs only those, and a final `e2e-<group>` gate job always runs and fails if any selected suite failed. Branch protection requires the gate, so path filtering never leaves a pending required check. Nightly and `workflow_run` after release select every suite in the group. `scale` and `journeys/cold-start` keep manual or weekly triggers.

### Suite metadata in a `suite.json` next to `run.sh`
Each suite declares its `paths`, `cases` (CI order), `triggers` (pr, nightly, release, manual, weekly), `timeoutMinutes` and `needsSecrets`. Workflows read it, so a contributor adding a suite edits one folder, not YAML. The coverage check also reads it.

### Coverage check is a CLI unit test
A vitest test imports the list of valid resource types and compares it with the directories under `tests/e2e/resource-types/` and `tests/e2e/resource-types/allowlist.json` (`{ "type": { "reason": "...", "issue": "https://github.com/..." } }`). It runs in the existing Test job on every PR, so it needs no new workflow. Initial allowlist: `library` and `sdk` if a consumed-build case is not ready in the first pass. `worker` and `migrator` get suites.

### Matrix first: one job per kind of test, one axis per kind of variant
Without this rule the workflow count grows with every provider: Python and Go already have their own workflows, and #1276 adds Node. The rule is that tests with the same steps share one job, and variants are matrix values. The axes are resource type (`appType`), backend language, frontend framework, example app, and host platform. Axes with a registry in the CLI are generated from it at run time (`VALID_RESOURCE_TYPES`, `cli/src/backend-languages/registry.ts`, `cli/src/frontend-frameworks/`), so a provider pull request such as #1276 gets its e2e leg without editing YAML. A coverage check fails when a registry entry has neither a matrix value nor an allowlist entry with an issue link. Nested axes stay shallow: `backend` × language and `frontend` × framework group are the only two-level axes. On a pull request, the `changes` job selects only the values whose files changed. Nightly and release runs use every value. The matrix does not merge tests that do different things: a dev-loop journey and a resource contract stay separate jobs even when both are written in Go. Alternative: one workflow per variant, which is today's sprawl. Rejected, because a new provider would need new YAML, new required checks and copied setup.

The axes found in the code today, which seed `tests/e2e/axes.json`:

| Axis | Source of truth | Values today | Replaces |
|---|---|---|---|
| `appType` | `VALID_RESOURCE_TYPES` in `cli/src/utils/constants.ts` | backend, frontend, worker, migrator, mcp, agent, library, sdk, bring-your-own | `agent-e2e.yml`, `scripts/verify-mcp.sh`, missing suites |
| `language` | `cli/src/backend-languages/registry.ts` | bun, python, go, rust (+ node in #1276) | `go-dev-loop-e2e.yml`, part of `python-example-e2e.yml` |
| `httpFramework` | `cli/src/backend-frameworks/registry.ts` | hono (default), express, fastify, nestjs | no live coverage today |
| `frontendFramework` | `cli/src/frontend-frameworks/registry.ts` | react, vue, svelte, solid, preact, qwik, lit, vanilla, tanstack-router | `scripts/verify-frontend-frameworks.sh` (never run in CI) |
| `agentRuntime` | `cli/src/agent-runtimes/registry.ts` | custom | — |
| `agentDurability` | `tdk resource --durability` | files, postgres | postgres has no live coverage today |
| `feature` | `featuresEnabled` | prisma | — |
| `infraService` | `OPTIONAL_INFRA_SERVICES` | monitoring, elk, debezium, golden_image, verdaccio | no live coverage today |
| `byoVariant` | `examples/byo*`, `scripts/verify-byo-*.sh` | python, example, job, pair, tdk | `byo-e2e.yml`, `byo-boot-e2e.yml`, four unrun scripts |
| `example` | `examples/*` plus the saas-starter and restaurant repositories | default (`tdk-example`), one-backend, one-backend-python, one-backend-helm, saas-starter, restaurant | `example-e2e.yml`, `examples-e2e.yml`, `python-example-e2e.yml` |
| `platform` | runner labels | ubuntu, windows, wsl2 | `windows-smoke.yml`, `wsl2-smoke.yml`, the Windows job in `release-binaries.yml` |
| `installChannel` | how the CLI under test is installed | pr-tarball, npm, release-binary | install steps copied across e2e workflows |
| `journey` | `tests/e2e/journeys/*` | quickstart, smoke, dev-loop, cold-start | four workflows |

One axis at a time, with the others at their defaults, keeps the leg count linear. Today's values give about 50 legs nightly instead of a product in the hundreds of thousands. A pull request touching one provider runs one or two legs.

### Resource types are one matrix keyed by `appType`
Instead of nine resource-type suites with copied setup and copied common cases, `e2e-resource-types.yml` has one job with an `appType` axis. `tests/e2e/resource-types/common.sh` holds the cases every type shares (scaffold, status wait, restart, error envelope), parameterized by type. Each type's folder adds only its contract cases (agent sessions and MCP tools, a routed health check for backend and frontend, a processed job for worker, a completed run for migrator, a consumed build for library and sdk). Savings come from three places. Each leg is the same short definition, so adding a type costs a folder, not a workflow. Setup happens once per run through the packed tarball and composite actions. A pull request runs only the legs its paths select. Nightly and release runs add one combined leg that boots every compatible type in one stack, so nine boots become one for interaction coverage. Isolated legs stay on pull requests because a combined failure does not point at a type. `max-parallel` keeps the matrix within the shared 20-job limit. The agent suite moves first and becomes the `agent` leg. Its cases beyond the common set (sessions, MCP, drain, durability) stay in `resource-types/agent/`.

### Pull request orchestration lives in `ci.yml`; e2e groups are reusable workflows
The original plan gave each group its own pull request trigger. That makes every group run its own change detection, `bun install` and `npm pack`. It also adds another set of required checks. Instead, `ci.yml` runs one `changes` job and one pack job, then calls each `e2e-<group>.yml` with the selected suites and the tarball. The group workflows keep their own schedule, release and manual triggers. Alternative: separate workflows sharing a tarball through `workflow_run`. Rejected, because `workflow_run` cannot report a status on the pull request's head commit without extra API calls, and it runs with the base branch's code.

### A CI inventory file, checked like the resource-type allowlist
`.github/ci-inventory.json` lists every workflow and job with its tier, the reason for its triggers, and its owner. A test in `scripts/__tests__/` or `cli/src/**/__tests__/` parses every workflow file and fails on a missing or stale entry, a job without `timeout-minutes`, a PR workflow without a concurrency group, an inlined Tilt or port 5432 block, or a `report` or `scale` job triggered by `push`. This makes "cover every job" a check rather than a one-off audit. A generated `docs/ci.md` renders the inventory for people.

### Merge queue over "require branches to be up to date"
`update-pr-branches.yml` rebases every stale pull request after each merge, and each rebase re-runs the full CI. On the measured day that was 18 merges times the open PR count. GitHub's merge queue tests the merge result once (`merge_group` event), so pull request runs can stay on the fast tiers plus selected e2e suites. Switching is a maintainer setting, so the fallback is to update only approved or auto-merge pull requests.

### Missing secrets are neutral, not red
`cold-start` failed after every release because the license secret is not set. A permanently red job teaches people to ignore red. A preflight step checks for each secret the suite declares. If one is missing, the job ends with a warning and a neutral result, and the red-job tracker files an issue naming the secret.

### No automatic retries
Retries turn flaky tests green and hide them. The CI report detects flakiness by finding a failure and a pass on the same commit, and a quarantine needs an issue link.

### Repo-local skills survive the sync
`scripts/sync-tdk-skills.sh` currently deletes every directory in `.claude/skills` and every link in `.agents/skills`, then restores only the upstream ones. It will keep any skill listed in `.claude/skills/LOCAL` (one name per line) and re-create its `.agents/skills` link. `tdk-e2e-author` is the first entry. The D2 case of the agent suite extends to cover this. The alternative, putting the skill in the upstream `tdk-skills` repository, would make a contributor-only skill ship to every TDK user.

### Migration order
1. (#1272 has merged.) Extract `tests/e2e/lib/` and move the agent suite, then prove it green on CI.
2. Add the group workflows with gate jobs that also report the old required check names. Move `resource-types` suites (bring `verify-mcp.sh`, `verify-frontend-frameworks.sh` and the BYO scripts in), then add `worker` and `migrator`.
3. Move `journeys`, `examples`, `platforms` and `scale`, one suite per pull request, each with a passing run and a deliberate-break run.
4. Maintainers switch branch protection to the gate names. Then the compatibility check names and the old workflow files are removed.
5. Docs and skill land with step 1 (they describe the agent suite), and get updated as each group moves.
6. CI-wide work runs alongside the moves, each as its own pull request: composite setup actions and the Bun cache; the inventory file and its check; the single `changes` job and pack-once artifact; trigger fixes (benchmarks to nightly, Scorecard to weekly, bot event types, concurrency groups, security path gates); the red-job tracker and neutral missing-secret result; the weekly CI report; then the merge queue (maintainer action).

## Risks / Trade-offs

- [CI time grows when the six unrun scripts start running] → They run only on matching paths and nightly. Frontend frameworks and BYO variants run as separate matrix legs.
- [Renamed checks can block merges] → Gate jobs report the old names until branch protection is switched (step 4). The switch is one maintainer action, listed as a task.
- [Moving tests silently drops assertions] → Each move PR includes a before/after list of cases and one deliberate break per suite.
- [Large refactor touches many files at once] → Done as a series of small PRs against `main`, each one suite, with no stacked PRs.
- [Path-gating security scans could miss a vulnerable change] → Gating is by the files each scanner reads. Every scanner still runs in full on each `main` push and nightly, and a lockfile change always triggers OSV and dependency review.
- [Fewer `push` runs mean a regression is found hours later] → Benchmarks and Scorecard measure trends, not merge safety. Nightly is soon enough, and the release-triggered run still checks each published version.
- [Merge queue changes how contributors merge] → It is a maintainer opt-in. The fallback limits branch updates to approved pull requests.
- [Bash suites are harder to unit test] → Helpers stay small. The `.mjs` helpers carry the logic and get unit tests in `tests/e2e/lib/__tests__/`.
- [A `suite.json` read by workflows is new indirection] → It is validated by the coverage test, so a typo fails on the PR rather than producing a silently skipped suite.
