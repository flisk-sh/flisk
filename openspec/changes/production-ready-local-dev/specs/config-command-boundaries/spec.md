# Spec Delta

## Purpose

`flisk config regenerate`, `flisk config migrate`, and `flisk import` are three commands. None of them calls the others.

## ADDED Requirements

### Requirement: Regenerate rewrites generated files only
`flisk config regenerate` SHALL rewrite the generated master config files from `.tdk/project.json`. It SHALL NOT change `service.json` schema versions. It SHALL NOT import a Compose file, Dockerfile, or Procfile. `--dry-run` SHALL print the diff and SHALL NOT write files.

#### Scenario: Regenerate after a project.json edit
- **WHEN** the user runs `flisk config regenerate`
- **THEN** generated master files are rewritten from `.tdk/project.json` and every `service.json` stays byte-identical

#### Scenario: Regenerate dry-run
- **WHEN** the user runs `flisk config regenerate --dry-run`
- **THEN** the command prints what would change and writes no file

### Requirement: Migrate updates service.json only
`flisk config migrate` SHALL set missing `schemaVersion` on `service.json` to the current schema version. It SHALL preserve unknown fields. It SHALL NOT rewrite generated Docker or Tilt files. It SHALL NOT import an external project. A file that already has the current `schemaVersion` SHALL be left byte-identical. An unsupported `schemaVersion` SHALL fail the command and SHALL NOT be rewritten.

#### Scenario: Missing schema version
- **WHEN** a valid `service.json` has no `schemaVersion` and the user runs `flisk config migrate`
- **THEN** that file gains the current `schemaVersion`, unknown fields remain, and generated files are not written

#### Scenario: Already current
- **WHEN** every `service.json` already has the current `schemaVersion`
- **THEN** migrate writes nothing and exits 0

#### Scenario: Unsupported schema version
- **WHEN** a `service.json` has a `schemaVersion` this CLI cannot migrate
- **THEN** migrate names the file and the version, exits 1, and leaves that file byte-identical

### Requirement: Import does not regenerate or migrate
`flisk import` SHALL run the `tdk-import` package and pass through its arguments and exit code. It SHALL NOT run `flisk config regenerate` or `flisk config migrate`. A failed import SHALL NOT be reported as generated-config drift.

#### Scenario: Import dry-run
- **WHEN** the user runs `flisk import --dry-run`
- **THEN** the command delegates to `tdk-import` and does not run regenerate or migrate

#### Scenario: Import cannot start
- **WHEN** `npx` cannot run the importer
- **THEN** `flisk import` exits 127 and names the npx failure
