# published-importer-package Specification

## Purpose
Verify the released importer package and documentation meet the published contract for published-importer-package.

## Requirements

### Requirement: 0.2.2 is the safeguard release
`npm view flisk-import version` MUST report `0.2.2` after publish.
The tarball MUST be built from the commit that contains flisk-import#9 and #10.
The publish workflow MUST run with `dry_run` off.

#### Scenario: latest is not 0.2.1
- GIVEN the publish workflow succeeded
- WHEN a clean machine runs `npx -y flisk-import@0.2.2 --version`
- THEN it prints 0.2.2
- AND it does not install 0.2.1
