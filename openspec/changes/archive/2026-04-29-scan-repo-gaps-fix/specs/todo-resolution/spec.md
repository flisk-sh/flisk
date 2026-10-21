## ADDED Requirements

### Requirement: CLI resource command TODOs are implemented
The system SHALL implement all TODO comments in cli/src/commands/resource.ts.

#### Scenario: Resource database check TODO
- **WHEN** creating a new resource with database dependencies
- **THEN** the system SHALL check if the database exists and create it if missing

#### Scenario: Resource cache check TODO
- **WHEN** creating a new resource with cache dependencies
- **THEN** the system SHALL check if the cache service is configured

#### Scenario: Resource routes TODO
- **WHEN** creating a new backend resource
- **THEN** the system SHALL generate a basic route file template with health check endpoint

#### Scenario: Resource worker logic TODO
- **WHEN** creating a new worker resource
- **THEN** the system SHALL generate a basic worker script template with job processing structure

### Requirement: CLI config command diff is implemented
The system SHALL implement the diff logic TODO in cli/src/commands/config.ts.

#### Scenario: Config diff shows differences
- **WHEN** user runs `flisk config diff`
- **THEN** the system SHALL compare local and remote configuration and display differences
