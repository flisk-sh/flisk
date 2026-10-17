## ADDED Requirements

### Requirement: Agent session inspection requires a session id
`tdk agent sessions <resource>` SHALL require `--session-id`. When it is missing, and the resource exists and is an agent, the command SHALL exit 1 with code `SESSION_ID_REQUIRED` and a usage hint before sending any request. The MCP `get_agent_sessions` tool SHALL require `sessionId`.

#### Scenario: Missing session id
- **WHEN** `tdk agent sessions bot --json` runs without `--session-id`
- **THEN** one envelope with code `SESSION_ID_REQUIRED` is printed, the exit code is 1, and no HTTP request is made

#### Scenario: Unknown resource without session id
- **WHEN** the resource does not exist and `--session-id` is also missing
- **THEN** the error is `UNKNOWN_RESOURCE`

### Requirement: Agent sessions are reached through the ingress route
`tdk agent sessions` SHALL call the agent's Traefik route (the `url` that `tdk status --json` reports, for example `http://api.<project>.localhost:<ingress port>/api/<agent>`) and never the agent container's own port, because TDK publishes no host port for agents.

#### Scenario: Agent container has no host port
- **WHEN** the agent's own port has no listener on the host and its Traefik route answers
- **THEN** `tdk agent sessions bot --session-id s1 --json` succeeds via the route

### Requirement: Gateway failures are told apart from agent errors
For `*.localhost` routes `tdk agent sessions` SHALL connect to loopback and send the route's host in the `Host` header. A connection failure, a 502/503/504, or a plain-text 404 from the gateway SHALL be reported as `AGENT_NOT_RUNNING`; a JSON error from the agent SHALL be reported as `AGENT_REQUEST_FAILED`. A resource with no route SHALL fail with `NO_ROUTE`.

#### Scenario: Gateway has no live backend
- **WHEN** Traefik answers 502 or a plain-text 404 for the agent's route
- **THEN** the error code is `AGENT_NOT_RUNNING` with the hint `tdk up`

#### Scenario: Agent answers with its own error
- **WHEN** the agent answers 404 with a JSON `error` body
- **THEN** the error code is `AGENT_REQUEST_FAILED` and the message includes the status and the agent's text

