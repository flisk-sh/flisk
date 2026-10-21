## ADDED Requirements

### Requirement: BYO resource creation honors an explicit port
When a user creates a BYO resource with a valid `--port` value, the CLI MUST use that value in its user-facing port output and in the generated `service.json` `port` field.

#### Scenario: Create a BYO resource with a custom port
- **WHEN** the user runs `flisk resource legacy --type byo --stack shop --port 4500 --yes`
- **THEN** the CLI prints `Port: 4500`
- **AND** `services/shop/legacy/service.json` contains `.port == 4500`

### Requirement: BYO port validation remains compatible
The CLI MUST continue to accept BYO ports only in the range 4000–5999 and MUST preserve existing BYO port error strings.

#### Scenario: Reject a BYO port outside the supported range
- **WHEN** the user supplies a BYO port below 4000 or above 5999
- **THEN** resource creation fails with the existing BYO port error text
