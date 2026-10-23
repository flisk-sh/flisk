# smoke-response-artifacts Specification

## Purpose
Smoke checks retain the status and response body of every step under `.tdk/smoke/`, and CI publishes that record, so a later regression can be compared with the last response that passed.

## Requirements
### Requirement: Each smoke step retains status and body

After a smoke step receives a response, `flisk up` MUST write a record containing the service, step name, method, public URL, expected status, actual status, and response body. The body MUST be capped at 64 KiB. A capped body MUST be marked truncated.

#### Scenario: Failed step writes the record

- **WHEN** a smoke step returns a status other than the expected status
- **THEN** the record stores that status, the public URL, and the response body up to the cap
- **AND** the failure line includes the record path
- **AND** `flisk up` still exits non-zero

#### Scenario: Passing step keeps a success copy

- **WHEN** a smoke step matches its expected status
- **THEN** the latest record is written
- **AND** the last success record for that service and step is replaced with this response

#### Scenario: No response after retries

- **WHEN** a step ends without an HTTP response
- **THEN** the record stores a null status and the error code
- **AND** no body file is written

### Requirement: A later failure can be compared with the last success

A failed step MUST NOT overwrite the last success record for that service and step.

#### Scenario: Regression after a pass

- **WHEN** a step passed earlier and a later run of the same step fails
- **THEN** the artifact contains both the last success body and the new failure body

### Requirement: CI publishes the smoke record

The smoke verification job MUST upload the smoke record directory when the job finishes, including when `flisk up` exits non-zero.

#### Scenario: Missing route in verify-smoke

- **WHEN** `tests/e2e/journeys/smoke/verify-smoke.sh` runs the missing-route phase
- **THEN** the failure record contains the public URL, status 404, and a non-empty body
- **AND** the workflow uploads that directory as an artifact

