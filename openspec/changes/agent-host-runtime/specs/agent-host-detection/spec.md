## ADDED Requirements

### Requirement: Doctor reports the host kind
`tdk doctor` SHALL classify the host from a positive marker and report the kind in both human and `--json` output (`data.host.kind`). Markers: WebContainer (`process.versions.webcontainer`), Codespaces (`CODESPACES=true`), Dev Container (`REMOTE_CONTAINERS` set, or `/.dockerenv` together with a devcontainer marker such as `DEVCONTAINER`), WSL2 (`WSL_DISTRO_NAME` on Linux), native Windows, otherwise local. `/.dockerenv` alone SHALL NOT classify a host as a Dev Container, because it is present in every container. When several markers match, precedence SHALL be WebContainer, Codespaces, Dev Container, WSL2, native Windows, local.

#### Scenario: Codespaces also sets a Dev Container marker
- **WHEN** both `CODESPACES=true` and `REMOTE_CONTAINERS` are set
- **THEN** the host kind is `codespaces`

#### Scenario: Bare container
- **WHEN** only `/.dockerenv` exists
- **THEN** the host kind is `local`

### Requirement: canUp has one definition
`data.host.canUp` SHALL be false when the host kind cannot run the stack (WebContainer; native Windows without `TDK_ALLOW_NATIVE_WINDOWS=1`) or when no container runtime is reachable, and true otherwise. Host kind is informational for every other kind. `tdk up` SHALL refuse exactly when `canUp` would be false, and no other rule SHALL be added.

#### Scenario: Container runtime is down on a machine
- **WHEN** doctor finds no reachable container runtime on a local host
- **THEN** `canUp` is false and the existing runtime remediation is shown

### Requirement: Missing runtime in a Dev Container gets Dev Container remediation
When the container runtime is unreachable inside a Dev Container or Codespace, `tdk doctor` and `tdk up` SHALL give remediation for mounting the Docker socket or enabling docker-outside-of-docker, not a Docker Desktop installation instruction, and `tdk up` SHALL exit non-zero without starting Tilt.

#### Scenario: No Docker socket in a Dev Container
- **WHEN** `tdk up` runs in a Dev Container without a reachable engine
- **THEN** it exits non-zero, prints the Dev Container remediation, and does not start Tilt

### Requirement: WebContainers cannot run the stack
When `process.versions.webcontainer` is set, `tdk doctor --json` SHALL set `canUp: false` and link the docs, and `tdk up` SHALL exit non-zero without starting Tilt.

#### Scenario: Doctor in a WebContainer
- **WHEN** doctor runs in a WebContainer
- **THEN** `canUp` is false and no Tilt process is spawned
