## ADDED Requirements

### Requirement: Service manifest declares its schema version
`service.json` SHALL contain an explicit schema version, and verification SHALL reject missing required fields with a path identifying the field.

#### Scenario: Required field is missing
- **WHEN** `flisk config verify` reads a service manifest missing a required field
- **THEN** it exits 1 and identifies the missing field path

#### Scenario: Schema version is absent
- **WHEN** `flisk config verify` reads a manifest without an explicit schema version
- **THEN** it reports the schema-version path as required and exits 1

### Requirement: Unknown manifest fields are preserved
The CLI SHALL warn about unknown `service.json` fields and SHALL preserve their keys and values during configuration operations and regeneration.

#### Scenario: User extension field survives regeneration
- **WHEN** a manifest contains an unknown user field and the user regenerates configuration
- **THEN** the CLI warns about the field and the key and value remain present

### Requirement: Patch releases preserve required manifest fields
A patch CLI release SHALL NOT silently change the required `service.json` fields. A breaking schema change SHALL require `flisk config migrate` or a major version release accompanied by a printed warning.

#### Scenario: Breaking field change is introduced
- **WHEN** a CLI release changes a required manifest field incompatibly
- **THEN** it provides an explicit migration command or uses a major release and prints a breaking-change warning
