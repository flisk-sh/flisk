# Spec Delta: Core Platform

## ADDED Requirements

### Requirement: Minimal service contract

A service in the minimal contract SHALL declare:

- `name`: a unique service name;
- exactly one of `image`, `dockerfile`, or `command` as its runtime source;
- `port`: the port the service listens on;
- `env`: an optional map of environment variables, which MAY reference `${VAR}` from the project environment;
- `dependsOn`: an optional list of other service names.

All other fields are optional. A service that declares more than one runtime source, or none, SHALL be rejected with an error that names the service.

#### Scenario: Declare a service with an image

- **WHEN** a service declares `image` and `port` only
- **THEN** Flisk SHALL accept the service
- **AND** Flisk SHALL NOT require Bun, Hono, or any framework field

#### Scenario: Reject two runtime sources

- **WHEN** a service declares both `image` and `command`
- **THEN** Flisk SHALL fail validation and name the service in the error

### Requirement: Minimal service execution

The system SHALL allow a service to be started from either:

- an existing container image;
- an existing Dockerfile;
- a direct local command;
- or a Flisk-generated runtime configuration.

#### Scenario: Run an existing Dockerfile

- **WHEN** a `service.json` declares `runtime.dockerfile`
- **THEN** Flisk SHALL use that Dockerfile
- **AND** Flisk SHALL NOT generate a replacement Dockerfile

#### Scenario: Run without generated files

- **WHEN** a project enables `generation.enabled: false`
- **THEN** Flisk SHALL NOT create framework, proxy, client, or build files
- **AND** `flisk up` SHALL still start the declared services

### Requirement: Optional capabilities

The system SHALL treat the following as optional capabilities: gateway routing, database provisioning, hot reload, health checks, API client generation, framework scaffolding, Docker execution, and Tilt orchestration.

#### Scenario: Disable bundled infrastructure

- **WHEN** a project disables `gateway`, `database`, and `watch`
- **THEN** Flisk SHALL NOT provision Traefik, Postgres, or Tilt watch behavior
- **AND** Flisk SHALL report only the capabilities that remain enabled

### Requirement: Existing configuration compatibility

The system SHALL support importing or wrapping existing local development configuration without requiring users to replace it.

#### Scenario: Import Docker Compose

- **WHEN** a user runs `flisk import compose`
- **THEN** Flisk SHALL create or update `service.json` definitions from the Compose file
- **AND** Flisk SHALL preserve the original Compose file

#### Scenario: Wrap an existing Tiltfile

- **WHEN** a project declares an existing Tiltfile
- **THEN** Flisk SHALL use that Tiltfile as the orchestration source
- **AND** Flisk SHALL NOT overwrite it unless the user explicitly requests regeneration

### Requirement: Provider extensibility

The system SHALL allow local runtime, gateway, database, cache, queue, and framework behavior to be supplied by providers.

#### Scenario: Replace default runtime

- **WHEN** a project selects a non-default local runtime provider
- **THEN** Flisk SHALL use that provider for service startup and lifecycle management
- **AND** Flisk SHALL NOT require Docker or Tilt unless the selected provider requires them

### Requirement: Explicit generation

The system SHALL generate files only when the corresponding capability is enabled or the user explicitly requests generation.

#### Scenario: Preview generated changes

- **WHEN** a user runs `flisk up --dry-run --explain`
- **THEN** Flisk SHALL list every file it would create, modify, or delete
- **AND** Flisk SHALL identify the capability or preset responsible for each change
