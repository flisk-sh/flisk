## ADDED Requirements

### Requirement: Match log content through CLI and MCP
The system SHALL accept a regex through `logs --grep` and MCP `logs.grep` and SHALL return only matches and requested context from the selected redacted log window.

#### Scenario: Smart-case matching
- **WHEN** a pattern contains no uppercase letters
- **THEN** matching SHALL ignore case
- **AND** a pattern containing uppercase letters SHALL match case-sensitively

#### Scenario: Preserve bounded selection
- **WHEN** the caller combines grep with service, source, since or tail selection
- **THEN** content matching SHALL use only the selected tail window
- **AND** the caller SHALL receive an empty line list and exit code zero when nothing matches

### Requirement: Preserve service context and JSON evidence
The system SHALL return up to the requested number of neighboring lines from the same service and SHALL mark each JSON line with whether it matches.

#### Scenario: Merge windows without duplicates
- **WHEN** context windows overlap or service output interleaves
- **THEN** each selected line SHALL appear once in original order
- **AND** context SHALL NOT include unrelated lines from another service

### Requirement: Reject invalid content options
The system SHALL reject malformed regex patterns and invalid context values before reading logs.

#### Scenario: Invalid regex
- **WHEN** the caller provides an invalid regex
- **THEN** the CLI SHALL return a usage error with exit code two and the pattern
- **AND** the MCP tool SHALL report an input error

#### Scenario: Missing grep
- **WHEN** context is supplied without grep
- **THEN** the system SHALL report a usage error
