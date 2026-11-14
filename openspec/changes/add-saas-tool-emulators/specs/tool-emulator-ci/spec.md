## ADDED Requirements

### Requirement: Full matrix, launched only for changed tools
The `tools` e2e group SHALL run one leg per tool x appType x framework on merge queue, nightly and release, and on a pull request only the legs that the changed files select through the tool graph.

#### Scenario: One tool changed
- **WHEN** a pull request changes only `runtime/platform/tools/minio/tool.json`
- **THEN** only minio legs run and mailpit and stripe-mock legs are absent from the plan

#### Scenario: One dialect changed
- **WHEN** a pull request changes `cli/src/tools/dialects/python.ts`
- **THEN** every tool's python legs run and no other appType runs

#### Scenario: Shared code changed
- **WHEN** a pull request changes `cli/src/commands/tool.ts`
- **THEN** every leg runs

#### Scenario: Unrelated change
- **WHEN** a pull request changes only docs
- **THEN** no leg runs and the gate passes

### Requirement: Every tool proves a real function
Each tool's leg SHALL prove its emulated function, not only its health route.

#### Scenario: Mail
- **WHEN** the consumer sends one message over SMTP
- **THEN** Mailpit's API lists it

#### Scenario: Storage
- **WHEN** the consumer puts an object through the S3 API
- **THEN** a get returns the same bytes

#### Scenario: Payments
- **WHEN** the consumer creates a PaymentIntent
- **THEN** stripe-mock returns an object with status `requires_payment_method`

### Requirement: Axes are covered
`tests/e2e/axes.json` SHALL gain a `tool` axis where every catalog id has a leg or an allowlist entry with an issue number, checked by `check-axes.mjs`.

#### Scenario: Tool without a leg
- **WHEN** a catalog entry has neither leg nor allowlist
- **THEN** `check-axes.mjs` fails
