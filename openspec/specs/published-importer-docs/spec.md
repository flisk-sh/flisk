# published-importer-docs Specification

## Purpose
Verify the released importer package and documentation meet the published contract for published-importer-docs.

## Requirements

### Requirement: commands name 0.1.1
`docs/operator-runbook.md` and the importer README MUST show
`npx -y @tdk-landscape/tdk-import@0.1.1`. They MUST keep the core gate:
imported services need Flisk CLI core 1.3.104 or later, and the importer does not
check the installed core version.

#### Scenario: reader follows the runbook
- GIVEN 0.1.1 is the latest published safeguard release
- WHEN a reader copies the import command
- THEN the command includes `@0.1.1`
- AND the page still says not to run `flisk up` on a core older than 1.3.104
