# Flisk overnight report

PR: https://github.com/flisk-sh/flisk/pull/4482 (branch `feat/agent-runtime-weakness`). Not merged, not deployed.

## 1. Summary
One improvement: `flisk logs --source runtime|build` and the MCP `logs` tool's `source` parameter, plus a `next` hint in `status --json` readiness failures that names the exact `logs` call. An agent can now read why a service crashed without wading through image-build output.

## 2. Areas inspected
`cli/src/mcp/` (24 tools), `commands/logs.ts`, `commands/status.ts`, `utils/tilt-logs.ts`, `utils/service-runtime-state.ts`, `utils/up-readiness.ts`, `utils/startup-report.ts`, `docs/agents/`, the agent skills, existing logs and MCP tests. Not read in depth: `runtime/engine`, `runtime/discovery`, `scripts/benchmark/agent-with-vs-without/`.

## 3. Biggest weakness found
When a service crashes, `status` gives only a generic failed-health-check message. The cause is in `logs`, but the snapshot is mostly build output and the tool cannot select by source.

## 4. Why it matters
An agent has a limited context. Reading 82 lines, 76 of them docker build commands, to find 6 useful ones wastes it and risks missing the cause when `tail` is small.

## 5. Exact improvement
`--source runtime|build` on `flisk logs` and `source` (enum) on the MCP `logs` tool. Local-process logs count as runtime. `--tail` counts the lines kept. Redaction runs after the filter. The envelope gains `source` only when the flag is used.

## 6. Files changed
`cli/src/commands/logs.ts`, `cli/src/utils/tilt-logs.ts`, `cli/src/mcp/tools.ts`, tests (`logs.test.ts`, `logs-help.test.ts`, `mcp/__tests__/tools.test.ts`), `cli/src/commands/command-specs.generated.ts`, `cli/dist/*`, `docs/agents/{flisk-for-agents.md,llms.txt,llms-full.txt}`.

## 7. Commits and PR
2b6d1a36f18 (logs --source), f376b769b0a (status `next` hint), 79d71354de4 (logs description as a double-quoted literal so the tool-consistency scorer reads it), plus a final fix removing inner double quotes so Biome and the scorer agree. All signed off. PR 4482.

## 8. Commands run and results
- `bun run typecheck`: exit 0. `bun run build`: exit 0. `bun run lint`: exit 0 (169 warnings, none new).
- `vitest run src/commands/__tests__/logs src/mcp`: 6 files, 194 tests pass.
- `bash tests/e2e/static/skills-and-docs.sh`: exit 0.
- `bun run check:dist`: reports stale until the rebuilt dist is committed; it is committed in 2b6d1a36f18 but I did not re-run it after the commit.

## 9. Full test results
`bun run test` (full CLI suite): 35 failed, 7390 passed, 11 skipped. The same 13 files fail with the same 35 failures on a clean main checkout, so they are not from this change. They are not fixed here. Note: a running Flisk stack on port 10350 also makes the logs tests fail locally (they read the default Tilt port), so stop stacks before running them.

## 10. End-to-end evidence
Real MCP server, real Docker/Tilt stack, injected crash in the api. `logs` without source: 82 lines (76 build). With `source: "runtime"`: 6 lines including `BOOM: DATABASE_URL missing` and its stack. Source restored, `resource_restart`, `status`: `ready: true`. Stack then taken down.

## 11. Benchmark results
Not run. I did not check the budget for `scripts/benchmark/agent-with-vs-without/`, and it may cost API money.

## 12. Failures and limitations
- A CI bot (`github-actions[bot]`) pushed a Biome autofix that single-quoted the `logs` description and broke the tool-consistency scorer; the description now avoids inner double quotes.
- The agent skills were not updated (they are synced from the flisk-skills repo).
- Not run: the demo e2e (`tests/e2e/journeys/demo`), `make test-shell`, Windows. My change touches only `logs`, but I have no run of the demo to show.
- The text-mode Tilt path with `--source` now asks Tilt for JSON and prints `resource | text`; I tested it only through mocks plus the JSON path on a live stack.

## 13. Work not done
Skills text (synced from flisk-skills), benchmark, demo e2e.

## 14. Next three improvements
1. Attach the last runtime lines to a failed resource in `status`, and name `logs` for pending reasons too.
2. Give pending resources a reason and make `readiness.enabled` order deterministic.
3. Return structured JSON from the scaffolding tools (`project_init`, `resource_create`) instead of text.
