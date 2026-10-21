# Spec Delta

## Purpose

Existing doctor, up, status, ui, and logs output stays actionable. No new observability command.

## ADDED Requirements

### Requirement: UI shows the same failure as status
`flisk ui` SHALL show the current service failure that `flisk status` shows. This change SHALL NOT add another interactive command.

#### Scenario: Failed dependency is visible
- **WHEN** api cannot reach postgres
- **THEN** `flisk ui` shows postgres not ready and the api error naming postgres

### Requirement: Existing errors say what, why, and what next
A startup, config, or port failure from `flisk doctor` or `flisk up` SHALL state what failed, the cause Flisk could detect, and at least one next action. Normal output SHALL NOT include a stack trace. The existing verbose flag SHALL be the only place stack traces appear.

#### Scenario: Port in use
- **WHEN** a service cannot bind its port because another process holds it
- **THEN** `flisk up` names the service, the port, the occupant when known, and the existing Flisk port env var

### Requirement: Logs keep the service error
`flisk logs` SHALL remain a bounded snapshot. `--service` SHALL limit output to those Tilt resource names. An unknown service or invalid flag SHALL exit 2. Tilt connection failure SHALL tell the user to run `flisk up`. Flisk SHALL NOT drop the service's own error text. Secret values SHALL be redacted in `--json`.

#### Scenario: API logs
- **WHEN** the user runs `flisk logs --service api`
- **THEN** output is scoped to api and includes the service's error lines

#### Scenario: Unknown service
- **WHEN** the user passes a service name Tilt does not know
- **THEN** `flisk logs` exits 2 and names the unknown service

### Requirement: Secrets stay redacted
Doctor JSON, logs JSON, and error output SHALL redact secret values.

#### Scenario: Database URL is secret
- **WHEN** doctor JSON includes a database URL value
- **THEN** the value is redacted
