Tracking issue: [#1268](https://github.com/flisk-sh/flisk/issues/1268)

## Why

The agent surface from #1256 / #1263 / #1266 is merged (`agent` resource type, `flisk agent sessions`, `flisk restart`, MCP tools `list_agents`, `get_agent_sessions`, `restart_resource`, the `flisk-agent-ops` skill). Unit and spawn-level tests cover error paths and JSON envelopes, but no CI job runs an agent through `flisk up`. A release needs end-to-end evidence on a real stack, and a regression such as the `session` nesting or the 10s timeout would currently ship unnoticed.

One known gap is also unresolved: the scaffolded runtime answers `GET /session` with 400 when `x-session-id` is missing, so `flisk agent sessions bot` without `--session-id` fails with `AGENT_REQUEST_FAILED`.

## What Changes

- Add `.github/workflows/agent-e2e.yml`, modeled on `quickstart-e2e.yml` (PR on listed paths, `workflow_dispatch` with `version`, nightly, `workflow_run` after "Release binaries and npm package").
- Implement test sections A-D from the issue, each case a separate named step: happy path on a live stack, error paths against real processes, MCP over stdio, distribution and docs checks.
- Upload failure artifacts (`flisk status --json`, `flisk logs --json`, `docker ps -a`, agent `docker logs`, Tilt resource list) and print tool versions at the top of the job.
- Settle the `/session` gap: `flisk agent sessions` requires `--session-id` and fails with a clear usage error before any request (see design.md). Encode it in a unit test and an e2e case.
- Make `agent-e2e` a required check for PRs touching the listed paths.

Out of scope: new agent features, non-Linux full-stack runs (Windows keeps CLI smoke coverage), changes to the agent runtime contract.

## Capabilities

### New Capabilities
- `agent-e2e-verification`: CI proof that the agent resource, session inspection, restart and MCP tools work on a live stack.

- `agent-session-inspection`: `flisk agent sessions` and MCP `get_agent_sessions` require a session id and fail with `SESSION_ID_REQUIRED` otherwise.

### Modified Capabilities
None. No agent capability exists in `openspec/specs` yet.

## Impact

- New: `.github/workflows/agent-e2e.yml`, e2e scripts under `scripts/` (or `cli/e2e/`), stub servers for the timeout and stalled-body cases.
- Changed: `cli/src/commands/agent.ts`, `cli/src/mcp/tools.ts` (session-id requirement), their unit tests, docs mentioning `flisk agent sessions`.
- Branch protection: required-check list updated (repo admin action).
- Release process: release is cut only after the evidence comments 1-6 are posted on #1268; the release notes link the issue.
