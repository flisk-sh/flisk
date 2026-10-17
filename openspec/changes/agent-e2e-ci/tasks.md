## 1. Decide and implement the session-id behavior
- [x] 1.1 Maintainer confirms: `tdk agent sessions` requires `--session-id` (design.md)
- [x] 1.2 `cli/src/commands/agent.ts`: `SESSION_ID_REQUIRED` error (JSON + human) before any request, after resource validation
- [x] 1.3 `cli/src/mcp/tools.ts`: require `sessionId` in `get_agent_sessions`; update unit tests and docs/skill text

## 2. Workflow skeleton
- [x] 2.1 `.github/workflows/agent-e2e.yml` with triggers, paths, permissions, SHA-pinned actions, concurrency, 30 min timeout
- [x] 2.2 Version-selection step (`npm pack` on PRs, published package otherwise) and pinned Tilt install
- [x] 2.3 Tool-versions and commit-SHA step at the top of the job
- [x] 2.4 Bounded `poll_until` helper; no fixed sleeps
- [x] 2.5 `if: failure()` artifact upload (status, logs, `docker ps -a`, agent logs, Tilt resources)

## 3. Section A: happy path
- [ ] 3.1 Scaffold (`tdk project --yes`, `tdk resource bot --type agent`), `tdk up`, poll `tdk status --json` until ready
- [ ] 3.2 `/health` and `/ready` direct and via Traefik `bot.localhost`
- [ ] 3.3 Checkpoint write and `tdk agent sessions bot --session-id s1 --json` envelope (nesting, array reply, `agent`/`port` not overwritten)
- [ ] 3.4 Sticky routing through Traefik
- [ ] 3.5 `tdk restart bot --json`, healthy again, checkpoint intact
- [ ] 3.6 Durability across `tdk down`/`tdk up`; gone after `docker volume rm`
- [ ] 3.7 Graceful drain: SIGTERM during an in-flight turn

## 4. Section B: error paths
- [ ] 4.1 `AGENT_NOT_RUNNING` with container stopped
- [ ] 4.2 Timeout stub and stalled-body stub, elapsed within 9-15s
- [ ] 4.3 `AGENT_REQUEST_FAILED` with status and agent error text
- [ ] 4.4 `TILT_NOT_RUNNING`, `TILT_TRIGGER_FAILED`
- [ ] 4.5 One smoke each for `UNKNOWN_RESOURCE`, `NOT_AN_AGENT`, `NO_PORT`, and `SESSION_ID_REQUIRED`
- [ ] 4.6 Assert exactly one parseable envelope on stdout for every JSON failure (`machine-output-contract` helper)

## 5. Section C: MCP over stdio
- [ ] 5.1 JSON-RPC client helper; `initialize` and `tools/list` include the three tools
- [ ] 5.2 Each tool call payload equals the CLI `--json` envelope
- [ ] 5.3 `projectPath` from another cwd; unknown resource gives a structured tool error and the server survives

## 6. Section D: distribution and docs
- [x] 6.1 `.claude/skills` to `.agents/skills` symlink check, no dangling links
- [x] 6.2 `sync-tdk-skills.sh` fixture test
- [x] 6.3 Link and anchor check over `README.md`, `docs/**`, `AGENTS.md`; removed-file references; `docs/agents/llms*.txt`

## 7. Release evidence (comments on #1268)
- [ ] 7.1 Link green `agent-e2e` run on `main` and one green nightly
- [ ] 7.2 Raw section A output
- [ ] 7.3 Raw section B output with measured timings
- [ ] 7.4 MCP `tools/list` and one `tools/call` per tool
- [ ] 7.5 Tool versions and tested commit SHA
- [ ] 7.6 Deliberate-break run (revert `session` nesting or the timeout) shown red
- [ ] 7.7 Add `agent-e2e` to required checks; cut the release with #1268 linked in the notes

## 8. Review
- [x] 8.1 Validate the OpenSpec change (`openspec validate agent-e2e-ci`)
