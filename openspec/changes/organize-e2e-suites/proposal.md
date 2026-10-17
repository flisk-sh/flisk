## Why

TDK's end-to-end tests grew one at a time and now live in five places with no shared shape: 13 workflows in `.github/workflows/` (`example-e2e` and `examples-e2e` test different things), `scripts/e2e/`, `scripts/verify-*.sh`, `tests/e2e/`, and `*-e2e.test.ts` files inside the CLI unit suite. A contributor adding a feature cannot tell where its e2e belongs, what it must check, or whether one is expected at all. Coverage has gaps nobody chose: six of the seven `scripts/verify-*.sh` scripts (MCP, frontend frameworks, four bring-your-own variants) never run in CI, `make test-shell` only syntax-checks them, and the `worker`, `migrator`, `library` and `sdk` resource types have no live-stack test. The agent e2e from #1268 ([PR #1272](https://github.com/tdk-landscape/tdk-cli-core/pull/1272)) is the first suite built to a deliberate pattern: one named function per case, bounded polling instead of sleeps, one JSON envelope per failure, failure artifacts, and a run proven against a real stack. It is the model to organize the rest around.

## What Changes

- Group every e2e into one of six suites by what it proves: **resource types**, **journeys**, **examples**, **platforms**, **scale and performance**, and **CLI integration** (stackless). Each live-stack suite lives under `tests/e2e/<group>/<suite>/` with a `run.sh` that follows the agent-suite pattern.
- Add a shared helper library at `tests/e2e/lib/` (bounded polling, command runner with exit codes and timing, JSON envelope assertions, an MCP stdio client, HTTP stubs, a Traefik request helper, diagnostics collection), extracted from `scripts/agent-e2e/` so new suites do not copy it.
- Require one live-stack suite per resource type in `VALID_RESOURCE_TYPES` (`backend`, `frontend`, `worker`, `migrator`, `mcp`, `agent`, `library`, `sdk`, `bring-your-own`). A check fails when a type has no suite, unless the type is on a short, issue-linked allowlist.
- Bring the six unrun `verify-*.sh` scripts into suites that run in CI, and add the missing `worker`, `migrator`, `library` and `sdk` suites (or allowlist entries that link a tracking issue).
- Replace the per-test workflows with one workflow per group (`e2e-<group>.yml`) that runs its suites as a matrix with per-suite path filters, a nightly run, a run after each release, and an always-running gate job so a required check is never left pending.
- Move the agent suite from `scripts/agent-e2e.sh` to `tests/e2e/resource-types/agent/` as the reference suite.
- Add a contributor guide, `docs/contributing/05-write-e2e.md`, covering when an e2e is required, which group it belongs to, how to write one, and how to prove it can fail. It walks through the agent suite as the worked example.
- Add a repository skill, `tdk-e2e-author`, that guides an AI assistant through the same steps. It is linked from `.agents/skills`, and `scripts/sync-tdk-skills.sh` keeps repo-local skills instead of deleting them.
- **BREAKING (CI only):** workflow file names and some check names change. Branch protection's required checks must be updated in the same release, and old names keep working until then (see design.md).

## Capabilities

### New Capabilities
- `e2e-suite-organization`: where e2e suites live, how they are grouped and named, the shape every live-stack suite follows, the shared helper library, and how CI runs each group.
- `e2e-resource-type-coverage`: every resource type has a live-stack suite with a common set of cases, enforced by a check, with an allowlist for justified exceptions.
- `e2e-contributor-guide`: the contributor documentation and the repository skill for writing e2e tests, using the agent suite as the worked example.

### Modified Capabilities
None. No e2e behavior is specified in `openspec/specs` today. `agent-e2e-ci` (#1268) is an open change that this one depends on and does not alter.

## Impact

- **Moved:** `scripts/agent-e2e.sh` and `scripts/agent-e2e/*`, `scripts/e2e/*`, `scripts/verify-*.sh`, `tests/e2e/*.test.sh` and fixtures, and the stack-booting `cli/src/commands/__tests__/*-e2e.test.ts` files where they boot a stack.
- **Replaced:** `.github/workflows/{byo-e2e,byo-boot-e2e,cold-start-e2e,erp-scale-e2e,example-e2e,examples-e2e,go-dev-loop-e2e,python-example-e2e,quickstart-e2e,smoke-e2e,windows-smoke,wsl2-smoke,agent-e2e}.yml`, plus `benchmarks.yml` folded into the scale group.
- **New:** `tests/e2e/lib/`, `tests/e2e/<group>/<suite>/run.sh`, `e2e-<group>.yml` workflows, `docs/contributing/05-write-e2e.md`, `.claude/skills/tdk-e2e-author/`, and a coverage check.
- **Changed:** `Makefile` (`make test-e2e GROUP=… SUITE=…`), `CONTRIBUTING.md` (Tests section links the guide), `docs/contributing/02-feature-recipes.md` (each recipe names its e2e), `scripts/sync-tdk-skills.sh` (keeps repo-local skills).
- **Admin:** branch protection's required checks (maintainer action).
- **Depends on:** [PR #1272](https://github.com/tdk-landscape/tdk-cli-core/pull/1272) landing first, since the agent suite is the reference.
