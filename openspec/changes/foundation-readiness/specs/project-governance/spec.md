# Spec Delta

## Purpose

Record who maintains tdk-cli-core, how maintainers are added, and which external users count as adopters.

## ADDED Requirements

### Requirement: Maintainer table

The repo SHALL contain MAINTAINERS.md with a table whose columns are Name, GitHub id, and Company. Each row SHALL be a person with merge rights. The file SHALL NOT contain a row whose Company is unknown, "TBD", or the GitHub organization name.

#### Scenario: Current single-employer state

- **WHEN** MAINTAINERS.md is read and only one company is listed
- **THEN** the file still lists that company and does not add a second company to fill the table

#### Scenario: Rejected placeholder

- **WHEN** a row uses Company "TBD" or "tdk-landscape"
- **THEN** review rejects the row

### Requirement: Maintainer lifecycle

GOVERNANCE.md SHALL state how a person becomes a maintainer, how they are removed, and that a foundation application requires 3 maintainers from 2 employers. Decisions SHALL be recorded in a pull request or an issue.

#### Scenario: Second employer joins

- **WHEN** a contributor from a different employer is granted merge rights
- **THEN** MAINTAINERS.md gains a row with that employer before any foundation application is filed

### Requirement: Adopter evidence

ADOPTERS.md SHALL list only teams that run flisk up on their own repositories. The 100-service health fixture SHALL NOT be an adopter row.

#### Scenario: Fixture is offered as an adopter

- **WHEN** a proposed row cites tdk-erp-system or benchmarks/results
- **THEN** the row is rejected

#### Scenario: Real adopter

- **WHEN** a row has an organization, a public link, and a Flisk version
- **THEN** the row may be added
