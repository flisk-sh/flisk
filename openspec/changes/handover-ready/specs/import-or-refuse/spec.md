## ADDED Requirements

### Requirement: Tier-1 import only
`flisk import <dir>` MUST recognize only Compose, Dockerfile, `package.json` scripts, and Procfile. Anything else MUST be listed as skipped, not invented. `--dry-run` MUST print the plan and MUST NOT write files.

#### Scenario: Compose repo
- **WHEN** the user runs `flisk import . --dry-run` in a directory with `docker-compose.yml` and two services
- **THEN** the plan lists those services and the files it would write
- **AND** no files are written

#### Scenario: Unsupported file
- **WHEN** the user runs `flisk import .` in a directory with a Helm chart and no Compose file
- **THEN** the command exits 2
- **AND** the message says Helm is not imported
- **AND** no files are written
