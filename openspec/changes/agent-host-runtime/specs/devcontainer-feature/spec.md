## ADDED Requirements

### Requirement: Reference Dev Container ships with the repo
The repository SHALL ship `.devcontainer/devcontainer.json` that installs the Flisk binary on PATH and reaches a host Docker engine through docker-outside-of-docker. Documentation SHALL state that socket-mounted Docker is privileged and is the only supported engine path.

#### Scenario: Contributor opens the repo in a Dev Container (manual verification)
- **WHEN** the container starts on a machine with Docker
- **THEN** `flisk --version` and `flisk doctor` succeed with a reachable runtime

This scenario needs a real Dev Container and Docker socket. It is verified manually before release, not by a unit fixture that mocks the socket.

### Requirement: Consumer template is opt-in
`flisk project` SHALL emit a Dev Container template only when `--devcontainer` is passed; the default output SHALL be unchanged.

#### Scenario: Default project creation
- **WHEN** `flisk project` runs without `--devcontainer`
- **THEN** no `.devcontainer` directory is created

### Requirement: Forwarded ports come from the ingress list
Documented `forwardPorts` guidance SHALL be derived from the stack-level ports in `flisk status --json` (ingress HTTP and HTTPS, the Tilt UI, and published datastores such as Postgres), not from per-service container ports. Application services are reached through the ingress and SHALL NOT each be forwarded.

#### Scenario: Stack with several services
- **WHEN** a stack is running
- **THEN** the guidance lists the ingress, Tilt UI and published datastore ports, and no per-service app port
