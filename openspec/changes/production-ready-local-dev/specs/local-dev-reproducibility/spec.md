# Spec Delta

## Purpose

The existing commands behave the same on the supported platforms, and upgrades do not silently change a working project.

## ADDED Requirements

### Requirement: Compatibility floors are shared
`flisk doctor` and `flisk up` SHALL use the same Docker, Compose, Tilt, and Bun floors. An unsupported combination SHALL be reported before startup with the required floor, the detected version, and a fix. Both commands SHALL agree.

#### Scenario: Docker is too old
- **WHEN** Docker Engine is below the floor
- **THEN** `flisk doctor` and `flisk up` both refuse with the required and detected versions and exit non-zero

### Requirement: Upgrades do not rewrite config silently
A missing `schemaVersion` SHALL be fixed only by `flisk config migrate`. That command SHALL NOT rewrite generated files. `flisk config regenerate` SHALL NOT add `schemaVersion`. An unsupported `schemaVersion` SHALL fail migrate and leave `service.json` byte-identical. Deprecated fields SHALL warn and keep working for that compatible release.

#### Scenario: Schema version is missing
- **WHEN** `service.json` has no `schemaVersion` and the user runs `flisk up`
- **THEN** Flisk does not write `schemaVersion` and tells the user to run `flisk config migrate`

### Requirement: Native Windows stays inspection-only
Native Windows SHALL remain documented as inspection-only. This change SHALL NOT start Docker or Tilt on native Windows except the existing unsupported `TDK_ALLOW_NATIVE_WINDOWS=1` escape hatch.

#### Scenario: Native Windows doctor
- **WHEN** `flisk doctor` runs on native Windows
- **THEN** it does not claim the landscape can start and points at WSL2

### Requirement: Fixtures lock current commands
CI SHALL run fixtures for a basic stack, invalid config, and a port conflict through the existing `flisk doctor`, `flisk doctor --json`, `flisk config verify`, `flisk logs` usage, and `flisk up --dry-run`. Each representative fixture SHALL have golden generated output. An unexpected generated diff SHALL fail CI.

#### Scenario: Generated golden drift
- **WHEN** a pull request changes generated output for a fixture without updating the golden file
- **THEN** CI fails

### Requirement: Config validation names the field
Invalid `service.json` SHALL be rejected by the existing doctor and up path. The error SHALL report the file, field, value, problem, and a fix. Circular dependencies, duplicate names, and invalid ports SHALL be rejected before startup.

#### Scenario: Circular dependency
- **WHEN** api depends on worker and worker depends on api
- **THEN** validation names both services and `flisk up` does not start the environment
