## ADDED Requirements

### Requirement: Agent session inspection requires a session id
`tdk agent sessions <resource>` SHALL require `--session-id`. When it is missing, and the resource exists and is an agent, the command SHALL exit 1 with code `SESSION_ID_REQUIRED` and a usage hint before sending any request. The MCP `get_agent_sessions` tool SHALL require `sessionId`.

#### Scenario: Missing session id
- **WHEN** `tdk agent sessions bot --json` runs without `--session-id`
- **THEN** one envelope with code `SESSION_ID_REQUIRED` is printed, the exit code is 1, and no HTTP request is made

#### Scenario: Unknown resource without session id
- **WHEN** the resource does not exist and `--session-id` is also missing
- **THEN** the error is `UNKNOWN_RESOURCE`
