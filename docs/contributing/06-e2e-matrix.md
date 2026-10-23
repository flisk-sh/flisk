# 6. Run e2e suites in a matrix

Live-stack tests run as a GitHub Actions matrix. Each suite is one leg, and each leg boots its own stack. Legs run in parallel, so a new suite adds a leg without making the others wait. This page explains how the matrix is built, how to add a suite to it, and how to add a new group of suites in the same way. It is the model for every e2e item in the [test-quality initiative](https://github.com/flisk-sh/flisk/issues/1388).

The worked example is the `resource-types` group, which runs from [`e2e-resource-types.yml`](../../.github/workflows/e2e-resource-types.yml). Read [write an e2e test](05-write-e2e.md) first for how a suite's `run.sh` is written.

## The three pieces

```text
tests/e2e/<group>/<suite>/suite.json   one file per suite: what it is, when it runs, its timeout
tests/e2e/lib/suite-matrix.mjs         reads every suite.json in a group and prints the matrix
.github/workflows/<group>-e2e.yml      a plan job (runs the builder) and a matrix job (one leg per entry)
```

Nothing in the workflow lists suites by name. Adding a folder with a `suite.json` adds a leg, once its `triggers` include the event.

The `platforms` group is the exception: its workflows name their cases step by step, because a platform suite checks a host environment rather than a stack. [`platforms/windows-hardware`](../../tests/e2e/platforms/windows-hardware/) runs on `windows-latest` as a reference and on a self-hosted Windows 11 machine when a maintainer dispatches the workflow; it is the one suite that needs a machine of its own. [`platforms/wsl2`](../../tests/e2e/platforms/wsl2/) runs its cases in an Ubuntu 24.04 distro under WSL2 on a Windows runner, dispatched by hand; its `WS6` case runs the one-command demo flow and confirms that every service the demo started answers.

## The plan job, then the matrix

The workflow has two jobs that matter:

1. **`plan`** picks the trigger from the event (`pr`, `nightly`, `release`, `manual`), reads the axes, and prints the matrix as JSON to `$GITHUB_OUTPUT`.
2. **The group job** uses `strategy.matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}`, with `fail-fast: false`, a `max-parallel` cap, and `timeout-minutes: ${{ matrix.timeoutMinutes }}`.

A group job is skipped when the matrix is empty (`{"include":[]}`), so a trigger that selects no suite costs nothing.

```bash
node tests/e2e/lib/suite-matrix.mjs resource-types,orm pr "bun,python,rust,go"
# {"include":[{"group":"languages","dir":"resource-types/backend","suite":"backend","language":"bun","label":"bun",...}, {"group":"orm","dir":"orm/prisma","label":"prisma",...}, ...]}
```

Each leg names its `group`, which is the first half of its job name, and its `dir`, the folder `run.sh` lives in (`<group>/<suite>`). The backend suite's language legs run in the `languages` group, and the ORM suites in the `orm` group (`tests/e2e/orm/<suite>/`), so each reads under its own name (#1493). The `languages` group has no folder of its own; it is the language axis over `resource-types/backend`.

## How a suite becomes legs

`suite.json` holds the fields the builder and the workflow read:

```json
{
  "group": "resource-types",
  "suite": "backend",
  "description": "What this suite proves, in one sentence.",
  "paths": ["cli/src/backend-languages/**", "tests/e2e/resource-types/backend/**"],
  "cases": ["B1", "B2", "B3"],
  "triggers": ["pr", "nightly", "release", "manual"],
  "timeoutMinutes": 25,
  "needsSecrets": []
}
```

The builder expands a suite into legs in one of four ways:

| Shape | Example | Legs |
|---|---|---|
| one leg | `agent` | one, labelled with the suite name |
| one per axis value | `backend` | one per language from `registry-axes.mjs` |
| one per axis value, with a default | `backend` bun | one more bun leg per non-default HTTP framework |
| one per variant | `bring-your-own` | one leg per `variants` entry in `suite.json`, with `BYO_VARIANT` set to its id |

A suite lists `"variants": [{"id": "..."}]` in `suite.json` instead of a single leg; `bring-your-own` does this. `validate-suites.mjs` rejects keys it does not know, so check spelling.

Each leg gets its axis values as environment (`LANGUAGE`, `FRAMEWORK`, and `BYO_VARIANT` for variant suites), so the suite's `run.sh` reads what it needs and nothing else. A leg's job name in the UI is `<group> / <label>` (`languages / bun`, `orm / prisma`, `resource-types / agent`), so that is what reviewers search for.

## Triggers decide what runs where

| Trigger | When | What the matrix covers |
|---|---|---|
| `pr` | pull requests that touch the workflow's `pull_request.paths` filter | the fast set: the two most used languages, no extra frameworks |
| `nightly` | the scheduled run; installs `latest` from npm | every axis value the registry declares |
| `release` | after a release is published (`workflow_run`); installs the version just published | the same as nightly |
| `manual` | `workflow_dispatch`; installs the `version` input (default `latest`) | the same as nightly |

The validator also accepts a `weekly` trigger, but no group workflow runs it yet, so do not rely on it. A suite that needs secrets cannot have `pr`, because pull requests from forks get none. A `scale` suite cannot have `pr` either. These are checked by `tests/e2e/lib/validate-suites.mjs` in `make test-shell`.

### Missing secrets and red jobs

A job that needs a secret starts with a check step or job. When the secret is missing, the check writes a warning that names the secret and a job summary, and the jobs that need it are skipped. GitHub has no neutral job conclusion, so a skipped job is the neutral result, and the check itself succeeds. Current examples: `TDK_LICENSE_KEY` in `e2e-journeys.yml`, `NPM_TOKEN` in `publish-tdk-import.yml`, and `CI_INVENTORY_TOKEN` in `required-checks-drift.yml`. A release job that publishes to npm (`release-binaries.yml`) does not skip: a missing token there fails the run, because a skipped release would look like a success.

`red-job-tracker.yml` runs daily. For each scheduled or `main` workflow in its `TRACKED` list it opens one issue when the last three runs on `main` failed, with the first failing run and the last error line. It updates that issue while the job stays red and closes it after three passing runs. To add a workflow, add its file name to `TRACKED` in `scripts/red-job-tracker.mjs`.

## Add a suite to an existing group

> **Two sources of truth.** `suite.json` `paths` is validated but not read by the builder or the workflow. The workflow's `pull_request.paths` filter decides which pull requests run a suite. When you add a suite or change what it covers, update both. `node tests/e2e/lib/validate-suites.mjs` (run by `make test-shell`) fails when a suite's `paths` are not covered by its workflow's `pull_request.paths`, or when the filter lists a path no suite owns (#1391).

1. Create `tests/e2e/<group>/<suite>/` with `run.sh` (executable) and `suite.json`. Copy the shape of [`resource-types/backend`](../../tests/e2e/resource-types/backend/suite.json).
2. Add the code it covers to the workflow's `pull_request.paths` filter. The check in `validate-suites.mjs` fails until the filter covers every `paths` entry of a suite that runs on `pr`.
3. Choose `triggers`. Start with `["pr", "nightly", "release", "manual"]` only if the suite is fast; otherwise use `["nightly", "release", "manual"]`.
4. Run `make test-shell`. `validate-suites.mjs` checks the folder, the keys, and that each listed case exists.
5. Run the builder locally to see the legs it will produce (the command above).

No workflow edit is needed when the group workflow already exists.

## Add a new group in the same shape

Use this when a new family of tests (for example `packaging` or `failure-recovery`) needs its own parallel run.

1. Create `tests/e2e/<group>/` and one folder per suite, as above. Use the group name the table in [write an e2e test](05-write-e2e.md#pick-the-group) gives, or add a row there in the same change.
2. Copy `.github/workflows/e2e-resource-types.yml` to `.github/workflows/<group>-e2e.yml`. Change the name, the `paths` filter, the `concurrency` group, and the `suite-matrix.mjs` group argument in the `plan` job. Keep the `plan` job, `fail-fast: false`, and the `gate` job.
3. Add a `gate` job that always runs and fails when the plan or any leg failed. This is the one check to make required in branch protection, so a skipped matrix cannot pass unnoticed.
4. Set `max-parallel` to a number the runner pool can handle (the resource-types group uses 4).
5. Upload failure evidence from each leg with the same `if: failure()` step that `e2e-resource-types.yml` uses.

## The group gates and the CI summary

Three group gates report on every pull request: `e2e-journeys`, `e2e-examples` and `e2e-platforms`. They live in their own workflows, so the `📋 Summary` job of `ci.yml` cannot wait for them with `needs:`. It reads their check runs on the head commit instead, and fails when a gate is missing or did not pass. `📋 Summary` is a required check, so it is what holds a merge back.

A gate only reports when its workflow is triggered, so the summary waits only for the gates that report for the event the CI workflow ran for:

| CI event | Gates the summary waits for |
|---|---|
| `pull_request` | `e2e-journeys`, `e2e-examples`, `e2e-platforms` |
| `merge_group` | `e2e-journeys`, `e2e-examples`, `e2e-platforms` |
| `push` to main | `e2e-journeys` |
| `workflow_dispatch` | none: dispatching `ci.yml` starts no gate workflow |

The list lives in `scripts/e2e-gate-expectations.mjs`, the wait in `scripts/wait-for-e2e-gates.mjs`, and `scripts/e2e-gate-expectations.test.mjs` fails when a gate is waited for on an event its workflow cannot report for. Without that rule a push to main waits half an hour for `e2e-examples` and `e2e-platforms`, which never run there, and then fails. A gate that has not reported yet also fails early when its workflow never started for the commit, instead of waiting for the deadline.

## Rules for matrix legs

- **Each leg is independent.** It boots its own stack, uses its own scratch project name, and cleans up in `e2e_cleanup`. Two legs must never share a port or a container name.
- **Use `fail-fast: false`.** One broken language should not hide the result of the others.
- **Cap parallelism.** Set `max-parallel`. Docker and Tilt legs are heavy, and an uncapped matrix can starve the runner.
- **Set `timeout-minutes` per suite,** from `suite.json`, not in the workflow.
- **Retry only infrastructure steps** (image pulls, package installs). Never retry a step that asserts behaviour. See [write an e2e test](05-write-e2e.md) for the case rules.
- **Keep the `pr` set small.** Put every other axis value on `nightly`, `release` and `manual`. A pull request should get feedback in minutes.
- **Failure evidence is part of the leg.** The group workflow runs `run.sh diagnostics` and uploads `tdk-e2e/<suite>/artifacts` with an `if: failure()` step, named `e2e-resource-types-<label>-<run_id>` and kept 14 days. A new group copies that step.

## Checking the matrix locally

```bash
node tests/e2e/lib/suite-matrix.mjs resource-types nightly "bun,python,go" "hono,fastify" "react,vue"
node --test tests/e2e/lib/__tests__/suite-matrix.test.mjs
```

The first command prints the legs for a trigger and axis values. The second checks the builder's own tests.
