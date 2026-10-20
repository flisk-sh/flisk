## ADDED Requirements

### Requirement: Project setup does not require the local runtime

`tdk project` MUST create the local project configuration and MUST clone a starter template without a running Docker daemon and without an installed Tilt. It MUST NOT probe the Docker daemon while setting a project up, and it MUST NOT exit because the local runtime is missing.

#### Scenario: Docker is stopped and Tilt is not installed

- **WHEN** a user runs `tdk project --yes` while the Docker daemon is stopped and Tilt is not on `PATH`
- **THEN** the CLI writes `.tdk/project.json`, the generated master configuration files and `.env`
- **AND** the CLI exits with code 0
- **AND** the CLI does not contact the Docker daemon

#### Scenario: A starter template is cloned without the local runtime

- **WHEN** a user runs `tdk project example` while the Docker daemon is stopped and Tilt is not on `PATH`
- **THEN** the CLI clones the template into the destination directory
- **AND** the CLI exits with code 0

### Requirement: Missing runtime is reported as a next step

After project setup, the CLI MUST tell the user how to become ready for the local runtime instead of failing. The hint MUST name every runtime executable that is missing, MUST reuse the remediation text of the existing doctor fixes, and MUST point at `tdk doctor` for the readiness check and at `tdk up` for starting the stack.

#### Scenario: Tilt is not installed

- **WHEN** project setup finishes on a machine without Tilt on `PATH`
- **THEN** the output states that Tilt is not installed and shows the Tilt installation command
- **AND** the output points at `tdk doctor` and `tdk up`

#### Scenario: Docker and Tilt are installed

- **WHEN** project setup finishes on a machine with Docker and Tilt on `PATH`
- **THEN** the output does not claim that a runtime executable is missing
- **AND** the output still points at the runtime and `tdk up`

### Requirement: Doctor stays the explicit readiness check

`tdk doctor` MUST remain the command that reports whether the whole machine, including the local runtime, is ready for `tdk up`. Its behavior MUST NOT change because project setup became independent of the runtime.

#### Scenario: Readiness is checked explicitly

- **WHEN** a user runs `tdk doctor` on a machine without a Docker daemon or without Tilt
- **THEN** the report names the missing runtime pieces and their fixes
