## Context

`quickstart-e2e.yml` already shows the house pattern: SHA-pinned actions, version-selection step (`local` on PRs via `npm pack`, published package otherwise), pinned Tilt with checksum, 30-minute timeout, per-PR concurrency. The agent workflow reuses it so the two behave alike.

## Decisions

### Workflow shape
- Triggers, permissions (`contents: read`), runner (`ubuntu-latest`) and `workflow_run` guard (`conclusion == 'success'`, checks out main itself) copied from quickstart.
- Concurrency: per-PR group with `cancel-in-progress` on PRs only. Release and nightly runs queue and are never cancelled mid-boot.
- Top step prints Node, Docker, Tilt and `tdk --version` plus the tested commit SHA (evidence item 5).
- Each case is its own named step (`A4 session checkpoint envelope`, `B2 timeout bound`, ...) so a red step points to one behavior. Steps after a failing one use `if: always()` where independent, so one run reports every broken case.
- No fixed `sleep`: a shared `poll_until <desc> <timeout> <cmd>` helper retries with a bounded deadline and, on timeout, prints the description and tails logs before failing.
- `if: failure()` artifact step uploads status, logs, `docker ps -a`, agent `docker logs`, Tilt resource list.

### Test code location
Assertions live in a script (`scripts/agent-e2e.sh` plus small Node helpers for JSON-RPC and stub servers), not inline YAML, so contributors can run them locally against a stack. JSON failure cases use the existing `machine-output-contract` helper to assert exactly one parseable envelope on stdout and nothing else.

### Decision: `tdk agent sessions` goes through Traefik
The first CI run showed the agent's port is not published on the host (`hostPort: null`), so the original `127.0.0.1:<port>/session` call could never work on a real stack. The CLI now uses the route `tdk status` reports as `url`, resolved via `buildServicePorts` and the host port plan. `*.localhost` is dialed as loopback with a `Host` header. Traefik 502/503/504 and plain-text 404 map to `AGENT_NOT_RUNNING`.

### Error-path fixtures
- Timeout and stalled body: a Node stub standing in for the ingress (the CLI is pointed at it with `TDK_SERVICE_BASE_URL`) after the real container is stopped. One accepts and never replies; one sends headers then stalls the body. Elapsed time is measured and asserted within 9-15s.
- `AGENT_REQUEST_FAILED`: stub returning 400/500 with `{"error": "..."}`; assert status and text appear in the message.
- `TILT_NOT_RUNNING` after `tdk down`; `TILT_TRIGGER_FAILED` via `tdk restart no-such-resource --json`.

### Decision: `tdk agent sessions` without `--session-id`
Options: (a) require `--session-id`, (b) list sessions when omitted.

Chosen: **(a) require it.** The runtime contract (`GET /session` keyed by `x-session-id`) has no list endpoint and this change must not alter the runtime contract (out of scope). Option (b) would need a new endpoint on every agent runtime. With (a) the CLI fails fast with a usage error and a hint, instead of a confusing `AGENT_REQUEST_FAILED` 400 from the agent. The check runs before any network call, after resource validation so `UNKNOWN_RESOURCE`/`NOT_AN_AGENT` keep their precedence. Error code: `SESSION_ID_REQUIRED` (JSON envelope; human mode prints a TdkError with the usage hint). MCP `get_agent_sessions` makes `sessionId` required in its input schema.

This is a user-visible CLI behavior change; flagging for maintainer confirmation before implementation.

### MCP section
A Node test spawns `tdk mcp`, speaks newline-delimited JSON-RPC over stdio (`initialize`, `tools/list`, `tools/call`), and compares each tool payload to the corresponding CLI `--json` envelope run against the same live stack. Includes `projectPath` from a different cwd and an unknown-resource call that must return a structured tool error while the server stays alive (a following call still answers).

### Distribution and docs (section D)
Run on the same job but need no stack, so they execute first and fail fast: symlink resolution in `.agents/skills`, `sync-tdk-skills.sh` against a temp fixture source repo (keeps `flisk-agent-ops`, deletes a skill removed upstream), and a link checker over `README.md`, `docs/**`, `AGENTS.md` (relative links, anchors, no references to removed `llms.txt`/`llms-full.txt`/`docs/ai-agents.md`, all `docs/agents/llms*.txt` links resolve).

## Risks / Trade-offs

- Runtime: a full boot plus restart/durability cycles may approach the limit; mitigated by reusing one stack for A, B and C and keeping drain test turns short.
- Flakiness from image pulls: bounded polling with generous but finite deadlines; failure artifacts make reruns unnecessary.
- Becoming a required check on a path-filtered workflow: GitHub reports skipped required checks as pending. Use a lightweight always-running gate job, or follow how other path-filtered required checks are handled in this repo.
- Evidence items 1-6 are partly manual (a deliberate break, links to green runs); they are tasks, not CI output.
