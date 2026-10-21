## Purpose

Defines where Flisk's end-to-end suites live, which group each belongs to, the shape every live-stack suite follows, and how CI runs each group.

## ADDED Requirements

### Requirement: Every e2e suite belongs to exactly one group
Each end-to-end suite SHALL belong to exactly one group: `resource-types`, `journeys`, `examples`, `platforms`, `scale` or `cli-integration`. A live-stack suite SHALL live at `tests/e2e/<group>/<suite>/`.

#### Scenario: Locating a suite
- **WHEN** a contributor looks for the end-to-end test of the `mcp` resource type
- **THEN** it is at `tests/e2e/resource-types/mcp/` and nowhere else

#### Scenario: Choosing a group
- **WHEN** a test covers one resource type, a multi-command user flow (quickstart, smoke runner, dev loop, cold start), a real example app, a host environment (Windows, WSL2, Dev Containers), or a large-fixture boot or benchmark
- **THEN** it belongs to `resource-types`, `journeys`, `examples`, `platforms` or `scale` respectively

#### Scenario: Stackless CLI tests stay in the unit runner
- **WHEN** a test spawns the CLI against a temporary project but starts no Tilt or Docker stack
- **THEN** it belongs to `cli-integration` and runs in the existing CLI test runner, not in an e2e workflow

### Requirement: Live-stack suites share one shape
Every live-stack suite SHALL provide a `run.sh` that takes case ids as arguments and also supports `list`, `diagnostics` and `cleanup`. Each case SHALL be one named function that a CI step can run alone. Suites SHALL wait only by bounded polling that fails with a description of what it waited for. They SHALL NOT use fixed sleeps. A JSON failure case SHALL assert that stdout holds exactly one parseable envelope and nothing else.

#### Scenario: Running one case
- **WHEN** a contributor runs `tests/e2e/resource-types/agent/run.sh A4`
- **THEN** only case A4 runs and the command exits non-zero if it fails

#### Scenario: A wait runs out
- **WHEN** a polled condition is not met before its deadline
- **THEN** the case fails with the waited-for description and prints recent stack logs and container state

### Requirement: Each case sets up its own preconditions
A case SHALL NOT rely on the state an earlier case left behind. When it needs a running resource, data or a stopped container, it SHALL check for that state and create it. A request whose result a later assertion depends on SHALL fail the case when it does not succeed, rather than passing its error body on.

#### Scenario: Error-path case stopped the resource earlier
- **WHEN** a durability case runs after an error-path case that stopped the agent container
- **THEN** the durability case brings the agent back before writing its checkpoint, and fails on the write itself if the write is rejected

### Requirement: Suites reuse a shared helper library
Helpers for polling, running commands with exit code and elapsed time, JSON envelope assertions, MCP stdio calls, HTTP stubs, Traefik requests and diagnostics SHALL live in `tests/e2e/lib/`. A suite SHALL NOT keep its own copy of a helper that exists there.

#### Scenario: New suite needs polling
- **WHEN** a new suite waits for a resource to become ready
- **THEN** it sources the shared polling helper rather than defining its own

### Requirement: One workflow per group
Each group SHALL have one reusable workflow, `e2e-<group>.yml`, that runs its suites as a matrix. `ci.yml` SHALL call it on pull requests with the selected suites and the packed CLI. It SHALL also have its own schedule, after-release and manual triggers, which select every suite unless the group is marked manual or weekly. A gate job SHALL always run and report the group's result, and failed suites SHALL upload artifacts.

#### Scenario: Pull request touches the MCP server
- **WHEN** a pull request changes `cli/src/mcp/**`
- **THEN** the `mcp` and `agent` suites run, and other resource-type suites are skipped while the gate job still reports a result

#### Scenario: Release published
- **WHEN** the release workflow completes successfully
- **THEN** every non-manual group runs against the published package

#### Scenario: Suite needs a secret that is not configured
- **WHEN** a suite with `needsSecrets` runs and the secret is absent
- **THEN** it ends with a warning that names the secret and a neutral result, as `ci-pipeline-efficiency` requires, rather than failing

### Requirement: Variants are matrix axes, not workflows
Every group, not only resource types, SHALL run tests that share steps as one job with a matrix axis per kind of variant. The kinds are listed in `tests/e2e/axes.json` with their source of truth. Adding a variant SHALL add a matrix value, never a new workflow or job.

#### Scenario: New backend language
- **WHEN** a pull request adds `node` to the backend language registry, as #1276 does
- **THEN** the `backend` leg gains a `node` value and no workflow file changes

#### Scenario: Existing per-variant workflows
- **WHEN** the `examples` group is migrated
- **THEN** `python-example-e2e.yml`, `example-e2e.yml` and `examples-e2e.yml` become values of one `example` axis, and `go-dev-loop-e2e.yml` becomes the `go` value of the dev-loop journey's language axis

### Requirement: The axis catalog names every kind of variant
`tests/e2e/axes.json` SHALL list each axis with its values' source and the groups that use it. At minimum: `appType`, backend `language`, backend `httpFramework`, `frontendFramework`, `agentRuntime`, `agentDurability`, resource `feature`, `infraService`, `byoVariant`, `example`, `platform`, `installChannel` and `journey`. A check SHALL fail when a value in a source has no leg and no allowlist entry with an issue link.

#### Scenario: New infra service
- **WHEN** a pull request adds `nats` to `OPTIONAL_INFRA_SERVICES`
- **THEN** the `infraService` axis gains `nats` and the coverage check fails until a contract case or an allowlist entry exists

#### Scenario: New platform
- **WHEN** maintainers add macOS runners
- **THEN** `macos` becomes a value of the `platform` axis in `e2e-platforms`, not a new workflow

### Requirement: Axes are not crossed blindly
A leg SHALL vary one axis at a time, with every other axis at its default. Combinations of two axes SHALL run only when listed as known interactions (matrix `include` entries) in `axes.json`, each with a reason. Pull request runs SHALL use only the changed values. Nightly runs SHALL use every value of every axis plus the listed interactions, and never the full product of all axes.

#### Scenario: Frontend framework change
- **WHEN** a pull request changes `cli/src/frontend-frameworks/svelte.ts`
- **THEN** one leg runs, `frontend` with `frontendFramework=svelte`, with the default backend language and platform

#### Scenario: Known interaction
- **WHEN** `axes.json` lists `language=python` × `feature=prisma` as an interaction because of the Prisma client's runtime
- **THEN** that combination runs nightly and when either value's files change, and other language and feature pairs do not

### Requirement: Matrix axes are generated from the CLI's registries
Each axis that has a source of truth in the CLI SHALL be generated from it at run time: resource types from `VALID_RESOURCE_TYPES`, backend languages from `cli/src/backend-languages/registry.ts`, and frontend frameworks from `cli/src/frontend-frameworks/`. A check on every pull request SHALL fail when a registry entry has no matrix value and no allowlist entry with an issue link.

#### Scenario: Language added without e2e support
- **WHEN** a language is registered but its contract case cannot run yet
- **THEN** the coverage check fails until the language gets an allowlist entry that links a tracking issue

#### Scenario: Pull request touches one language
- **WHEN** a pull request changes only `cli/src/backend-languages/go.ts`
- **THEN** the `backend` leg runs for `go` only, and the other languages are skipped while the gate reports

### Requirement: Matrix legs stay small and comparable
Each matrix leg SHALL run the same case list with the variant as a parameter. A variant SHALL add its own cases only in its own folder. The matrix SHALL set `fail-fast: false`, so one red variant does not hide the others, and `max-parallel`, so a group stays within the shared job limit.

#### Scenario: One language breaks
- **WHEN** the `rust` leg fails
- **THEN** the `bun`, `python`, `go` and `node` legs still finish and report, and the group gate names `rust`

### Requirement: Migration keeps coverage and check names working
Moving an existing test into a group SHALL keep every assertion it made before. Until branch protection is updated, the check names that are currently required SHALL still be reported.

#### Scenario: Required check renamed
- **WHEN** `example-e2e` moves into `e2e-examples.yml`
- **THEN** a check named `example-e2e` is still reported until the maintainers switch branch protection to the new name
