## ADDED Requirements

### Requirement: importer names the core it needs
The importer README and `docs/operator-runbook.md` MUST name Flisk CLI core 1.3.104 as the first release that includes `buildContext` (tdk-cli-core#525), and say that release 1.3.104 or later is required before starting imported services with `flisk up`. This is a documentation-only compatibility statement: the importer binary MUST NOT detect or enforce the installed core version. If release 1.3.104 has not been published, both pages MUST say import cannot be started yet and MUST NOT show `flisk up` as the next step.

#### Scenario: Compatible core release is available
- **GIVEN** Flisk CLI core 1.3.104 has been published
- **WHEN** a reader follows the import section in either page
- **THEN** the page names 1.3.104 as the first compatible release and requires 1.3.104 or later
- **AND** the instructions do not imply the importer checks the installed core version

#### Scenario: Compatible core release is not available
- **GIVEN** Flisk CLI core 1.3.104 has not been published
- **WHEN** a reader follows the import section in either page
- **THEN** both pages say import cannot be started yet
- **AND** neither page shows `flisk up` as a next step
- **AND** both pages identify tdk-cli-core#525 as the change that adds `buildContext`
