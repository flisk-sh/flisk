# Spec Delta

## Purpose

Keeps the per-container CPU, memory and image-size cost of generated TDK runtimes small enough that a large landscape (100+ resources) can run on a 16 GB developer machine without starving the container runtime.

## ADDED Requirements

### Requirement: One Application Process Per Runtime Container

A generated Bun backend or Bun-static frontend runtime container SHALL run its application as a single Bun process. The container entrypoint MUST hand off to that process with `exec` rather than keep a wrapper process alive. This applies when the service's `start` script runs a single entry file.

#### Scenario: Default backend start script

- **WHEN** a generated backend's `package.json` has `"start": "bun run dist/index.js"` and its runtime container has finished starting
- **THEN** exactly one Bun process is running in the container (as listed by `docker top`)
- **AND** that process is running `dist/index.js`

#### Scenario: Custom start script is preserved

- **WHEN** a service's `start` script does more than run a single entry file (for example it chains commands or sets environment variables)
- **THEN** the runtime starts the service through `bun run start`
- **AND** the service behaves as it did before this change

#### Scenario: Signals reach the application

- **WHEN** a running backend container is stopped with `docker stop`
- **THEN** the application process receives SIGTERM directly and the container exits within the stop timeout

### Requirement: Healthchecks Are Low-Cost And Low-Frequency

Container healthchecks generated for services and golden images SHALL default to an interval of 30 seconds, and the timing MUST be overridable per run through `TDK_HEALTHCHECK_*` environment variables. A healthcheck command MUST NOT download packages or start a package-runner process (such as `bunx` or `npx`).

#### Scenario: Default service healthcheck interval

- **WHEN** a project is generated with default healthcheck configuration
- **THEN** every generated compose service healthcheck has `interval: 30s`
- **AND** the start period is at least as long as it was before this change

#### Scenario: Startup readiness is not delayed

- **WHEN** a generated service container starts and begins answering its health endpoint
- **THEN** Docker reports it healthy within 5 seconds of the first successful answer, even with a 30-second steady-state interval

#### Scenario: Configured interval is honoured

- **WHEN** `tdk up` runs with `TDK_HEALTHCHECK_INTERVAL_SECONDS` set (e.g. `15`)
- **THEN** the generated compose files and golden images use that interval

#### Scenario: One-shot migrator images carry no healthcheck

- **WHEN** the golden migrator image or a generated migrator runtime image is inspected
- **THEN** it declares no healthcheck (`HEALTHCHECK NONE`)
- **AND** no healthcheck anywhere in the generated images invokes `bunx` or `npx`

### Requirement: Golden Images Contain Only Universally Required Tooling

A golden runtime image SHALL contain only tooling that every service of that runtime type needs. Tooling that only some services use MUST be installed in the per-service layer, and only when that service's manifest declares the matching feature.

#### Scenario: Backend golden image has no hugo

- **WHEN** the golden L4 backend Bun image is built
- **THEN** the `hugo` binary is not present in the image

#### Scenario: Service declaring the hugo feature

- **WHEN** a service's manifest lists `hugo` in `featuresEnabled`
- **THEN** that service's runtime image contains the `hugo` binary
- **AND** services that do not declare it do not

### Requirement: Idle Backend Footprint Budget

A backend generated from the default TDK backend template SHALL, when idle (running and healthy, with no incoming requests), stay within 64 MiB container memory and average under 2% of one CPU core over 60 seconds, as reported by `docker stats`.

#### Scenario: Measuring an idle template backend

- **WHEN** a backend generated with `tdk resource <name> --type backend` has been running and healthy for 60 seconds with no incoming requests
- **THEN** its container memory usage is at most 64 MiB
- **AND** its average CPU usage over the following 60 seconds is below 2% of one core
