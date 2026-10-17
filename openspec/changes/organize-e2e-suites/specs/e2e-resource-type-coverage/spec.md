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
