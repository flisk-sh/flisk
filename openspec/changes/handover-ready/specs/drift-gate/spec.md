## ADDED Requirements

### Requirement: Generated files match service.json
Before Tilt starts, `flisk up` MUST detect generated service files that were edited by hand. A changed `service.json` is not drift: `flisk up` regenerates from it. On drift it MUST exit non-zero, name the files, and print `flisk config regenerate`. `flisk up --ignore-drift` MAY bypass the check and MUST print a warning.

#### Scenario: Hand-edited Dockerfile
- **WHEN** the user runs `flisk up` on a stack whose generated Dockerfile was edited by hand
- **THEN** the command exits 2
- **AND** the output names the drifted file
- **AND** Tilt is not started

#### Scenario: Clean tree
- **WHEN** the user runs `flisk up` and generated files match `service.json`
- **THEN** verify passes and startup continues
