## Purpose

Keeps every GitHub Actions job in this repository accounted for, fast where it blocks a pull request, quiet where it does not, and loud when it stays red. It covers all workflows, not only e2e: the gate in `ci.yml`, security scans, release, repository bots and scheduled reports.

## ADDED Requirements

### Requirement: CI tiers
Each job SHALL belong to one tier: `gate` (fast checks on every pull request), `test` (unit and package tests on non-docs pull requests), `e2e` (live-stack suites selected by path), `security` (scanners), `release`, `bot` (repository automation) or `report` (scheduled measurements).

#### Scenario: Classifying a scanner
- **WHEN** a maintainer adds a new dependency scanner job
- **THEN** its inventory entry has tier `security`, and it follows the security rule: path-gated on pull requests, full on `main` and nightly

### Requirement: Every job is in the CI inventory with a tier
Every job in `.github/workflows/*.yml` SHALL have an entry in `.github/ci-inventory.json` with its workflow, job id, tier, trigger reason and owner. A check on every pull request SHALL fail when a job has no entry, when an entry names a job that no longer exists, or when a job's triggers break its tier's rules.

#### Scenario: New workflow added without an entry
- **WHEN** a pull request adds `.github/workflows/foo.yml` and no inventory entry
- **THEN** the inventory check fails and names `foo.yml` and each of its jobs

#### Scenario: Report job triggered on every push
- **WHEN** a `report` job is triggered by `push` to `main`
- **THEN** the inventory check fails, because report jobs run on a schedule, after a release or by hand

### Requirement: Every job has a bounded timeout and superseded runs are cancelled
Every job SHALL set `timeout-minutes`, no more than three times its measured p90 duration rounded up, or a documented value for jobs with no history. Every workflow triggered by `pull_request` or `pull_request_target` SHALL set a `concurrency` group keyed by the pull request, with `cancel-in-progress: true` for pull request events. Release, nightly and `main` runs SHALL NOT be cancelled mid-run by a newer pull request push.

#### Scenario: Pull request pushed twice in a minute
- **WHEN** a contributor pushes two commits to a pull request in quick succession
- **THEN** every workflow run for the first commit is cancelled, including `dco.yml`, `oss-score-gate.yml` and the Windows smoke, which have no concurrency group today

### Requirement: Pull request checks are tiered and change detection runs once
On a pull request, `ci.yml` SHALL run one `changes` job that makes every path-based decision for the run: docs only, which scanners apply, which e2e suites are selected, and whether release binaries are built. Other jobs SHALL read its outputs. `docs-only.yml` and the per-workflow detection jobs SHALL be removed. A docs-only pull request SHALL run only `gate` jobs.

#### Scenario: Docs-only pull request
- **WHEN** a pull request changes only Markdown under `docs/`
- **THEN** only gate jobs run, every required check reports, and no stack boots

#### Scenario: Lockfile not changed
- **WHEN** a pull request changes `cli/src/**` and not `bun.lock`
- **THEN** OSV-Scanner and the dependency review are skipped on that pull request and still run on `main` and nightly

### Requirement: One required gate per pull request
Branch protection SHALL require one aggregate check from `ci.yml` that always runs and fails when any selected job failed or was cancelled for reasons other than a newer push. The e2e group gates feed into it. Until branch protection is switched, the currently required names (`example-e2e`, `windows-smoke`) SHALL still be reported.

#### Scenario: Selected e2e suite fails
- **WHEN** a pull request selects the `agent` suite and its case A4 fails
- **THEN** the aggregate check fails and names the `resource-types / agent` leg

### Requirement: Required checks are an explicit, checked set
The inventory SHALL mark each job `required: true` or `required: false`. The required set SHALL equal the branch protection contexts for `main`, and a check on every pull request SHALL fail when the two differ. Until cutover the required set is `example-e2e` and `windows-smoke`. Two jobs SHALL NOT report the same check name, so a required name always names one job.

#### Scenario: Duplicate check name
- **WHEN** a second job reports the name `windows-smoke`
- **THEN** the inventory check fails and names both jobs

#### Scenario: Required set changed on one side only
- **WHEN** a maintainer adds a required check in branch protection but not in the inventory
- **THEN** the check fails until the inventory matches

### Requirement: Shared setup lives in composite actions
Setup steps repeated across workflows SHALL live in composite actions under `.github/actions/`: installing Bun with a dependency cache keyed on `bun.lock`, installing Tilt with its pinned checksum, freeing port 5432 from the runner's Postgres, and installing the CLI under test. No workflow SHALL inline the Tilt download or the port 5432 block. The inventory check enforces this.

#### Scenario: Tilt version bump
- **WHEN** a maintainer bumps the pinned Tilt version
- **THEN** they edit one file, `.github/actions/setup-tilt/action.yml`, instead of the 14 workflows that download Tilt today

### Requirement: The package under test is built once per run
In a pull request run, one job SHALL build and pack the CLI and upload the tarball as an artifact. The package smoke test and every selected e2e suite SHALL install that artifact rather than running `bun install` and `npm pack` again. Nightly runs test `main`'s packed build; release runs test the published npm version.

#### Scenario: Pull request selects three e2e suites
- **WHEN** a pull request selects the `agent`, `mcp` and `quickstart` suites
- **THEN** the CLI is packed once and the three legs install the same tarball

### Requirement: Expensive scheduled work never runs per push
Jobs that take more than 10 minutes or boot large fixtures (benchmarks, ERP scale, full example apps) SHALL NOT be triggered by `push`. They run nightly against the latest `main`, after a release, or by hand. A queued run that a newer scheduled run supersedes SHALL be cancelled. Reports such as Scorecard SHALL run on their schedule and by hand, not on every push.

#### Scenario: Ten merges to main in a morning
- **WHEN** ten pull requests merge to `main` in four hours
- **THEN** the benchmark runs once that night on the latest `main`, instead of ten 65-minute runs of which most are cancelled or fail

### Requirement: Red and skipped jobs are visible, not silent
A scheduled, `workflow_run` or `main` job that fails three runs in a row SHALL open or update one tracking issue naming the job, the first failing run and the last error line. The issue SHALL close after three passing runs. A job skipped on every run for 30 days SHALL be removed, or its enabling condition recorded in the inventory.

#### Scenario: Benchmark keeps timing out
- **WHEN** the benchmark's warm run times out three nights in a row
- **THEN** one issue tracks it with the first failing run linked

### Requirement: Missing secrets give a neutral result
A job that needs a secret SHALL check for it first. When the secret is not configured, the job SHALL end with a warning annotation naming the secret and a neutral result, not a failure.

#### Scenario: License secret missing
- **WHEN** `journeys / cold-start` runs after a release and `TDK_LICENSE_KEY` is not configured
- **THEN** it reports "skipped: TDK_LICENSE_KEY not configured" as a warning, and the tracking issue names the missing secret

### Requirement: Flaky jobs are tracked, not retried
No job SHALL retry a failed test or case automatically to turn it green. A case that fails and then passes on the same commit SHALL be recorded as flaky in the CI report. A suite MAY quarantine a case only with an issue link, and a quarantined case still runs nightly and reports its result.

#### Scenario: Case passes on rerun
- **WHEN** agent case A4 fails on a commit and passes on a manual rerun of the same commit
- **THEN** the weekly CI report lists A4 as flaky with both runs

### Requirement: Repository bots run only on events that change their output
Each `bot` workflow SHALL list the narrowest `types:` for its events. A bot SHALL NOT run on `synchronize` unless its output depends on the pull request's commits. Bot workflows keep separate files and the least permissions they need, and are never merged with workflows that check out pull request code.

#### Scenario: Contributor pushes a fix commit
- **WHEN** a contributor pushes to an open pull request
- **THEN** only bots whose output depends on the commits run (conflict buttons, area labels), and the welcome, hall-of-fame and review-button bots do not

### Requirement: Keeping pull requests current does not multiply CI
Keeping pull request branches up to date with `main` SHALL NOT re-run every open pull request's full CI after each merge. The repository SHALL use GitHub's merge queue, so the full e2e selection runs once on the queued merge commit (`merge_group`), or, until it is enabled, `update-pr-branches.yml` SHALL update only pull requests that are approved or have auto-merge enabled.

#### Scenario: Merge to main with 20 open pull requests
- **WHEN** a pull request merges while 20 others are open
- **THEN** CI does not start for all 20; only pull requests that are approved or queued are updated and re-tested

### Requirement: CI cost and health are measured weekly
A weekly `report` job SHALL publish, per job: run count, p50 and p90 duration, failure, cancellation and skip rates, flaky cases, and time from push to the aggregate check's result on pull requests. It SHALL flag jobs over their tier's budget: `gate` p90 under 3 minutes, `test` p90 under 10 minutes, a pull request's aggregate check under 25 minutes at p90 when e2e suites are selected, and under 10 minutes when none are.

#### Scenario: A gate job slows down
- **WHEN** the lint job's p90 rises from 1 to 4 minutes over a week
- **THEN** the report flags it as over the `gate` budget
