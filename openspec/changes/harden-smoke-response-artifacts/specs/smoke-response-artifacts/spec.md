## MODIFIED Requirements

### Requirement: Each smoke step retains status and body

After a smoke step receives a response, `flisk up` MUST write a record containing the service, step name, method, public URL, expected status, actual status, and response body. The body MUST be capped at 64 KiB. A capped body MUST be marked truncated. The retained body MUST be the redacted body, so a stored body never holds a secret value the redaction helper recognises for the project. The helper reads the project's `.env` and masks the values of at least 8 characters there; shorter values are left alone on purpose.

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

## ADDED Requirements

### Requirement: Smoke response artifacts are ignored before they are written

Before `flisk up` writes a smoke response artifact, the CLI MUST ensure that `.tdk/smoke/` is ignored by the project's `.gitignore`, regardless of how the project or its `smoke` configuration was created. This applies only when the project is inside a git working tree; outside one there is nothing to protect and the CLI MUST NOT create a `.gitignore`. If the ignore entry cannot be ensured, the CLI MUST warn the user before writing artifacts and MUST NOT claim that the directory is git-ignored.

#### Scenario: Smoke configuration was added without `flisk project`

- **WHEN** `flisk up` is about to write a smoke response artifact in a git working tree whose `.gitignore` does not ignore `.tdk/smoke/`
- **THEN** the CLI adds `.tdk/smoke/` to the project `.gitignore` before writing the artifact

#### Scenario: The project is not inside a git working tree

- **GIVEN** the project root and none of its ancestors holds a `.git` entry
- **WHEN** `flisk up` writes smoke response artifacts
- **THEN** the CLI does not create or modify a `.gitignore`
- **AND** it prints no ignore warning

#### Scenario: Ignore setup fails

- **WHEN** the CLI cannot add or verify the `.tdk/smoke/` ignore entry
- **THEN** it emits a clear warning before writing artifacts
- **AND** the warning explains that Git may track the response records

#### Scenario: Example project is checked out

- **WHEN** a user checks out `examples/tdk-example`
- **THEN** its `.gitignore` ignores `.tdk/smoke/`

### Requirement: Smoke text sinks redact known project secrets

Before any smoke text is shown or stored, the CLI MUST redact every secret value that the shared `flisk logs` / `flisk doctor` redaction helper recognises for the project. This applies to the stored response body, the last-success body copy, the body snippet printed in the failure line, and the URL and error text kept in the record. Redaction MUST happen before the body is capped and written. The CLI MUST NOT fall back to showing or persisting raw response text when the secret values cannot be loaded or the redaction cannot complete.

#### Scenario: Response body contains a known secret

- **GIVEN** a response body contains a value that the shared `flisk logs` / `flisk doctor` redaction helper recognises as a secret
- **WHEN** `flisk up` persists the response record
- **THEN** the stored body replaces that value with `[REDACTED]`
- **AND** the known secret value is absent from the stored body

#### Scenario: Last-success body contains a known secret

- **GIVEN** a passing smoke response body contains a known project secret
- **WHEN** `flisk up` stores the latest and last-success records
- **THEN** neither `body.txt` nor `last-success-body.txt` contains the secret value

#### Scenario: The failure line prints a body snippet

- **GIVEN** a failing smoke step returns a body that contains a known project secret
- **WHEN** `flisk up` prints the failure line
- **THEN** the printed snippet contains `[REDACTED]` instead of the secret value

#### Scenario: The record keeps a URL that contains a known secret

- **GIVEN** a smoke step sends a secret in the request path or query
- **WHEN** `flisk up` writes the record
- **THEN** the recorded URL is redacted

#### Scenario: Secret source cannot be read

- **GIVEN** the project's `.env` exists but cannot be read to obtain the secret values
- **WHEN** `flisk up` runs a smoke step
- **THEN** the CLI does not persist the raw response body
- **AND** it does not print the raw body snippet
- **AND** it emits a warning that the body was not stored because it could not be redacted safely
- **AND** the record still holds the safe metadata (service, step, method, status, error)
- **AND** the recorded URL is withheld, because it could not be masked either
- **AND** the smoke step's pass/fail result is unchanged by the artifact-write failure

#### Scenario: Redacted body exceeds the record size limit

- **GIVEN** a response body contains known secret values and the redacted body exceeds the configured record cap
- **WHEN** the CLI persists the response
- **THEN** it redacts the body before applying the existing 64 KiB cap
- **AND** it records the existing truncation metadata correctly
- **AND** the recorded byte length is the length of the redacted body

### Requirement: Smoke response artifact lifecycle and CI publication are documented

The smoke and configuration documentation MUST explain the local artifact location, the redaction scope and its limits, the local retention, the manual cleanup, and the CI publication and its retention.

#### Scenario: User consults smoke documentation

- **WHEN** a user reads `docs/smoke.md` or `docs/configuration.md`
- **THEN** the documentation identifies `.tdk/smoke/` as the local record location
- **AND** explains that records survive `flisk down` until deleted or overwritten
- **AND** provides a manual cleanup command
- **AND** explains that only secrets covered by the shared redaction helper are redacted, and that a project without a readable `.env` has nothing to redact
- **AND** discloses that the `smoke` suite of `.github/workflows/e2e-journeys.yml` uploads `smoke-records-*` artifacts with 14-day retention and that people who can read the workflow run can download them
- **AND** explains that Git ignore does not remove already tracked files or erase previously committed content
