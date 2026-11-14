## ADDED Requirements

### Requirement: Tools are infrastructure presets
`flisk tool add <tool>` SHALL create the same resource that `flisk resource <name> --type <kind> --framework <tool>` creates from `INFRA_PRESETS`, and SHALL NOT introduce a second catalog or a new `service.json` field.

#### Scenario: Storage type
- **WHEN** `flisk resource store --type storage --yes` runs
- **THEN** a MinIO bring-your-own resource is written, and `--type database --framework minio` fails naming `--type storage --framework minio`

#### Scenario: Same output as resource
- **WHEN** `flisk tool add mailpit --yes` and the equivalent `flisk resource` flags run in two fresh projects
- **THEN** both `service.json` files are identical

### Requirement: Prompts have flags and never block agents
`flisk tool add` SHALL ask for the tool, the consuming resource, app type, framework, persistence and port, in that order, and each SHALL have a flag. With `--yes` or `--json` it SHALL ask nothing and use defaults.

#### Scenario: Agent invocation
- **WHEN** `flisk tool add minio --for api --json` runs
- **THEN** one JSON envelope is printed, no prompt appears, and `api` has `dependsOn` minio and the S3 env block

### Requirement: Env dialect follows the consumer
The injected variables SHALL use the dialect of the consumer's app type and framework.

#### Scenario: Next.js frontend
- **WHEN** `--for web` where `web` is a `next` frontend
- **THEN** only `NEXT_PUBLIC_`-prefixed variables reach the browser bundle; secrets are not prefixed

### Requirement: Unknown input fails clearly
An unknown tool SHALL fail with `TOOL_UNKNOWN` listing valid ids; an unknown `--for` with `TOOL_CONSUMER_NOT_FOUND`.

#### Scenario: Unknown tool
- **WHEN** `flisk tool add stripe` runs
- **THEN** exit code is 1 with code `TOOL_UNKNOWN` and the hint lists `mailpit, minio, stripe-mock`

### Requirement: Listing
`flisk tool list --json` SHALL list id, category, emulated providers, image and default port.

#### Scenario: List
- **WHEN** `flisk tool list --json` runs
- **THEN** it contains the three first-wave tools
