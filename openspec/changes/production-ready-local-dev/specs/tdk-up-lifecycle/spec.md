# Spec Delta

## Purpose

Make the existing `flisk up` command safe to repeat and explicit when startup is partial.

## ADDED Requirements

### Requirement: Repeated up is idempotent
Running `flisk up` when the project environment is already up SHALL NOT create a second environment. It SHALL report that the environment is already running and exit 0.

#### Scenario: Second up
- **WHEN** `flisk up` succeeds and the user runs `flisk up` again
- **THEN** services stay running, no duplicate containers are created, and the command exits 0

### Requirement: Partial startup names the failed dependency
If startup does not finish, `flisk up` SHALL name the failed service, the cause it can detect, and which dependents did not become ready. It SHALL NOT report the whole environment as ready.

#### Scenario: Database fails to start
- **WHEN** postgres fails and api depends on it
- **THEN** output marks postgres failed and api not ready because of postgres, and the command exits non-zero

### Requirement: Interruption does not leave partial generated files
Ctrl+C during generation, Docker startup, Tilt startup, or shutdown SHALL leave generated files either unchanged or fully written. It SHALL NOT leave a truncated generated file as the current config.

#### Scenario: Interrupt during generation
- **WHEN** the user interrupts `flisk up` while generated files are being written
- **THEN** a following `flisk config verify` does not see a half-written generated file

### Requirement: Selected ports match doctor
When Flisk falls back from a requested host port, human output SHALL print the requested port, the occupant when known, and the chosen port. The chosen port SHALL match `data.ports` in `flisk doctor --json`. Existing `TDK_HTTP_PORT`, `TDK_HTTPS_PORT`, and `TDK_POSTGRES_PORT` overrides SHALL stay in effect.

#### Scenario: HTTP port is taken
- **WHEN** the requested HTTP port is in use and Flisk selects another
- **THEN** human output names the requested port, the chosen port, and `TDK_HTTP_PORT`, and doctor JSON `data.ports.http.chosen` is that chosen port
