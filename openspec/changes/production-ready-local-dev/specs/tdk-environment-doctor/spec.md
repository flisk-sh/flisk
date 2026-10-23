# Spec Delta

## Purpose

Lock the existing `flisk doctor` contract. Do not replace its JSON shape or outcome lines.

## ADDED Requirements

### Requirement: Doctor human outcome lines stay stable
`flisk doctor` SHALL remain the readiness command. A passing in-project run SHALL end with `Doctor passed. Next: flisk up`. A failing run SHALL end with `Doctor failed. Fix the items above, then run: flisk doctor`. A repeated run on an unchanged machine and project SHALL exit with the same code.

#### Scenario: Doctor passes in a project
- **WHEN** required checks pass inside a project
- **THEN** output includes `Doctor passed. Next: flisk up` and the process exits 0

#### Scenario: Doctor fails
- **WHEN** a required check fails
- **THEN** output includes the fix and `Doctor failed. Fix the items above, then run: flisk doctor`, and the process exits 1

### Requirement: Doctor JSON envelope stays version 1
`flisk doctor --json` SHALL print one object with `schemaVersion` 1, `data.ready`, `data.inProject`, `data.checks`, and `errors`. It SHALL NOT flatten `ready` to the top level. It SHALL NOT include ANSI codes. `--json` SHALL NOT change which checks run. Secret values SHALL be redacted.

#### Scenario: JSON ready report
- **WHEN** doctor is ready and `--json` is set
- **THEN** stdout is valid JSON with `schemaVersion` 1 and `data.ready` true, and the process exits 0

#### Scenario: JSON blocking report
- **WHEN** a required check fails and `--json` is set
- **THEN** `data.ready` is false, `errors` is empty, and the process exits 1

#### Scenario: JSON internal failure
- **WHEN** a doctor check throws
- **THEN** `errors` contains an `INTERNAL` entry and the process exits 2

## MODIFIED Requirements

### Requirement: Doctor checks and ranks environment blockers
`flisk doctor` SHALL check whether Docker is running, whether Docker uses Linux containers, whether Tilt meets the documented minimum version, and whether Bun meets the documented minimum when the stack requires Bun. It SHALL check whether ports 80, 443, and 5432 are bound, identify WSL projects under `/mnt/c`, and identify unsupported native Windows execution. It SHALL also check Flisk version, `service.json` validity, generated-config drift via the same result as `flisk config verify`, required directory permissions, and required non-secret environment variable names. It SHALL order remediation guidance before status summaries and SHALL exit 1 if any required check fails. Port conflicts SHALL appear before lower-priority failures in the first failure block. Warnings SHALL NOT change a ready result to exit 1.

#### Scenario: Required database port is already bound
- **WHEN** port 5432 is bound while doctor reports other environment results
- **THEN** the first failure block identifies port 5432, gives a fix, and doctor exits 1

#### Scenario: Required tool is missing or too old
- **WHEN** Tilt is missing or below its documented floor, or required Bun is missing or below its floor
- **THEN** doctor reports the requirement and an actionable fix, and exits 1

#### Scenario: Docker cannot run the landscape
- **WHEN** the daemon is down or Docker is using Windows containers
- **THEN** doctor reports the corresponding fix before status summaries and exits 1

#### Scenario: Generated files are stale
- **WHEN** generated files differ from `service.json`
- **THEN** doctor names the same drifted paths as `flisk config verify`, tells the user to run `flisk config regenerate`, and exits 1
