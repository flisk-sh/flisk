# 6. Run e2e suites in a matrix

Live-stack tests run as a GitHub Actions matrix. Each suite is one leg, and each leg boots its own stack. Legs run in parallel, so a new suite adds a leg without making the others wait. This page explains how the matrix is built, how to add a suite to it, and how to add a new group of suites in the same way. It is the model for every e2e item in the [test-quality initiative](https://github.com/tdk-landscape/tdk-cli-core/issues/1388).

The worked example is the `resource-types` group, which runs from [`e2e-resource-types.yml`](../../.github/workflows/e2e-resource-types.yml). Read [write an e2e test](05-write-e2e.md) first for how a suite's `run.sh` is written.

## The three pieces

```text
tests/e2e/<group>/<suite>/suite.json   one file per suite: what it is, when it runs, its timeout
tests/e2e/lib/suite-matrix.mjs         reads every suite.json in a group and prints the matrix
.github/workflows/<group>-e2e.yml      a plan job (runs the builder) and a matrix job (one leg per entry)
```

Nothing in the workflow lists suites by name. Adding a folder with a `suite.json` adds a leg, once its `triggers` include the event.

## The plan job, then the matrix

The workflow has two jobs that matter:

1. **`plan`** picks the trigger from the event (`pr`, `nightly`, `release`, `manual`), reads the axes, and prints the matrix as JSON to `$GITHUB_OUTPUT`.
2. **The group job** uses `strategy.matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}`, with `fail-fast: false`, a `max-parallel` cap, and `timeout-minutes: ${{ matrix.timeoutMinutes }}`.

A group job is skipped when the matrix is empty (`{"include":[]}`), so a trigger that selects no suite costs nothing.

```bash
node tests/e2e/lib/suite-matrix.mjs resource-types pr "bun,python,rust,go"
# {"include":[{"suite":"backend","language":"bun","framework":"","label":"backend-bun",...}, ...]}
```

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

Each leg gets its axis values as environment (`LANGUAGE`, `FRAMEWORK`, and `BYO_VARIANT` for variant suites), so the suite's `run.sh` reads what it needs and nothing else. A leg's `label` names the job in the UI (`resource-types / backend-bun`), so it is what reviewers search for.

## Triggers decide what runs where

| Trigger | When | What the matrix covers |
|---|---|---|
| `pr` | pull requests that touch the workflow's `pull_request.paths` filter | the fast set: the two most used languages, no extra frameworks |
| `nightly` | the scheduled run; installs `latest` from npm | every axis value the registry declares |
| `release` | after a release is published (`workflow_run`); installs the version just published | the same as nightly |
| `manual` | `workflow_dispatch`; installs the `version` input (default `latest`) | the same as nightly |

The validator also accepts a `weekly` trigger, but no group workflow runs it yet, so do not rely on it. A suite that needs secrets cannot have `pr`, because pull requests from forks get none. A `scale` suite cannot have `pr` either. These are checked by `tests/e2e/lib/validate-suites.mjs` in `make test-shell`.

## Add a suite to an existing group

> **Two sources of truth.** `suite.json` `paths` is validated but not read by the builder or the workflow. The workflow's `pull_request.paths` filter decides which pull requests run a suite. When you add a suite or change what it covers, update both, and check that they agree. A drift check that fails CI is not in place yet; it is a follow-up.

1. Create `tests/e2e/<group>/<suite>/` with `run.sh` (executable) and `suite.json`. Copy the shape of [`resource-types/backend`](../../tests/e2e/resource-types/backend/suite.json).
2. Add the code it covers to the workflow's `pull_request.paths` filter. The `paths` in `suite.json` are validated but nothing reads them yet, so keep the two lists in sync by hand.
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
