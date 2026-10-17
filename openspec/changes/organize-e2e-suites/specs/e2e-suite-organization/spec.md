## Purpose

Defines where TDK's end-to-end suites live, which group each belongs to, the shape every live-stack suite follows, and how CI runs each group.

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

### Requirement: Suites reuse a shared helper library
Helpers for polling, running commands with exit code and elapsed time, JSON envelope assertions, MCP stdio calls, HTTP stubs, Traefik requests and diagnostics SHALL live in `tests/e2e/lib/`. A suite SHALL NOT keep its own copy of a helper that exists there.

#### Scenario: New suite needs polling
- **WHEN** a new suite waits for a resource to become ready
- **THEN** it sources the shared polling helper rather than defining its own

### Requirement: One workflow per group
CI SHALL run each group from one workflow named `e2e-<group>.yml`, with the group's suites as a matrix. Each suite SHALL declare the paths that trigger it on pull requests. Every group SHALL also run nightly and after each successful release, except groups marked manual or weekly because of cost. Each workflow SHALL have a job that always runs and reports the combined result, so a path-filtered required check is never left pending. Failure artifacts SHALL be uploaded for every failed suite.

#### Scenario: Pull request touches the MCP server
- **WHEN** a pull request changes `cli/src/mcp/**`
- **THEN** the `mcp` and `agent` suites run, and other resource-type suites are skipped while the gate job still reports a result

#### Scenario: Release published
- **WHEN** the release workflow completes successfully
- **THEN** every non-manual group runs against the published package

### Requirement: Migration keeps coverage and check names working
Moving an existing test into a group SHALL keep every assertion it made before. Until branch protection is updated, the check names that are currently required SHALL still be reported.

#### Scenario: Required check renamed
- **WHEN** `example-e2e` moves into `e2e-examples.yml`
- **THEN** a check named `example-e2e` is still reported until the maintainers switch branch protection to the new name
