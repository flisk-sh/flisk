# Self-Contained Generated Projects

## ADDED Requirements

### Requirement: Generated Services Compile On First Run

Generated backend services must always emit valid Bun source code.

#### Scenario: Backend template with banner logs

- **WHEN** a user runs `flisk resource api --type backend --stack pre-alpha --path services/pre-alpha/api`
- **THEN** the generated `src/index.ts` contains `console.log('\n🚀 api running ...')` with an escaped `\n`
- **AND** `bun run src/index.ts` starts the server without a syntax error

#### Scenario: Health endpoint serves

- **WHEN** the generated service is running
- **THEN** `GET /health` responds `{"status":"ok","service":"<name>"}`

### Requirement: Extension Vendored Into Generated Projects

Every generated project must contain the Flisk Tilt extension so `flisk up` works offline.

#### Scenario: Project generation

- **WHEN** a user runs `flisk project --yes`
- **THEN** `.tdk/.tdk-out/tdk-cli-ext/` is created containing `Tiltfile`, `engine/`, `discovery/`, `specs/`, and `ext/`
- **AND** the generation log reports `Vendored Flisk extension -> .tdk/.tdk-out/tdk-cli-ext/`

#### Scenario: Extension source auto-detection

- **WHEN** generating a project
- **THEN** the extension source is resolved in order: `$TDK_EXTENSION_SOURCE`, an executable-adjacent `tdk-cli` checkout, then a `../tdk-cli` sibling of the project root

### Requirement: Tiltfile Loads Extension Locally

The generated Tiltfile must resolve the extension without any GitHub dependency.

#### Scenario: Vendored copy present

- **WHEN** `.tdk/.tdk-out/tdk-cli-ext/` exists next to the Tiltfile
- **THEN** the Tiltfile registers `file://<vendored path>` as the extension repo
- **AND** `load('ext://tdk-cli', ...)` succeeds without cloning

#### Scenario: Explicit extension path override

- **WHEN** the vendored copy is absent but `$TDK_EXTENSION_PATH` points at a valid tdk-cli checkout
- **THEN** the Tiltfile uses that path

#### Scenario: No extension available

- **WHEN** neither the vendored copy nor `$TDK_EXTENSION_PATH` exists
- **THEN** loading fails fast with a single actionable error listing the three recovery options, with no retry loop

### Requirement: No Machine-Specific Paths In Generated Output

Generated Tiltfiles must never contain hardcoded author or machine paths.

#### Scenario: Fresh generation on any machine

- **WHEN** any user generates a project
- **THEN** the generated `Tiltfile` has no absolute host-specific paths and no private GitHub repo URL fallback

#### Scenario: Local probe is truthful

- **WHEN** the Tiltfile probes for the vendored directory
- **THEN** the probe echoes its outcome (`test -d <path> && echo yes || echo no`) so detection reflects the filesystem