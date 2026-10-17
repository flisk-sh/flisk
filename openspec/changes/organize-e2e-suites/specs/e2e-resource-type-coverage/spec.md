## Purpose

Makes sure every TDK resource type is exercised on a real stack, with a common set of cases, so a new type or a type-specific regression cannot ship untested.

## ADDED Requirements

### Requirement: Every resource type has a live-stack suite
For each type in the CLI's list of valid resource types, a suite SHALL exist at `tests/e2e/resource-types/<type>/`. A check that runs on every pull request SHALL fail when a type has no suite and is not on the allowlist.

#### Scenario: New resource type added without a suite
- **WHEN** a pull request adds a type to the valid resource types and adds no suite for it
- **THEN** the coverage check fails and names the type

#### Scenario: All types covered
- **WHEN** every type has a suite or an allowlist entry
- **THEN** the coverage check passes

### Requirement: Exceptions are explicit and tracked
A type MAY be listed on an allowlist only with a reason and a link to an open issue that tracks adding its suite. The coverage check SHALL fail when an allowlist entry has no issue link, or when the listed type already has a suite.

#### Scenario: Allowlisted type gets a suite
- **WHEN** a suite is added for a type that is still on the allowlist
- **THEN** the coverage check fails until the allowlist entry is removed

### Requirement: Resource-type suites cover a common set of cases
Each resource-type suite SHALL cover scaffolding with `tdk resource`, a bounded wait in `tdk status --json`, the type's observable contract, `tdk restart` with a wait for the replaced container, and at least one error path asserting a single JSON envelope. A case that does not apply SHALL be listed as not applicable with the reason.

#### Scenario: Observable contract per type
- **WHEN** the suite checks the type's contract
- **THEN** routable types answer a routed health check, migrators complete a run, and libraries and SDKs produce a build another resource consumes

#### Scenario: Worker suite
- **WHEN** the `worker` suite runs
- **THEN** it scaffolds a worker, waits for it in `tdk status --json`, proves the worker processed a job, restarts it, and asserts one error envelope

#### Scenario: Case not applicable
- **WHEN** a type has no HTTP route, such as `migrator`
- **THEN** the suite lists the routed health case as not applicable and checks the migration's completion instead

### Requirement: Resource-type suites run as one matrix keyed by appType
`e2e-resource-types.yml` SHALL define one job, parameterized by `appType`, and run it as a matrix whose values are the selected resource types. Adding a resource type SHALL add a matrix value and a folder, not a workflow or a job. Stackless CLI checks are not a leg: they stay in `cli-integration`.

#### Scenario: New resource type
- **WHEN** a contributor adds `appType: queue` with a `tests/e2e/resource-types/queue/` folder holding a contract case and `suite.json`
- **THEN** the matrix picks it up from `suite.json`, the common cases run for it unchanged, and no YAML is edited

#### Scenario: Pull request touches one type
- **WHEN** a pull request changes only the worker scaffold
- **THEN** the matrix has one leg, `worker`, and the other types are skipped while the group gate reports

### Requirement: Common cases are written once
The cases every type shares (scaffold, bounded status wait, restart with a wait for the replaced container, one error envelope) SHALL live in `tests/e2e/resource-types/common.sh`, driven by `appType`. A type's folder SHALL hold only its contract cases and its `suite.json`. A `frontend` leg MAY add one more axis for framework groups.

#### Scenario: Worker leg
- **WHEN** the `worker` leg runs
- **THEN** the common cases run from `common.sh` with `appType=worker`, then the worker's own case proves a job was processed

### Requirement: Matrix legs share setup and can share one stack
Every leg SHALL install the CLI tarball packed once for the run and use the composite setup actions. Nightly and release runs SHALL add one combined leg: one project with a resource of each compatible type, one `tdk up`, then each type's contract cases. Pull requests run isolated legs only, so a failure points at one type.

#### Scenario: Nightly run
- **WHEN** the nightly run starts the resource-types group
- **THEN** it runs one isolated leg per type and one combined leg that boots every compatible type in one stack

#### Scenario: Combined leg fails but isolated legs pass
- **WHEN** the combined leg fails on the `mcp` contract case while the isolated `mcp` leg passes
- **THEN** the failure is reported as an interaction between types, with the combined stack's diagnostics attached
