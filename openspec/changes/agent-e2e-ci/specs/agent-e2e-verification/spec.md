## ADDED Requirements

### Requirement: Agent e2e workflow
The repository SHALL provide an `agent-e2e` GitHub Actions workflow that runs an `agent` resource through `flisk up` on `ubuntu-latest` with a 30 minute limit and `contents: read` permission.

#### Scenario: Workflow present
- **WHEN** the repository is checked out
- **THEN** `.github/workflows/agent-e2e.yml` exists with a 30 minute timeout and `contents: read` permission

### Requirement: Workflow triggers
The workflow SHALL run on pull requests to `main` touching the agent, restart, MCP, agent-runtime, engine, skills or sync-script paths or the workflow itself, on manual dispatch with a `version` input, nightly, and after a successful "Release binaries and npm package" run. Pull requests SHALL test their own packed CLI; all other triggers SHALL test a published package.

#### Scenario: Manual dispatch
- **WHEN** the workflow is dispatched with a `version` input
- **THEN** it tests that published version

#### Scenario: Pull request changes agent code
- **WHEN** a pull request modifies `cli/src/commands/agent.ts`
- **THEN** `agent-e2e` runs against `npm pack` of that checkout

#### Scenario: Release published
- **WHEN** "Release binaries and npm package" completes successfully on `main`
- **THEN** `agent-e2e` tests the version in `main`'s `package.json`

#### Scenario: Superseded pull request run
- **WHEN** a newer commit is pushed to the same pull request
- **THEN** the older `agent-e2e` run is cancelled, and release and nightly runs are never cancelled

### Requirement: Debuggable and deterministic runs
The workflow SHALL print Node, Docker, Tilt and `flisk` versions and the tested commit SHA, SHALL wait only through bounded polling that fails with a clear message, and SHALL upload `flisk status --json`, `flisk logs --json`, `docker ps -a`, the agent's `docker logs` and the Tilt resource list when it fails. Each test case SHALL be a separate named step.

#### Scenario: Stack never becomes ready
- **WHEN** `bot` is not ready within the polling deadline
- **THEN** the step fails with a timeout message and the failure artifacts are uploaded

### Requirement: Live-stack happy path
The workflow SHALL verify health and readiness directly and through Traefik, the `flisk agent sessions` JSON envelope, sticky routing by `x-session-id`, `flisk restart`, checkpoint durability across `flisk down`/`flisk up` and its loss after the volume is removed, and graceful drain on SIGTERM.

#### Scenario: Session envelope
- **WHEN** a checkpoint was written for `x-session-id: s1` and `flisk agent sessions bot --session-id s1 --json` runs
- **THEN** stdout is one envelope with `schemaVersion`, `errors: []` and `data: { agent, port, session }`, with `session` nested and unaffected by `agent`/`port` keys in the agent's reply

#### Scenario: Restart keeps data
- **WHEN** `flisk restart bot --json` completes
- **THEN** it returns `data: { resource: "bot", restarted: true }`, the agent is healthy, and the earlier checkpoint is readable

#### Scenario: Drain
- **WHEN** the agent receives SIGTERM during an in-flight turn
- **THEN** the turn completes and no checkpoint is truncated

### Requirement: Real-process error paths
The workflow SHALL exercise `AGENT_NOT_RUNNING`, connection timeout, stalled response body, `AGENT_REQUEST_FAILED`, `TILT_NOT_RUNNING`, `TILT_TRIGGER_FAILED`, and one smoke case each for `UNKNOWN_RESOURCE`, `NOT_AN_AGENT`, `NO_PORT` and `SESSION_ID_REQUIRED`. Every JSON failure SHALL print exactly one parseable envelope on stdout and nothing else.

#### Scenario: Agent never replies
- **WHEN** a stub on the agent port accepts the connection and never replies
- **THEN** the CLI exits 1 with `AGENT_NOT_RUNNING` after 9 to 15 seconds and does not hang

#### Scenario: Stalled body
- **WHEN** a stub sends headers and then stalls the body
- **THEN** the same time bound and error code apply

#### Scenario: Tilt not running
- **WHEN** `flisk restart bot --json` runs after `flisk down`
- **THEN** it exits 1 with code `TILT_NOT_RUNNING`

### Requirement: MCP over stdio
The workflow SHALL spawn `flisk mcp`, and over JSON-RPC verify that `tools/list` includes `list_agents`, `get_agent_sessions` and `restart_resource`, that each tool's payload equals the matching CLI `--json` envelope on the live stack, that `projectPath` works from a different working directory, and that an unknown resource returns a structured tool error without terminating the server.

#### Scenario: Unknown resource over MCP
- **WHEN** `get_agent_sessions` is called for a resource that does not exist
- **THEN** a structured tool error is returned and a later call on the same server still succeeds

### Requirement: Skills and docs distribution checks
The workflow SHALL verify that every directory in `.claude/skills` has a resolving symlink in `.agents/skills` and none dangles, that `scripts/sync-tdk-skills.sh` keeps `flisk-agent-ops` and deletes a skill removed upstream when run against a fixture source repo, and that links and anchors in `README.md`, `docs/**` and `AGENTS.md` resolve with no references to the removed root `llms.txt`, `llms-full.txt` or `docs/ai-agents.md`.

#### Scenario: Dangling skill symlink
- **WHEN** a link in `.agents/skills` points to a missing directory
- **THEN** the check fails naming the link
