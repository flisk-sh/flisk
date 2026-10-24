## ADDED Requirements

### Requirement: Starting a stack requires the local runtime

`flisk up` MUST run the full runtime preflight before it starts anything, and MUST exit with code 1 when the local runtime is not ready. The failure report MUST keep its ranked order and MUST include the actionable fix of every failed machine check.

#### Scenario: Docker is stopped when the stack is started

- **WHEN** a user runs `flisk up` while the Docker daemon is stopped
- **THEN** the CLI prints the ranked machine failures, including the Docker runtime failure and its fix
- **AND** the CLI exits with code 1 before starting any container or Tilt process

#### Scenario: Tilt is not installed when the stack is started

- **WHEN** a user runs `flisk up` while Tilt is not on `PATH`
- **THEN** the CLI prints the Tilt failure with its installation command
- **AND** the CLI exits with code 1 before starting any container or Tilt process
